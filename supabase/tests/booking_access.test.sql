-- Who can read bookings and client records, and who can open, take over, and cancel a booking.
-- Uses the seeded organizations and bookings (supabase/seed.sql). Other suites and the Playwright
-- tests add rows of their own, so the counts here look only at the seeded ones.
--
-- Ways these rules could fail, each covered below:
--  1. A member reads bookings of another branch than their own, or of another organization.
--  2. A member of a restricted organization still reads bookings.
--  3. A client or guest reads someone else's bookings, booking services, or client records.
--  4. Staff read client records beyond the clients on their branches' bookings, or add them.
--  5. Anyone writes bookings directly instead of through the functions.
--  6. A visitor without a session reads tables, books, or takes a booking over.
--  7. get_booking_by_code returns the mobile number or the shop's notes, gives the client's name to a
--     stranger, or misreads an expired hold.
--  8. claim_guest_booking takes over a booking a signed-in account made, or leaves the old guest
--     with access.
--  9. cancel_booking lets a stranger, another branch's member, or a restricted organization's
--     member cancel; lets a client cancel from a final status; or forgets who cancelled.
-- 10. The public views show unpublished branches, hidden services, or staff who cannot be booked.

begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

create function pg_temp.act_as(p_user_id uuid, p_is_anonymous boolean) returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated', 'is_anonymous', p_is_anonymous)::text,
    true
  );
$$;

create function pg_temp.visible_booking_ids() returns text language sql stable as $$
  select coalesce(string_agg(right(id::text, 2), ',' order by id), '') from public.bookings where id::text like '80000000-%';
$$;
grant execute on function pg_temp.visible_booking_ids() to authenticated;

create temporary table seeded_code (booking_id uuid primary key, code text not null);
insert into seeded_code select id, booking_code from public.bookings where id::text like '80000000-%';
grant select on seeded_code to authenticated, anon;

-- The seeded guest hold lasts 15 minutes from the seed, and the expire_holds job may have tidied it
-- since. Inside this transaction it is held again, after setting aside anything another run booked
-- on Jenny's day.
update public.bookings
set status = 'cancelled'
where staff_id = '70000000-0000-0000-0000-000000000001'
  and business_date = (select business_date from public.bookings where id = '80000000-0000-0000-0000-000000000002')
  and id::text not like '80000000-%';
update public.bookings
set status = 'held', hold_expires_at = now() + interval '10 minutes'
where id = '80000000-0000-0000-0000-000000000002';

-- A second guest device and a stranger.
insert into auth.users (id, is_anonymous)
values ('b0000000-0000-0000-0000-000000000001', true), ('b0000000-0000-0000-0000-000000000002', true);

set local role authenticated;

-- 1–2. Members by branch scope and access status
select pg_temp.act_as('10000000-0000-0000-0000-000000000002', false);
select is(pg_temp.visible_booking_ids(), '01,02,03,04,06,07,08,09', 'the owner reads every booking of the organization');
select pg_temp.act_as('10000000-0000-0000-0000-000000000003', false);
select is(pg_temp.visible_booking_ids(), '01', 'a manager reads only their branch''s bookings');
select pg_temp.act_as('10000000-0000-0000-0000-000000000004', false);
select is(pg_temp.visible_booking_ids(), '02,03,04,06,07,08,09', 'staff read only their branch''s bookings');
select pg_temp.act_as('10000000-0000-0000-0000-000000000005', false);
select is(pg_temp.visible_booking_ids(), '', 'the owner of a restricted organization reads no bookings');
select pg_temp.act_as('10000000-0000-0000-0000-000000000006', false);
select is(pg_temp.visible_booking_ids(), '', 'staff of a restricted organization read no bookings');

-- 3. Clients and guests see what they created, across organizations
select pg_temp.act_as('10000000-0000-0000-0000-000000000007', false);
select is(pg_temp.visible_booking_ids(), '01,04,05,06,08', 'a client reads their own bookings at both organizations');
select is(
  (select count(*)::integer from public.booking_services where booking_id::text like '80000000-%'),
  5,
  'a client reads the services of their own bookings only'
);
select is((select count(*)::integer from public.clients), 0, 'a client reads no client records');
select pg_temp.act_as('10000000-0000-0000-0000-000000000008', true);
select is(pg_temp.visible_booking_ids(), '02,03,07,09', 'a guest reads the bookings made in their session');

