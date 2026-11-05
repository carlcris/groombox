-- The floor and calendar functions: client search, notes, walk-ins, staff appointments, the visit
-- status moves, rescheduling, and merging clients. Uses the seeded Haven Spa and Kanto Barbers
-- (supabase/seed.sql): Makati's floor today has a waiting walk-in (queue 1), Carlo's arrived
-- appointment, and Jenny's walk-in in service (queue 2). Playwright runs may have added walk-ins
-- since, so queue numbers are checked against the day's last number.
--
-- Ways these could fail, each covered below:
--  1. search_clients reaches another organization's clients, returns notes, ignores the page bound,
--     or answers a guest, another branch's member, or a restricted organization's member.
--  2. Staff read client notes, directly or through get_client_notes.
--  3. Walk-ins get a repeated queue number, a deposit or fee, or a client record in another
--     organization; a failure after the client record leaves it behind.
--  4. Starting a walk-in double-books the staff member, or a status move runs from the wrong status.
--  5. A staff-entered appointment carries a deposit or fee, or overlaps another booking.
--  6. Rescheduling changes the booking's length, keeps the old business date, overlaps another
--     booking, moves a visit already in service, or forgets to tell an online client.
--  7. merge_clients loses bookings or notes, merges records linked to two accounts, or runs for staff.
--  8. The floor's "today" differs from the shared business date.

begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

create temporary table fixture (key text primary key, id uuid not null);
grant select, insert on fixture to authenticated;

create function pg_temp.fixture_id(p_key text) returns uuid language sql stable as $$
  select id from fixture where key = p_key;
$$;
grant execute on function pg_temp.fixture_id(text) to authenticated;

create function pg_temp.act_as(p_user_id uuid, p_is_anonymous boolean) returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated', 'is_anonymous', p_is_anonymous)::text,
    true
  );
$$;

create function pg_temp.at_local(p_days_ahead integer, p_time time) returns timestamptz language sql stable as $$
  select (private.business_date(now(), 'Asia/Manila', '05:00') + p_days_ahead + p_time) at time zone 'Asia/Manila';
$$;
grant execute on function pg_temp.at_local(integer, time) to authenticated;

insert into fixture (key, id) values
  ('makati', '30000000-0000-0000-0000-000000000001'),
  ('bgc', '30000000-0000-0000-0000-000000000002'),
  ('cubao', '30000000-0000-0000-0000-000000000003'),
  ('haircut', '60000000-0000-0000-0000-000000000003'),
  ('jenny', '70000000-0000-0000-0000-000000000001'),
  ('carlo', '70000000-0000-0000-0000-000000000002'),
  ('lea', '70000000-0000-0000-0000-000000000003'),
  ('owner', '10000000-0000-0000-0000-000000000002'),
  ('bgc_manager', '10000000-0000-0000-0000-000000000003'),
  ('makati_staff', '10000000-0000-0000-0000-000000000004'),
  ('restricted_staff', '10000000-0000-0000-0000-000000000006'),
  ('client', '10000000-0000-0000-0000-000000000007'),
  ('guest', '10000000-0000-0000-0000-000000000008'),
  ('bea_haven', '90000000-0000-0000-0000-000000000001'),
  ('ana_haven', '90000000-0000-0000-0000-000000000002'),
  ('bea_kanto', '90000000-0000-0000-0000-000000000003'),
  ('rico', '90000000-0000-0000-0000-000000000004');

