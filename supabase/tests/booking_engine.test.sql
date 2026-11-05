-- The booking engine: availability, online booking, the hold limit, and rollback.
--
-- Ways availability could fail, each covered below:
--  1. A start time is offered whose range (services back to back plus the largest buffer, once)
--     runs past the branch's closing time or the staff member's shift.
--  2. A start time overlaps staff time off, a branch closure, or a booking that blocks the slot;
--     or a booking that no longer blocks (an expired hold, a cancellation) still hides one.
--  3. Start times ignore the slot step, the minimum notice, or the booking window.
--  4. A closed day, an unpublished branch, a service not offered, or a staff member who does not
--     perform every chosen service still yields times.
--  5. "Any available" misses a time only one qualifying staff member can take.
--  6. Hours past midnight lose their after-midnight times, or a booking that crosses midnight
--     does not block both sides of midnight (the seeded spa, open 2:00 PM to 2:00 AM).
--  7. Times either side of the moment the UTC date changes are dropped, or a booking there gets
--     the UTC date as its business date.
--
-- Ways create_online_booking could fail, each covered below:
--  8. Amounts: a deposit not capped at its service's price, the wrong rule, rounding not half away
--     from zero, or the fee not rounded before its minimum and maximum apply.
--  9. Snapshots of the payment details, services, and policy are missing or follow later edits.
-- 10. A third unexpired hold is accepted, or an expired one still counts.
-- 11. A stale hold for the staff member blocks the insert, or the overlap guard lets a taken
--     slot through.
-- 12. "Any available" does not pick the staff member with the fewest booked minutes.
-- 13. A client record is duplicated instead of updated.
-- 14. A failure after earlier writes leaves rows behind; a failed notification undoes the booking.

begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

create temporary table fixture (key text primary key, id uuid not null);
grant select on fixture to authenticated, anon;

create function pg_temp.fixture_id(p_key text) returns uuid language sql stable as $$
  select id from fixture where key = p_key;
$$;

create function pg_temp.act_as(p_key text, p_is_anonymous boolean) returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', pg_temp.fixture_id(p_key), 'role', 'authenticated', 'is_anonymous', p_is_anonymous)::text,
    true
  );
$$;

-- The fixture branch is in Manila and opens 6:00 AM to 12:00 PM, so 8:00 AM there is midnight UTC.
-- The test date is three business days out.
create function pg_temp.test_date() returns date language sql stable as $$
  select private.business_date(now(), 'Asia/Manila', '05:00') + 3;
$$;

create function pg_temp.at_local(p_date date, p_time time) returns timestamptz language sql stable as $$
  select (p_date + p_time) at time zone 'Asia/Manila';
$$;

-- Local start times offered at a branch, as "HH24:MI" text.
create function pg_temp.slot_times(p_branch_id uuid, p_date date, p_service_ids uuid[], p_staff_id uuid)
returns text[] language sql stable as $$
  select coalesce(array_agg(to_char(s.start_at at time zone 'Asia/Manila', 'HH24:MI') order by s.start_at), '{}')
  from public.get_available_slots(p_branch_id, p_date, p_service_ids, p_staff_id) s;
$$;

grant execute on function pg_temp.fixture_id(text), pg_temp.test_date(), pg_temp.at_local(date, time),
  pg_temp.slot_times(uuid, date, uuid[], uuid) to authenticated;

insert into fixture (key, id)
select key, gen_random_uuid()
from unnest(array[
  'owner', 'nina_login', 'guest_one', 'guest_two', 'client_three', 'org', 'branch', 'category',
  'cut', 'color', 'trim', 'nina', 'omar', 'owner_member', 'nina_member'
]) as key;

insert into auth.users (id, email, is_anonymous)
select pg_temp.fixture_id(key), case when key like 'guest%' then null else key || '@engine.test' end, key like 'guest%'
from unnest(array['owner', 'nina_login', 'guest_one', 'guest_two', 'client_three']) as key;

insert into public.organizations (id, name, slug, category, deposit_type, deposit_fixed_amount, slot_interval_minutes,
  min_notice_minutes, booking_horizon_days, cancellation_policy)
values (pg_temp.fixture_id('org'), 'Engine Salon', 'engine-salon-test', 'salon', 'fixed', 100, 15, 0, 5,
  'Cancel a day ahead.');