-- 4. Client records belong to the owner and managers
select pg_temp.act_as('10000000-0000-0000-0000-000000000003', false);
select is(
  (select count(*)::integer from public.clients where id::text like '90000000-%'),
  2,
  'a manager reads the organization''s client list'
);
select pg_temp.act_as('10000000-0000-0000-0000-000000000004', false);
select results_eq(
  $$ select full_name from public.clients where id::text like '90000000-%' order by full_name $$,
  $$ values ('Ana Guest'), ('Bea Lim') $$,
  'staff read only the clients on their branch''s bookings'
);
select throws_ok(
  $$ insert into public.clients (organization_id, full_name) values ('20000000-0000-0000-0000-000000000001', 'Sneaky') $$,
  '42501', null,
  'staff cannot add client records directly'
);
select pg_temp.act_as('10000000-0000-0000-0000-000000000002', false);
select lives_ok(
  $$ insert into public.clients (organization_id, full_name, mobile_number) values ('20000000-0000-0000-0000-000000000001', 'Rita Phone', '0917 1') $$,
  'the owner adds a client record'
);
select ok(
  exists (select 1 from public.activity_logs where action = 'clients.insert'),
  'a direct client record write is logged by its trigger'
);
select pg_temp.act_as('10000000-0000-0000-0000-000000000004', false);
select is(
  (select count(*)::integer from public.clients where full_name = 'Rita Phone'),
  0,
  'staff do not read a client with no booking at their branch'
);
select pg_temp.act_as('10000000-0000-0000-0000-000000000002', false);
select throws_ok(
  $$ insert into public.clients (organization_id, full_name) values ('20000000-0000-0000-0000-000000000002', 'Elsewhere') $$,
  '42501', null,
  'an owner cannot add client records to another organization'
);

-- 5. Bookings are written through functions only
select throws_ok(
  $$ update public.bookings set status = 'confirmed' where id = '80000000-0000-0000-0000-000000000002' $$,
  '42501', null,
  'the owner cannot change a booking directly'
);
select pg_temp.act_as('10000000-0000-0000-0000-000000000007', false);
select throws_ok(
  $$ update public.bookings set amount_due = 1 where id = '80000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'a client cannot change their booking directly'
);

-- 6. Visitors without a session
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select count(*) from public.bookings $$, '42501', null, 'a visitor cannot read bookings');
select throws_ok($$ select count(*) from public.clients $$, '42501', null, 'a visitor cannot read client records');
select throws_ok(
  $$ select public.claim_guest_booking((select code from seeded_code where booking_id = '80000000-0000-0000-0000-000000000002')) $$,
  '42501', null,
  'a visitor cannot take a booking over without a session'
);

-- 10. Public views
select results_eq(
  $$ select slug from public.public_branches where organization_slug in ('haven-spa', 'kanto-barbers') order by slug $$,
  $$ values ('haven-spa-bgc'), ('haven-spa-makati'), ('kanto-barbers-cubao') $$,
  'visitors see published branches, including the restricted organization''s'
);
select is(
  (select count(*)::integer from public.public_branch_services where branch_id = '30000000-0000-0000-0000-000000000002'),
  2,
  'the branch''s offered services are public'
);
select results_eq(
  $$ select display_name, service_ids from public.public_branch_staff where branch_id = '30000000-0000-0000-0000-000000000002' $$,
  $$ values ('Lea Ramos', array['60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002']::uuid[]) $$,
  'the branch''s bookable staff with a shift are public, with the offered services they perform'
);

-- 7. The booking link
select results_eq(
  $$ select status::text, branch_name, staff_display_name, amount_due, client_name, client_note, viewer_is_creator,
       viewer_is_member, booked_by_guest
     from public.get_booking_by_code(
       lower(regexp_replace((select code from seeded_code where booking_id = '80000000-0000-0000-0000-000000000001'),
         '(.{4})(.{4})(.{4})', '\1-\2-\3'))) $$,
  $$ values ('confirmed', 'BGC Late Night', 'Lea Ramos', 130.00::numeric(20,2), null::text, null::text, false, false, false) $$,
  'a visitor with the link reads the booking without the client''s name or note; the code is read in any case, with dashes'
);
select ok(
  not exists (
    select 1
    from pg_proc p, unnest(p.proargnames) as argument (name)
    where p.proname = 'get_booking_by_code' and (argument.name like '%mobile%' or argument.name like '%notes%')
  ),
  'get_booking_by_code has no mobile number or notes column at all'
);
select is(
  (select count(*)::integer from public.get_booking_by_code('0000-0000-0000')),
  0,
  'an unknown code finds nothing'
);
reset role;
update public.bookings set hold_expires_at = now() - interval '1 second' where id = '80000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.act_as('b0000000-0000-0000-0000-000000000002', true);
select is(
  (select status::text from public.get_booking_by_code((select code from seeded_code where booking_id = '80000000-0000-0000-0000-000000000002'))),
  'hold_expired',
  'a hold past its time reads as expired before the job runs'
);
reset role;
update public.bookings set hold_expires_at = now() + interval '10 minutes' where id = '80000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.act_as('10000000-0000-0000-0000-000000000004', false);
select results_eq(
  $$ select client_name, viewer_is_member, viewer_is_creator from public.get_booking_by_code(
       (select code from seeded_code where booking_id = '80000000-0000-0000-0000-000000000002')) $$,
  $$ values ('Ana Guest', true, false) $$,
  'a member of the branch sees the client''s name'
);