-- Sixty more Haven clients named Zed, to check the page bound.
insert into public.clients (organization_id, full_name)
select '20000000-0000-0000-0000-000000000001', 'Zed ' || n from generate_series(1, 60) as n;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Client search
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
select results_eq(
  $$ select id from public.search_clients(pg_temp.fixture_id('makati'), 'bea') $$,
  $$ values (pg_temp.fixture_id('bea_haven')) $$,
  'staff find a client by part of the name, only in their organization'
);
select results_eq(
  $$ select id, full_name, mobile_number from public.search_clients(pg_temp.fixture_id('makati'), '0505') $$,
  $$ values (pg_temp.fixture_id('rico'), 'Rico Dela Cruz', '0918 555 0505') $$,
  'staff find a client by digits of the mobile number, and get the name and number'
);
select is(
  (select count(*)::integer from public.search_clients(pg_temp.fixture_id('makati'), 'zed', 500)),
  50,
  'a page holds at most 50 clients'
);
select is(
  (select count(*)::integer from public.search_clients(pg_temp.fixture_id('makati'), 'zed', 50, 50)),
  10,
  'the next page continues from the offset'
);
select is(
  (select count(*)::integer from public.search_clients(pg_temp.fixture_id('makati'), '%')),
  0,
  'a percent sign is matched as itself, not as a wildcard'
);
select ok(
  not exists (
    select 1
    from pg_proc p, unnest(p.proargnames) as argument (name)
    where p.proname = 'search_clients' and argument.name like '%notes%'
  ),
  'search_clients has no notes column'
);
select pg_temp.act_as(pg_temp.fixture_id('bgc_manager'), false);
select throws_ok(
  $$ select * from public.search_clients(pg_temp.fixture_id('makati'), 'bea') $$,
  'GBA02', 'not_permitted',
  'another branch''s manager cannot search from this branch'
);
select pg_temp.act_as(pg_temp.fixture_id('restricted_staff'), false);
select throws_ok(
  $$ select * from public.search_clients(pg_temp.fixture_id('cubao'), 'bea') $$,
  'GBA02', 'not_permitted',
  'a restricted organization''s staff cannot search'
);
select pg_temp.act_as(pg_temp.fixture_id('guest'), true);
select throws_ok(
  $$ select * from public.search_clients(pg_temp.fixture_id('makati'), 'bea') $$,
  'GBA01', 'sign_in_required',
  'a guest cannot search'
);

-- ---------------------------------------------------------------------------
-- 2. Notes stay with the owner and managers
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
select throws_ok(
  $$ select notes from public.clients where id = pg_temp.fixture_id('rico') $$,
  '42501', null,
  'staff cannot read client notes'
);
select is(
  (select full_name from public.clients where id = pg_temp.fixture_id('rico')),
  'Rico Dela Cruz',
  'staff still read the name of a client on their branch''s bookings'
);
select throws_ok(
  $$ select public.get_client_notes(pg_temp.fixture_id('rico')) $$,
  'GBA02', 'not_permitted',
  'staff cannot read notes through get_client_notes'
);
select pg_temp.act_as(pg_temp.fixture_id('bgc_manager'), false);
select is(
  public.get_client_notes(pg_temp.fixture_id('rico')),
  'Sensitive to strong hair dyes. Patch test first.',
  'a manager reads the notes'
);

-- ---------------------------------------------------------------------------
-- 3. Walk-ins
-- ---------------------------------------------------------------------------

reset role;
create temporary table queue_before as
select coalesce(max(queue_number), 0) as last_number
from public.bookings
where branch_id = pg_temp.fixture_id('makati') and source = 'walk_in'
  and business_date = private.business_date(now(), 'Asia/Manila', '05:00');
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
insert into fixture select 'walk_in_new', public.add_walk_in(pg_temp.fixture_id('makati'), array[pg_temp.fixture_id('haircut')],
  null, 'Nico Walk', '0919 000 1111');
insert into fixture select 'walk_in_bea', public.add_walk_in(pg_temp.fixture_id('makati'), array[pg_temp.fixture_id('haircut')],
  pg_temp.fixture_id('bea_haven'), null, null, pg_temp.fixture_id('carlo'));
reset role;