insert into public.branches (id, organization_id, name, slug, address, city, area, payment_instructions, is_published)
values (pg_temp.fixture_id('branch'), pg_temp.fixture_id('org'), 'Dawn', 'engine-salon-dawn', 'Street 1', 'Makati', 'Legaspi',
  '{"method": "gcash", "account_name": "Engine Salon", "account_number": "0917 000 0001", "qr_path": "x/y/qr.png"}', true);

-- Open 6:00 AM to 12:00 PM every day except the day after the test date.
insert into public.branch_hours (branch_id, organization_id, day_of_week, opens_at, closes_at, is_closed)
select pg_temp.fixture_id('branch'), pg_temp.fixture_id('org'), day, '06:00', '12:00',
  day = extract(dow from pg_temp.test_date() + 1)
from generate_series(0, 6) as day;

insert into public.organization_members (id, organization_id, user_id, role)
values
  (pg_temp.fixture_id('owner_member'), pg_temp.fixture_id('org'), pg_temp.fixture_id('owner'), 'owner'),
  (pg_temp.fixture_id('nina_member'), pg_temp.fixture_id('org'), pg_temp.fixture_id('nina_login'), 'staff');

insert into public.service_categories (id, organization_id, name)
values (pg_temp.fixture_id('category'), pg_temp.fixture_id('org'), 'Hair');

-- Cut: 30 min + 15 buffer, ₱1,234.50, a 15% deposit override. Color: 60 min + 5 buffer, ₱2,500.
-- Trim: 15 min, ₱80, so the ₱100 fixed deposit is capped at its price.
insert into public.services (id, organization_id, category_id, name, duration_minutes, buffer_minutes, price,
  deposit_type, deposit_percent)
values
  (pg_temp.fixture_id('cut'), pg_temp.fixture_id('org'), pg_temp.fixture_id('category'), 'Cut', 30, 15, 1234.50, 'percent', 15),
  (pg_temp.fixture_id('color'), pg_temp.fixture_id('org'), pg_temp.fixture_id('category'), 'Color', 60, 5, 2500, null, null),
  (pg_temp.fixture_id('trim'), pg_temp.fixture_id('org'), pg_temp.fixture_id('category'), 'Trim', 15, 0, 80, null, null);

insert into public.branch_services (branch_id, service_id, organization_id)
select pg_temp.fixture_id('branch'), pg_temp.fixture_id(key), pg_temp.fixture_id('org')
from unnest(array['cut', 'color', 'trim']) as key;

-- Nina (with a login) does everything, 6:00 AM to 12:00 PM. Omar cuts and trims, 9:00 AM to 12:00 PM.
insert into public.staff (id, organization_id, member_id, display_name)
values
  (pg_temp.fixture_id('nina'), pg_temp.fixture_id('org'), pg_temp.fixture_id('nina_member'), 'Nina'),
  (pg_temp.fixture_id('omar'), pg_temp.fixture_id('org'), null, 'Omar');
insert into public.staff_branches (staff_id, branch_id, organization_id)
select pg_temp.fixture_id(key), pg_temp.fixture_id('branch'), pg_temp.fixture_id('org')
from unnest(array['nina', 'omar']) as key;
insert into public.staff_services (staff_id, service_id, organization_id)
values
  (pg_temp.fixture_id('nina'), pg_temp.fixture_id('cut'), pg_temp.fixture_id('org')),
  (pg_temp.fixture_id('nina'), pg_temp.fixture_id('color'), pg_temp.fixture_id('org')),
  (pg_temp.fixture_id('nina'), pg_temp.fixture_id('trim'), pg_temp.fixture_id('org')),
  (pg_temp.fixture_id('omar'), pg_temp.fixture_id('cut'), pg_temp.fixture_id('org')),
  (pg_temp.fixture_id('omar'), pg_temp.fixture_id('trim'), pg_temp.fixture_id('org'));
insert into public.staff_shifts (organization_id, staff_id, branch_id, day_of_week, starts_at, ends_at)
select pg_temp.fixture_id('org'), pg_temp.fixture_id(shift.staff), pg_temp.fixture_id('branch'), day, shift.starts, shift.ends
from generate_series(0, 6) as day
cross join (values ('nina', '06:00'::time, '12:00'::time), ('omar', '09:00', '12:00')) as shift (staff, starts, ends);

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------