-- 8. Taking a guest booking over
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001', true);
select is(
  public.claim_guest_booking((select code from seeded_code where booking_id = '80000000-0000-0000-0000-000000000002')),
  '80000000-0000-0000-0000-000000000002'::uuid,
  'a guest on another device takes over a guest booking'
);
select is(pg_temp.visible_booking_ids(), '02', 'the new device reads the booking it took over');
select pg_temp.act_as('10000000-0000-0000-0000-000000000008', true);
select is(pg_temp.visible_booking_ids(), '03,07,09', 'the old device loses access to it');
select ok(
  (select not viewer_is_creator and booked_by_guest from public.get_booking_by_code(
     (select code from seeded_code where booking_id = '80000000-0000-0000-0000-000000000002'))),
  'the old device can still read it by its link, as anyone can'
);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ select public.claim_guest_booking((select code from seeded_code where booking_id = '80000000-0000-0000-0000-000000000001')) $$,
  'GBB05', 'booking_not_claimable',
  'a booking made by a signed-in account cannot be taken over'
);

-- 9. Cancelling
select throws_ok(
  $$ select public.cancel_booking('80000000-0000-0000-0000-000000000002') $$,
  'GBA02', 'not_permitted',
  'a stranger cannot cancel'
);
select pg_temp.act_as('10000000-0000-0000-0000-000000000003', false);
select throws_ok(
  $$ select public.cancel_booking('80000000-0000-0000-0000-000000000002') $$,
  'GBA02', 'not_permitted',
  'a manager of another branch cannot cancel'
);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ select public.cancel_booking('80000000-0000-0000-0000-000000000002', 'Plans changed') $$,
  'the guest who took the booking over cancels it'
);
select results_eq(
  $$ select status::text, cancellation_metadata ->> 'by', cancellation_metadata ->> 'reason',
       (cancellation_metadata ->> 'cancelled_by')::uuid
     from public.bookings where id = '80000000-0000-0000-0000-000000000002' $$,
  $$ values ('cancelled', 'client', 'Plans changed', 'b0000000-0000-0000-0000-000000000001'::uuid) $$,
  'the cancellation records who, as which side, and why'
);
select throws_ok(
  $$ select public.cancel_booking('80000000-0000-0000-0000-000000000002') $$,
  'GBB04', 'booking_not_cancellable',
  'a cancelled booking cannot be cancelled again'
);
reset role;
select results_eq(
  $$ select recipient_user_id from public.notifications
     where entity_id = '80000000-0000-0000-0000-000000000002' and type = 'booking_cancelled' order by recipient_user_id $$,
  $$ values ('10000000-0000-0000-0000-000000000002'::uuid), ('10000000-0000-0000-0000-000000000004'::uuid) $$,
  'a client''s cancellation notifies the deposit reviewers and the booked staff member'
);
select ok(
  exists (select 1 from public.activity_logs where action = 'booking.cancelled' and entity_id = '80000000-0000-0000-0000-000000000002'),
  'the cancellation writes its activity row'
);
set local role authenticated;
select pg_temp.act_as('10000000-0000-0000-0000-000000000008', true);
select throws_ok(
  $$ select public.cancel_booking('80000000-0000-0000-0000-000000000003') $$,
  'GBB04', 'booking_not_cancellable',
  'an expired hold cannot be cancelled'
);
select pg_temp.act_as('10000000-0000-0000-0000-000000000005', false);
select throws_ok(
  $$ select public.cancel_booking('80000000-0000-0000-0000-000000000005') $$,
  'GBA02', 'not_permitted',
  'a restricted organization''s owner cannot cancel'
);
select pg_temp.act_as('10000000-0000-0000-0000-000000000007', false);
select lives_ok(
  $$ select public.cancel_booking('80000000-0000-0000-0000-000000000005') $$,
  'a client still cancels at a restricted organization'
);
select pg_temp.act_as('10000000-0000-0000-0000-000000000002', false);
select lives_ok(
  $$ select public.cancel_booking('80000000-0000-0000-0000-000000000001', 'Therapist unwell') $$,
  'the owner cancels a confirmed booking at one of their branches'
);
reset role;
select results_eq(
  $$ select cancellation_metadata ->> 'by', (select recipient_user_id from public.notifications
       where entity_id = '80000000-0000-0000-0000-000000000001' and type = 'booking_cancelled' and title = 'Your booking was cancelled')
     from public.bookings where id = '80000000-0000-0000-0000-000000000001' $$,
  $$ values ('shop', '10000000-0000-0000-0000-000000000007'::uuid) $$,
  'a shop cancellation is recorded as the shop''s and notifies the booking''s creator'
);

select * from finish();
rollback;