select results_eq(
  $$ select source::text, status::text, queue_number, business_date, staff_id, start_at, deposit_amount, convenience_fee,
       amount_due, service_total
     from public.bookings where id in (pg_temp.fixture_id('walk_in_new'), pg_temp.fixture_id('walk_in_bea')) order by queue_number $$,
  $$ select 'walk_in', 'waiting', (last_number + 1)::smallint, private.business_date(now(), 'Asia/Manila', '05:00'), null::uuid,
       null::timestamptz, 0::numeric(20,2), 0::numeric(20,2), 0::numeric(20,2), 350::numeric(20,2)
     from queue_before
     union all
     select 'walk_in', 'waiting', (last_number + 2)::smallint, private.business_date(now(), 'Asia/Manila', '05:00'),
       pg_temp.fixture_id('carlo'), null::timestamptz, 0::numeric(20,2), 0::numeric(20,2), 0::numeric(20,2), 350::numeric(20,2)
     from queue_before $$,
  'walk-ins wait with the next queue numbers for the business date, a staff preference, and no deposit or fee'
);
select results_eq(
  $$ select c.full_name, c.mobile_number, c.organization_id, c.user_id from public.bookings b join public.clients c on c.id = b.client_id
     where b.id = pg_temp.fixture_id('walk_in_new') $$,
  $$ values ('Nico Walk', '0919 000 1111', '20000000-0000-0000-0000-000000000001'::uuid, null::uuid) $$,
  'a new walk-in gets a client record in the organization'
);
select results_eq(
  $$ select service_name, price from public.booking_services where booking_id = pg_temp.fixture_id('walk_in_new') $$,
  $$ values ('Haircut', 350.00::numeric(20,2)) $$,
  'the walk-in''s services are snapshotted'
);
select ok(
  exists (select 1 from public.activity_logs where action = 'booking.walk_in_added' and entity_id = pg_temp.fixture_id('walk_in_new')),
  'adding a walk-in writes its activity row'
);

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
select throws_ok(
  $$ select public.add_walk_in(pg_temp.fixture_id('makati'), array[pg_temp.fixture_id('haircut')], pg_temp.fixture_id('bea_kanto')) $$,
  '23503', null,
  'a walk-in cannot name another organization''s client record'
);
select pg_temp.act_as(pg_temp.fixture_id('restricted_staff'), false);
select throws_ok(
  $$ select public.add_walk_in(pg_temp.fixture_id('cubao'), array['60000000-0000-0000-0000-000000000005'::uuid], null, 'X') $$,
  'GBA02', 'not_permitted',
  'a restricted organization''s staff cannot add walk-ins'
);
reset role;

-- A failure after the new client record and the booking were written leaves neither behind.
create function pg_temp.fail_booking_services() returns trigger language plpgsql as $$
begin
  raise exception 'forced failure';
end;
$$;
create trigger forced_failure before insert on public.booking_services
  for each row execute function pg_temp.fail_booking_services();
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
select throws_ok(
  $$ select public.add_walk_in(pg_temp.fixture_id('makati'), array[pg_temp.fixture_id('haircut')], null, 'Fay Failing') $$,
  'P0001', 'forced failure',
  'a failure while saving the services fails the walk-in'
);
reset role;
select is(
  (select count(*)::integer from public.clients where full_name = 'Fay Failing'),
  0,
  'the failed walk-in leaves no client record behind'
);
drop trigger forced_failure on public.booking_services;

-- ---------------------------------------------------------------------------
-- 4. Starting service, checking in, no-shows
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
select throws_ok(
  $$ select public.start_service(pg_temp.fixture_id('walk_in_bea')) $$,
  'GBF01', 'staff_busy',
  'a walk-in cannot start with a staff member whose arrived client is in that time'
);
select lives_ok(
  $$ select public.start_service(pg_temp.fixture_id('walk_in_new'), pg_temp.fixture_id('lea')) $$,
  'a walk-in starts with a free staff member'
);
reset role;
select results_eq(
  $$ select status::text, staff_id, start_at, end_at - start_at, started_at from public.bookings where id = pg_temp.fixture_id('walk_in_new') $$,
  $$ values ('in_service', pg_temp.fixture_id('lea'), now(), interval '45 minutes', now()) $$,
  'the walk-in takes a calendar slot from now for its services'
);
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
select throws_ok(
  $$ select public.start_service(pg_temp.fixture_id('walk_in_new'), pg_temp.fixture_id('lea')) $$,
  'GBF02', 'visit_status_changed',
  'a visit in service cannot start again'
);
reset role;
create temporary table arrived_before as
select start_at, end_at from public.bookings where id = '80000000-0000-0000-0000-000000000011';
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
select lives_ok(
  $$ select public.start_service('80000000-0000-0000-0000-000000000011') $$,
  'an arrived appointment starts'
);
reset role;
select results_eq(
  $$ select status::text, start_at, end_at, started_at from public.bookings where id = '80000000-0000-0000-0000-000000000011' $$,
  $$ select 'in_service', start_at, end_at, now() from arrived_before $$,
  'an appointment keeps its booked range when it starts'
);