-- 1. The whole range fits: Cut and Color run 90 minutes plus the larger buffer (15) once.
select is(
  (pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(),
    array[pg_temp.fixture_id('cut'), pg_temp.fixture_id('color')], pg_temp.fixture_id('nina')))[1:2],
  array['06:00', '06:15'],
  'start times step by the slot interval from the opening time'
);
select is(
  (select max(t) from unnest(pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(),
    array[pg_temp.fixture_id('cut'), pg_temp.fixture_id('color')], pg_temp.fixture_id('nina'))) as t),
  '10:15',
  'the last start leaves room for both services and the largest buffer, once, before closing'
);
select is(
  (select min(t) from unnest(pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(),
    array[pg_temp.fixture_id('cut')], pg_temp.fixture_id('omar'))) as t),
  '09:00',
  'a staff member is offered only inside their shift'
);

-- 4. Services each staff member performs
select is(
  pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(),
    array[pg_temp.fixture_id('cut'), pg_temp.fixture_id('color')], pg_temp.fixture_id('omar')),
  '{}'::text[],
  'a staff member who does not perform every chosen service has no times'
);
select is(
  pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date() + 1, array[pg_temp.fixture_id('cut')], null),
  '{}'::text[],
  'a closed day has no times'
);

-- 7. The UTC date changes at 8:00 AM in Manila.
select ok(
  array['07:45', '08:00'] <@ pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(),
    array[pg_temp.fixture_id('trim')], pg_temp.fixture_id('nina')),
  'times either side of the UTC date change are both offered for the one business date'
);
select isnt(
  (pg_temp.at_local(pg_temp.test_date(), '07:45') at time zone 'UTC')::date,
  (pg_temp.at_local(pg_temp.test_date(), '08:00') at time zone 'UTC')::date,
  'the two times fall on different UTC dates'
);

-- 2. Time off, closures, and bookings
insert into public.staff_time_off (organization_id, staff_id, starts_at, ends_at)
values (pg_temp.fixture_id('org'), pg_temp.fixture_id('nina'), pg_temp.at_local(pg_temp.test_date(), '09:00'),
  pg_temp.at_local(pg_temp.test_date(), '10:00'));
insert into public.branch_closures (organization_id, branch_id, starts_at, ends_at)
values (pg_temp.fixture_id('org'), pg_temp.fixture_id('branch'), pg_temp.at_local(pg_temp.test_date(), '11:00'),
  pg_temp.at_local(pg_temp.test_date(), '11:30'));

select is(
  pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(), array[pg_temp.fixture_id('trim')],
    pg_temp.fixture_id('nina')) && array['09:00', '09:45'],
  false,
  'time off hides the staff member''s times that overlap it'
);
select ok(
  '08:45' = any (pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(), array[pg_temp.fixture_id('trim')],
    pg_temp.fixture_id('nina')))
  and '10:00' = any (pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(), array[pg_temp.fixture_id('trim')],
    pg_temp.fixture_id('nina'))),
  'times that end when time off starts, or start when it ends, stay open (half-open ranges)'
);
select is(
  pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(), array[pg_temp.fixture_id('trim')], null)
    && array['11:00', '11:15'],
  false,
  'a branch closure hides every time that overlaps it'
);
select ok(
  array['10:45', '11:30'] <@ pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(), array[pg_temp.fixture_id('trim')], null),
  'times that end as the closure starts, or start as it ends, stay open'
);
select ok(
  '09:30' = any (pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(), array[pg_temp.fixture_id('trim')], null)),
  '"any available" offers a time only one qualifying staff member is free for'
);

-- A confirmed booking, an expired hold, a live hold, and a cancellation for Nina.
insert into public.clients (id, organization_id, full_name)
values ('a0000000-0000-0000-0000-000000000001', pg_temp.fixture_id('org'), 'Walk-up');
insert into public.bookings (organization_id, branch_id, client_id, booked_by, staff_id, source, status, start_at, end_at,
  business_date, service_total, hold_expires_at)
select pg_temp.fixture_id('org'), pg_temp.fixture_id('branch'), 'a0000000-0000-0000-0000-000000000001', pg_temp.fixture_id('owner'),
  pg_temp.fixture_id('nina'), 'staff', seeded.status::public.booking_status,
  pg_temp.at_local(pg_temp.test_date(), seeded.starts), pg_temp.at_local(pg_temp.test_date(), seeded.ends),
  pg_temp.test_date(), 0, seeded.hold_expires_at
from (values
  ('confirmed', '06:30'::time, '07:00'::time, null::timestamptz),
  ('held', '07:00', '07:15', now() - interval '1 minute'),
  ('held', '10:15', '10:30', now() + interval '10 minutes'),
  ('cancelled', '10:30', '10:45', null)
) as seeded (status, starts, ends, hold_expires_at);

select is(
  pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(), array[pg_temp.fixture_id('trim')],
    pg_temp.fixture_id('nina')) && array['06:30', '06:45', '10:15'],
  false,
  'a confirmed booking and a live hold block their times'
);
select ok(
  array['06:15', '07:00', '10:30'] <@ pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(),
    array[pg_temp.fixture_id('trim')], pg_temp.fixture_id('nina')),
  'an expired hold and a cancelled booking block nothing, before any job has tidied them'
);

-- 3. Booking window and notice
select is(
  pg_temp.slot_times(pg_temp.fixture_id('branch'), private.business_date(now(), 'Asia/Manila', '05:00') + 6,
    array[pg_temp.fixture_id('trim')], null),
  '{}'::text[],
  'a business date past the booking horizon has no times'
);
select is(
  pg_temp.slot_times(pg_temp.fixture_id('branch'), private.business_date(now(), 'Asia/Manila', '05:00') - 1,
    array[pg_temp.fixture_id('trim')], null),
  '{}'::text[],
  'a past business date has no times'
);
select isnt(
  pg_temp.slot_times(pg_temp.fixture_id('branch'), private.business_date(now(), 'Asia/Manila', '05:00') + 5,
    array[pg_temp.fixture_id('trim')], null),
  '{}'::text[],
  'the last date in the horizon still has times'
);

update public.organizations
set min_notice_minutes = floor(extract(epoch from pg_temp.at_local(pg_temp.test_date(), '08:00') - now()) / 60),
  slot_interval_minutes = 20
where id = pg_temp.fixture_id('org');
select is(
  (pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(), array[pg_temp.fixture_id('trim')],
    pg_temp.fixture_id('nina')))[1:3],
  array['08:00', '08:20', '08:40'],
  'the minimum notice hides earlier times, and a new slot interval changes the step'
);
update public.organizations set min_notice_minutes = 0, slot_interval_minutes = 15 where id = pg_temp.fixture_id('org');

select is(
  (select count(*)::integer from public.get_available_slots(pg_temp.fixture_id('branch'), pg_temp.test_date(),
    array[pg_temp.fixture_id('trim'), gen_random_uuid()], null)),
  0,
  'a service the branch does not offer yields no times'
);

update public.branches set is_published = false where id = pg_temp.fixture_id('branch');
select is(
  pg_temp.slot_times(pg_temp.fixture_id('branch'), pg_temp.test_date(), array[pg_temp.fixture_id('trim')], null),
  '{}'::text[],
  'an unpublished branch has no times'
);
update public.branches set is_published = true where id = pg_temp.fixture_id('branch');

-- 6. The seeded spa: BGC is open 2:00 PM to 2:00 AM, and Lea has a confirmed Swedish massage from
-- 11:45 PM to 1:00 AM with its clean-up time. A foot spa runs 45 minutes plus 10.
create function pg_temp.seeded_bgc_date() returns date language sql stable as $$
  select business_date from public.bookings where id = '80000000-0000-0000-0000-000000000001';
$$;

-- Bookings other runs left on Lea's day (Playwright holds and cancels there) are set aside inside
-- this transaction, so only the seeded booking shapes her times.
update public.bookings
set status = 'cancelled'
where staff_id = '70000000-0000-0000-0000-000000000003'
  and business_date = pg_temp.seeded_bgc_date()
  and id <> '80000000-0000-0000-0000-000000000001';