-- ---------------------------------------------------------------------------
-- 5. Staff-entered appointments
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
insert into fixture select 'appointment', public.create_staff_booking(pg_temp.fixture_id('makati'), array[pg_temp.fixture_id('haircut')],
  pg_temp.at_local(40, '08:00'), pg_temp.fixture_id('jenny'), pg_temp.fixture_id('rico'));
reset role;
select results_eq(
  $$ select source::text, status::text, deposit_amount, convenience_fee, amount_due, end_at - start_at, business_date, booked_by
     from public.bookings where id = pg_temp.fixture_id('appointment') $$,
  $$ values ('staff', 'confirmed', 0::numeric(20,2), 0::numeric(20,2), 0::numeric(20,2), interval '45 minutes',
       private.business_date(now(), 'Asia/Manila', '05:00') + 40, pg_temp.fixture_id('makati_staff')) $$,
  'a staff-entered appointment is confirmed with no deposit and no fee, even outside opening hours and the booking window'
);
select is(
  (select count(*)::integer from public.fee_entries where booking_id = pg_temp.fixture_id('appointment')),
  0,
  'and records no fee'
);
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
select throws_ok(
  $$ select public.create_staff_booking(pg_temp.fixture_id('makati'), array[pg_temp.fixture_id('haircut')], pg_temp.at_local(40, '08:30'),
       pg_temp.fixture_id('jenny'), null, 'Overlap', null) $$,
  'GBF01', 'staff_busy',
  'an appointment overlapping the staff member''s booking is refused'
);

-- ---------------------------------------------------------------------------
-- 6. Rescheduling
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.reschedule_booking(pg_temp.fixture_id('appointment'), pg_temp.at_local(41, '01:30'), pg_temp.fixture_id('carlo')) $$,
  'staff move the appointment to another staff member and an after-midnight time'
);
reset role;
select results_eq(
  $$ select staff_id, start_at, end_at - start_at, business_date from public.bookings where id = pg_temp.fixture_id('appointment') $$,
  $$ values (pg_temp.fixture_id('carlo'), pg_temp.at_local(41, '01:30'), interval '45 minutes',
       private.business_date(now(), 'Asia/Manila', '05:00') + 40) $$,
  'it keeps its length, and 1:30 AM belongs to the previous business date'
);
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
insert into fixture select 'second_appointment', public.create_staff_booking(pg_temp.fixture_id('makati'),
  array[pg_temp.fixture_id('haircut')], pg_temp.at_local(40, '10:00'), pg_temp.fixture_id('carlo'), pg_temp.fixture_id('rico'));
select throws_ok(
  $$ select public.reschedule_booking(pg_temp.fixture_id('second_appointment'), pg_temp.at_local(41, '02:00'), pg_temp.fixture_id('carlo')) $$,
  'GBF01', 'staff_busy',
  'a move onto the staff member''s other booking is refused'
);
select throws_ok(
  $$ select public.reschedule_booking(pg_temp.fixture_id('walk_in_new'), pg_temp.at_local(41, '10:00'), pg_temp.fixture_id('lea')) $$,
  'GBF02', 'visit_status_changed',
  'a visit already in service cannot be moved'
);
select pg_temp.act_as(pg_temp.fixture_id('owner'), false);
select lives_ok(
  $$ select public.reschedule_booking('80000000-0000-0000-0000-000000000006', pg_temp.at_local(42, '11:00'), pg_temp.fixture_id('carlo')) $$,
  'the owner moves an online booking whose payment is under review'
);
reset role;
select ok(
  exists (select 1 from public.notifications where entity_id = '80000000-0000-0000-0000-000000000006'
    and type = 'booking_rescheduled' and recipient_user_id = pg_temp.fixture_id('client')),
  'the online client is told their booking moved'
);