select is(
  (select business_date - (start_at at time zone 'Asia/Manila')::date
     || ':' || ((end_at at time zone 'Asia/Manila')::date - business_date)
   from public.bookings where id = '80000000-0000-0000-0000-000000000001'),
  '0:1',
  'the seeded spa booking starts on its business date and ends on the next calendar day'
);
select ok(
  array['14:00', '22:45', '01:00'] <@ pg_temp.slot_times('30000000-0000-0000-0000-000000000002', pg_temp.seeded_bgc_date(),
    array['60000000-0000-0000-0000-000000000002'::uuid], '70000000-0000-0000-0000-000000000003'),
  'the spa offers times from opening, up to the booking, and after it past midnight'
);
select is(
  pg_temp.slot_times('30000000-0000-0000-0000-000000000002', pg_temp.seeded_bgc_date(),
    array['60000000-0000-0000-0000-000000000002'::uuid], '70000000-0000-0000-0000-000000000003')
    && array['23:00', '23:45', '00:00', '00:45', '01:15'],
  false,
  'the booking blocks both sides of midnight, and no time runs past 2:00 AM'
);
select is(
  (select max(start_at) from public.get_available_slots('30000000-0000-0000-0000-000000000002', pg_temp.seeded_bgc_date(),
    array['60000000-0000-0000-0000-000000000002'::uuid], '70000000-0000-0000-0000-000000000003')),
  pg_temp.at_local(pg_temp.seeded_bgc_date() + 1, '01:00'),
  'the 1:00 AM time belongs to the opening day, on the next calendar date'
);

-- ---------------------------------------------------------------------------
-- Online booking
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('guest_one', true);

create temporary table made (key text primary key, booking_id uuid, booking_code text);
grant select, insert on made to authenticated;

insert into made
select 'cut_color', booking_id, booking_code
from public.create_online_booking(
  pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('cut'), pg_temp.fixture_id('color')],
  pg_temp.at_local(pg_temp.test_date(), '07:15'), 'Gina Guest', '0917 111 2222', '2026-11-05', pg_temp.fixture_id('nina'),
  'Short layers'
);
reset role;

select matches(
  (select booking_code from made where key = 'cut_color'),
  '^[0-9A-HJKMNP-TV-Z]{12}$',
  'the booking code is 12 Crockford base32 characters from the database'
);

-- 8. Amounts: Cut ₱1,234.50 with 15% = 185.175 → 185.18; Color ₱2,500 with the ₱100 rule; the fee
-- is 3% of ₱3,734.50 = 112.035 → 112.04, then held at the ₱50 maximum.
select results_eq(
  $$ select status::text, service_total, deposit_amount, convenience_fee, amount_due, end_at - start_at, business_date
     from public.bookings where id = (select booking_id from made where key = 'cut_color') $$,
  $$ values ('held', 3734.50::numeric(20,2), 285.18::numeric(20,2), 50.00::numeric(20,2), 335.18::numeric(20,2),
       interval '105 minutes', pg_temp.test_date()) $$,
  'the booking is held with database-calculated amounts and the buffer added once to its range'
);
select ok(
  (select hold_expires_at = now() + interval '15 minutes' from public.bookings where id = (select booking_id from made where key = 'cut_color')),
  'the hold lasts the organization''s hold time'
);