-- Check-in and no-show
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
select lives_ok($$ select public.check_in_booking(pg_temp.fixture_id('appointment')) $$, 'staff check a client in');
select throws_ok(
  $$ select public.check_in_booking(pg_temp.fixture_id('appointment')) $$,
  'GBF02', 'visit_status_changed',
  'a client cannot be checked in twice'
);
select lives_ok($$ select public.mark_no_show(pg_temp.fixture_id('second_appointment')) $$, 'staff mark a confirmed appointment a no-show');
select throws_ok(
  $$ select public.mark_no_show(pg_temp.fixture_id('walk_in_bea')) $$,
  'GBF02', 'visit_status_changed',
  'a waiting walk-in cannot be a no-show'
);
reset role;
select results_eq(
  $$ select status::text, checked_in_at from public.bookings where id = pg_temp.fixture_id('appointment')
     union all
     select status::text, null from public.bookings where id = pg_temp.fixture_id('second_appointment') $$,
  $$ values ('checked_in', now()), ('no_show', null::timestamptz) $$,
  'the moves are recorded'
);

-- ---------------------------------------------------------------------------
-- 7. Merging clients
-- ---------------------------------------------------------------------------

insert into fixture (key, id) values ('duplicate', gen_random_uuid());
insert into public.clients (id, organization_id, full_name, mobile_number, notes)
values (pg_temp.fixture_id('duplicate'), '20000000-0000-0000-0000-000000000001', 'Bea L.', '0917 999 0000', 'Likes the window seat.');
update public.bookings set client_id = pg_temp.fixture_id('duplicate') where id = pg_temp.fixture_id('walk_in_bea');

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
select throws_ok(
  $$ select public.merge_clients(pg_temp.fixture_id('bea_haven'), pg_temp.fixture_id('duplicate')) $$,
  'GBA02', 'not_permitted',
  'staff cannot merge clients'
);
select pg_temp.act_as(pg_temp.fixture_id('owner'), false);
select throws_ok(
  $$ select public.merge_clients(pg_temp.fixture_id('bea_haven'), pg_temp.fixture_id('ana_haven')) $$,
  'GBC01', 'clients_linked_to_different_accounts',
  'two records linked to different accounts cannot be merged'
);
select throws_ok(
  $$ select public.merge_clients(pg_temp.fixture_id('bea_haven'), pg_temp.fixture_id('bea_kanto')) $$,
  'GBA02', 'not_permitted',
  'records of two organizations cannot be merged'
);
select lives_ok(
  $$ select public.merge_clients(pg_temp.fixture_id('bea_haven'), pg_temp.fixture_id('duplicate')) $$,
  'the owner merges a duplicate into the kept record'
);
reset role;
select results_eq(
  $$ select (select client_id from public.bookings where id = pg_temp.fixture_id('walk_in_bea')),
       (select count(*)::integer from public.clients where id = pg_temp.fixture_id('duplicate')),
       (select notes from public.clients where id = pg_temp.fixture_id('bea_haven')),
       (select user_id from public.clients where id = pg_temp.fixture_id('bea_haven')) $$,
  $$ values (pg_temp.fixture_id('bea_haven'), 0, E'Prefers a firm massage.\n\nLikes the window seat.', pg_temp.fixture_id('client')) $$,
  'bookings move to the kept record, the duplicate is removed, notes are joined, and the account link stays'
);
select ok(
  exists (select 1 from public.activity_logs where action = 'client.merged' and entity_id = pg_temp.fixture_id('bea_haven')),
  'the merge writes its activity row'
);

-- ---------------------------------------------------------------------------
-- 8. The floor's "today"
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('makati_staff'), false);
select results_eq(
  $$ select current_business_date from public.my_branches $$,
  $$ values (private.business_date(now(), 'Asia/Manila', '05:00')) $$,
  'my_branches gives each branch''s current business date from the shared function'
);
reset role;

select * from finish();
rollback;