set local role authenticated;
select pg_temp.act_as('guest_one', true);
select results_eq(
  $$ select * from public.get_booking_quote(pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')]) $$,
  $$ values (80.00::numeric(20,2), 80.00::numeric(20,2), 10.00::numeric(20,2), 90.00::numeric(20,2)) $$,
  'the quote caps a deposit at its service''s price and lifts a small fee to the minimum'
);
select results_eq(
  $$ select service_total, deposit_amount, convenience_fee from public.get_booking_quote(pg_temp.fixture_id('branch'),
       array[pg_temp.fixture_id('cut')]) $$,
  $$ values (1234.50::numeric(20,2), 185.18::numeric(20,2), 37.04::numeric(20,2)) $$,
  'the quote rounds half away from zero: 15% of ₱1,234.50 and 3% of it'
);
reset role;

-- 9. Snapshots
select results_eq(
  $$ select service_name, duration_minutes, buffer_minutes, price, sort_order from public.booking_services
     where booking_id = (select booking_id from made where key = 'cut_color') order by sort_order $$,
  $$ values ('Cut', 30::smallint, 15::smallint, 1234.50::numeric(20,2), 1::smallint),
            ('Color', 60::smallint, 5::smallint, 2500.00::numeric(20,2), 2::smallint) $$,
  'the services are snapshotted in the order chosen'
);
update public.services set price = 9999, name = 'Renamed' where id = pg_temp.fixture_id('cut');
update public.branches set payment_instructions = '{"method": "maya"}' where id = pg_temp.fixture_id('branch');
select results_eq(
  $$ select bs.service_name, bs.price, b.payment_instructions_snapshot ->> 'account_name',
       b.policy_acceptance_metadata ->> 'cancellation_policy', b.policy_acceptance_metadata ->> 'privacy_notice_version',
       b.client_note
     from public.booking_services bs join public.bookings b on b.id = bs.booking_id
     where b.id = (select booking_id from made where key = 'cut_color') and bs.sort_order = 1 $$,
  $$ values ('Cut', 1234.50::numeric(20,2), 'Engine Salon', 'Cancel a day ahead.', '2026-11-05', 'Short layers') $$,
  'the snapshots keep the services, payment details, and accepted policy as they were'
);
update public.services set price = 1234.50, name = 'Cut' where id = pg_temp.fixture_id('cut');
update public.branches
set payment_instructions = '{"method": "gcash", "account_name": "Engine Salon", "account_number": "0917 000 0001", "qr_path": "x/y/qr.png"}'
where id = pg_temp.fixture_id('branch');

select results_eq(
  $$ select full_name, mobile_number, user_id from public.clients where organization_id = pg_temp.fixture_id('org') and user_id is not null $$,
  $$ values ('Gina Guest', '0917 111 2222', pg_temp.fixture_id('guest_one')) $$,
  'the organization gets a client record linked to the guest'
);
select ok(
  exists (select 1 from public.activity_logs where action = 'booking.created' and entity_id = (select booking_id from made where key = 'cut_color')
    and actor_user_id = pg_temp.fixture_id('guest_one')),
  'the booking writes its activity row'
);
select results_eq(
  $$ select recipient_user_id from public.notifications where entity_id = (select booking_id from made where key = 'cut_color')
     order by recipient_user_id $$,
  $$ select id from fixture where key in ('owner', 'nina_login') order by id $$,
  'the owner and the booked staff member''s login are notified'
);

-- 11. The slot is now taken for Nina; a time that overlaps it is refused.
set local role authenticated;
select pg_temp.act_as('guest_two', true);
select throws_ok(
  $$ select * from public.create_online_booking(pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')],
       pg_temp.at_local(pg_temp.test_date(), '08:00'), 'Tess', '0917', '2026-11-05', pg_temp.fixture_id('nina')) $$,
  'GBB03', 'slot_unavailable',
  'a time that overlaps the new hold is refused'
);
select throws_ok(
  $$ select * from public.create_online_booking(pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')],
       pg_temp.at_local(pg_temp.test_date(), '11:35'), 'Tess', '0917', '2026-11-05', pg_temp.fixture_id('nina')) $$,
  'GBB03', 'slot_unavailable',
  'a time off the slot grid is refused'
);
reset role;

-- A stale hold (expired, not yet tidied) sits on Nina's 6:00 AM; booking that time moves it to hold_expired.
insert into public.bookings (id, organization_id, branch_id, client_id, booked_by, staff_id, source, status, start_at, end_at,
  business_date, service_total, deposit_amount, convenience_fee, amount_due, hold_expires_at)
values ('a0000000-0000-0000-0000-000000000002', pg_temp.fixture_id('org'), pg_temp.fixture_id('branch'),
  'a0000000-0000-0000-0000-000000000001', pg_temp.fixture_id('guest_two'), pg_temp.fixture_id('nina'), 'online', 'held',
  pg_temp.at_local(pg_temp.test_date(), '06:00'), pg_temp.at_local(pg_temp.test_date(), '06:15'), pg_temp.test_date(),
  80, 80, 10, 90, now() - interval '1 minute');

set local role authenticated;
select pg_temp.act_as('guest_two', true);
select lives_ok(
  $$ insert into made select 'over_stale', booking_id, booking_code from public.create_online_booking(
       pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')], pg_temp.at_local(pg_temp.test_date(), '06:00'),
       'Tess Two', '0917 333 4444', '2026-11-05', pg_temp.fixture_id('nina')) $$,
  'a stale hold on the same time does not block a new booking'
);
reset role;
select is(
  (select status::text from public.bookings where id = 'a0000000-0000-0000-0000-000000000002'),
  'hold_expired',
  'the staff member''s stale hold is moved to hold_expired first'
);

-- 10. The hold limit: guest_two holds one; a second is allowed, a third is not.
set local role authenticated;
select pg_temp.act_as('guest_two', true);
select lives_ok(
  $$ insert into made select 'second_hold', booking_id, booking_code from public.create_online_booking(
       pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')], pg_temp.at_local(pg_temp.test_date(), '11:30'),
       'Tess Two', '0917 333 4444', '2026-11-05') $$,
  'a second unexpired hold is allowed'
);
select throws_ok(
  $$ select * from public.create_online_booking(pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')],
       pg_temp.at_local(pg_temp.test_date(), '11:45'), 'Tess Two', '0917 333 4444', '2026-11-05') $$,
  'GBB01', 'hold_limit_reached',
  'a third unexpired hold is refused'
);
reset role;
update public.bookings set hold_expires_at = now() - interval '1 second'
where id = (select booking_id from made where key = 'second_hold');
set local role authenticated;
select pg_temp.act_as('guest_two', true);
select lives_ok(
  $$ insert into made select 'after_expiry', booking_id, booking_code from public.create_online_booking(
       pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')], pg_temp.at_local(pg_temp.test_date(), '11:45'),
       'Tess Two', '0917 333 4444', '2026-11-05') $$,
  'once a hold runs out it no longer counts towards the limit'
);
reset role;

-- 13. The same guest booked three times and has one client record, with the latest details.
select is(
  (select count(*)::integer from public.clients where organization_id = pg_temp.fixture_id('org')
     and user_id = pg_temp.fixture_id('guest_two')),
  1,
  'repeat bookings update the one client record'
);

-- 12. "Any available": at 10:00 Nina and Omar are both free; Nina has booked minutes that day and
-- Omar has none, so Omar is picked. Then Nina, the only one left.
set local role authenticated;
select pg_temp.act_as('client_three', false);
insert into made select 'any_one', booking_id, booking_code from public.create_online_booking(
  pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')], pg_temp.at_local(pg_temp.test_date(), '10:00'),
  'Cora Client', '0917 555 6666', '2026-11-05');
insert into made select 'any_two', booking_id, booking_code from public.create_online_booking(
  pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')], pg_temp.at_local(pg_temp.test_date(), '10:00'),
  'Cora Client', '0917 555 6666', '2026-11-05');
reset role;
select results_eq(
  $$ select s.display_name from made m join public.bookings b on b.id = m.booking_id join public.staff s on s.id = b.staff_id
     where m.key in ('any_one', 'any_two') order by m.key $$,
  $$ values ('Omar'), ('Nina') $$,
  '"any available" picks the qualifying staff member with the fewest booked minutes that day'
);
select is(
  (select full_name from public.profiles where id = pg_temp.fixture_id('client_three')),
  'Cora Client',
  'an account without a name takes the name given at booking'
);

-- The UTC date change: a booking at 7:45 AM Manila (11:45 PM UTC the day before) belongs to the
-- local business date.
set local role authenticated;
select pg_temp.act_as('owner', false);
insert into made select 'utc_edge', booking_id, booking_code from public.create_online_booking(
  pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')], pg_temp.at_local(pg_temp.test_date() - 1, '07:45'),
  'Owner Self', '0917', '2026-11-05', pg_temp.fixture_id('nina'));
reset role;
select is(
  (select business_date from public.bookings where id = (select booking_id from made where key = 'utc_edge')),
  pg_temp.test_date() - 1,
  'a booking just before the UTC date change gets the local business date'
);
select is(
  (select count(*)::integer from public.notifications where entity_id = (select booking_id from made where key = 'utc_edge')),
  1,
  'the creator is not notified of their own booking'
);

-- Unpublished branches refuse bookings.
update public.branches set is_published = false where id = pg_temp.fixture_id('branch');
set local role authenticated;
select pg_temp.act_as('guest_one', true);
select throws_ok(
  $$ select * from public.create_online_booking(pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')],
       pg_temp.at_local(pg_temp.test_date(), '11:00'), 'Cora', '0917', '2026-11-05') $$,
  'GBB02', 'branch_not_bookable',
  'an unpublished branch refuses new bookings'
);
reset role;
update public.branches set is_published = true where id = pg_temp.fixture_id('branch');

set local role anon;
select throws_ok(
  $$ select * from public.create_online_booking(pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')],
       now(), 'Nobody', '0917', '2026-11-05') $$,
  '42501', null,
  'a visitor without a session cannot book'
);
reset role;

-- 14. A failure after the stale hold was expired, the client record upserted, and the booking
-- inserted leaves nothing behind.
insert into public.bookings (id, organization_id, branch_id, client_id, booked_by, staff_id, source, status, start_at, end_at,
  business_date, service_total, deposit_amount, convenience_fee, amount_due, hold_expires_at)
values ('a0000000-0000-0000-0000-000000000003', pg_temp.fixture_id('org'), pg_temp.fixture_id('branch'),
  'a0000000-0000-0000-0000-000000000001', pg_temp.fixture_id('guest_two'), pg_temp.fixture_id('nina'), 'online', 'held',
  pg_temp.at_local(pg_temp.test_date(), '06:15'), pg_temp.at_local(pg_temp.test_date(), '06:30'), pg_temp.test_date(),
  80, 80, 10, 90, now() - interval '1 minute');
insert into auth.users (id, is_anonymous) values ('a0000000-0000-0000-0000-0000000000f0', true);
insert into fixture (key, id) values ('guest_failing', 'a0000000-0000-0000-0000-0000000000f0');

create function pg_temp.fail_booking_services() returns trigger language plpgsql as $$
begin
  raise exception 'forced failure';
end;
$$;
create trigger forced_failure before insert on public.booking_services
  for each row execute function pg_temp.fail_booking_services();

create temporary table counts_before as
select
  (select count(*) from public.bookings) as bookings,
  (select count(*) from public.clients) as clients,
  (select count(*) from public.activity_logs) as activity_logs,
  (select count(*) from public.notifications) as notifications;

set local role authenticated;
select pg_temp.act_as('guest_failing', true);
select throws_ok(
  $$ select * from public.create_online_booking(pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')],
       pg_temp.at_local(pg_temp.test_date(), '06:15'), 'Fay Fail', '0917 999', '2026-11-05', pg_temp.fixture_id('nina')) $$,
  'P0001', 'forced failure',
  'a failure while saving the services fails the booking'
);
reset role;
select results_eq(
  $$ select (select count(*) from public.bookings), (select count(*) from public.clients),
       (select count(*) from public.activity_logs), (select count(*) from public.notifications) $$,
  $$ select bookings, clients, activity_logs, notifications from counts_before $$,
  'nothing from the failed booking remains: no booking, client record, activity row, or notification'
);
select is(
  (select status::text from public.bookings where id = 'a0000000-0000-0000-0000-000000000003'),
  'held',
  'the stale hold it expired is back as it was'
);
drop trigger forced_failure on public.booking_services;

-- A failed notification insert is reported and does not undo the booking.
create function pg_temp.fail_notifications() returns trigger language plpgsql as $$
begin
  raise exception 'notifications are down';
end;
$$;
create trigger forced_failure before insert on public.notifications
  for each row execute function pg_temp.fail_notifications();
set local role authenticated;
select pg_temp.act_as('guest_failing', true);
select lives_ok(
  $$ insert into made select 'no_notifications', booking_id, booking_code from public.create_online_booking(
       pg_temp.fixture_id('branch'), array[pg_temp.fixture_id('trim')], pg_temp.at_local(pg_temp.test_date(), '06:15'),
       'Fay Fail', '0917 999', '2026-11-05', pg_temp.fixture_id('nina')) $$,
  'a booking succeeds when its notifications cannot be written'
);
reset role;
select is(
  (select status::text from public.bookings where id = (select booking_id from made where key = 'no_notifications')),
  'held',
  'the booking is held without its notifications'
);
drop trigger forced_failure on public.notifications;

-- The expire_holds job tidies every remaining stale hold and logs it with no actor. pg_cron runs
-- it with no request claims.
select set_config('request.jwt.claims', '', true);
update public.bookings set hold_expires_at = now() - interval '1 second'
where id = (select booking_id from made where key = 'after_expiry');
select is(private.expire_holds() >= 1, true, 'expire_holds moves stale holds to hold_expired');
select ok(
  exists (select 1 from public.activity_logs where action = 'booking.hold_expired' and actor_user_id is null
    and entity_id = (select booking_id from made where key = 'after_expiry')),
  'the job logs each expiry with no actor'
);
select is(
  (select count(*)::integer from public.bookings where status = 'held' and hold_expires_at <= now()),
  0,
  'no stale hold is left'
);

select * from finish();
rollback;
