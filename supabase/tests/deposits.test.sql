-- Deposits: reporting payment, reviewing it, fee entries, refunds, the review jobs, and the
-- payment-proofs bucket. Uses the seeded Haven Spa and Kanto Barbers (supabase/seed.sql) and holds
-- fresh slots at Makati.
--
-- Ways these could fail, each covered below:
--  1. Someone other than the booking's creator reports payment, or points a screenshot at another
--     booking's folder.
--  2. A payment is accepted after the hold ran out (before expire_holds has run), or reported again
--     while one is under review.
--  3. Reporting does not start the review time, or resubmission does not restart it.
--  4. Someone who may not review deposits (staff without permission, another branch's manager, a
--     guest) reviews; or an old proof, a reviewed proof, or a flagged booking's resubmission is
--     decided.
--  5. Accepting does not create exactly one fee entry, or a failure after the earlier writes leaves
--     rows behind.
--  6. Rejecting keeps the slot; review expiry releases it or forgets to notify; a reminder repeats.
--  7. Cancelling leaves a submitted proof in review.
--  8. A refund is recorded by someone who may not, or on a booking it does not apply to.
--  9. Proofs, fee entries, or screenshots are readable beyond the submitter, the branch's deposit
--     reviewers, and (for fees) the owner, including a restricted owner.

begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

create temporary table fixture (key text primary key, id uuid not null);
grant select, insert on fixture to authenticated, anon;

create function pg_temp.fixture_id(p_key text) returns uuid language sql stable as $$
  select id from fixture where key = p_key;
$$;

create function pg_temp.act_as(p_user_id uuid, p_is_anonymous boolean) returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated', 'is_anonymous', p_is_anonymous)::text,
    true
  );
$$;

create function pg_temp.clear_claims() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;

-- Holds the first free haircut slot with the given Makati staff member, from three weeks out, as the
-- current caller.
create function pg_temp.hold_haircut(p_staff_id uuid) returns uuid language sql as $$
  select booking_id
  from public.create_online_booking(
    '30000000-0000-0000-0000-000000000001', array['60000000-0000-0000-0000-000000000003'::uuid],
    (
      select s.start_at
      from generate_series(
        private.business_date(now(), 'Asia/Manila', '05:00') + 21,
        private.business_date(now(), 'Asia/Manila', '05:00') + 29,
        interval '1 day'
      ) as day
      cross join lateral public.get_available_slots('30000000-0000-0000-0000-000000000001', day::date,
        array['60000000-0000-0000-0000-000000000003'::uuid], p_staff_id) s
      order by s.start_at
      limit 1
    ),
    'Test Guest', '0917 000 0000', '2026-11-05', p_staff_id
  );
$$;

grant execute on function pg_temp.fixture_id(text), pg_temp.hold_haircut(uuid) to authenticated;

-- Four guests, and a Makati staff member who may not review deposits.
insert into fixture (key, id)
select key, gen_random_uuid()
from unnest(array['guest_a', 'guest_b', 'guest_c', 'guest_d', 'plain_staff', 'plain_member']) as key;
insert into auth.users (id, email, is_anonymous)
select pg_temp.fixture_id(key), case when key = 'plain_staff' then 'plain@deposits.test' end, key <> 'plain_staff'
from unnest(array['guest_a', 'guest_b', 'guest_c', 'guest_d', 'plain_staff']) as key;
insert into public.organization_members (id, organization_id, user_id, role)
values (pg_temp.fixture_id('plain_member'), '20000000-0000-0000-0000-000000000001', pg_temp.fixture_id('plain_staff'), 'staff');
insert into public.member_branches (member_id, branch_id, organization_id)
values (pg_temp.fixture_id('plain_member'), '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');

-- Seeded people: Marisol (owner), Paolo (BGC manager), Jenny (Makati staff who reviews deposits),
-- Ramon (owner of the restricted Kanto Barbers), and Bea (a client).
insert into fixture (key, id) values
  ('owner', '10000000-0000-0000-0000-000000000002'),
  ('bgc_manager', '10000000-0000-0000-0000-000000000003'),
  ('reviewing_staff', '10000000-0000-0000-0000-000000000004'),
  ('restricted_owner', '10000000-0000-0000-0000-000000000005'),
  ('client', '10000000-0000-0000-0000-000000000007'),
  ('jenny', '70000000-0000-0000-0000-000000000001'),
  ('carlo', '70000000-0000-0000-0000-000000000002');

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('guest_a'), true);
insert into fixture select 'booking_a', pg_temp.hold_haircut(pg_temp.fixture_id('jenny'));
select pg_temp.act_as(pg_temp.fixture_id('guest_b'), true);
insert into fixture select 'booking_b', pg_temp.hold_haircut(pg_temp.fixture_id('carlo'));
select pg_temp.act_as(pg_temp.fixture_id('guest_c'), true);
insert into fixture select 'booking_c', pg_temp.hold_haircut(pg_temp.fixture_id('carlo'));
select pg_temp.act_as(pg_temp.fixture_id('guest_d'), true);
insert into fixture select 'booking_d', pg_temp.hold_haircut(pg_temp.fixture_id('jenny'));
reset role;

create function pg_temp.proof_folder(p_booking_key text) returns text language sql stable as $$
  select organization_id || '/' || id || '/' from public.bookings where id = pg_temp.fixture_id(p_booking_key);
$$;
grant execute on function pg_temp.proof_folder(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1–3. Reporting payment
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('guest_b'), true);
select throws_ok(
  $$ select public.submit_payment_proof(pg_temp.fixture_id('booking_a'), 'REF', 110.50, 'gcash') $$,
  'GBA02', 'not_permitted',
  'only the booking''s creator reports its payment'
);
select pg_temp.act_as(pg_temp.fixture_id('guest_a'), true);
select throws_ok(
  format($$ select public.submit_payment_proof(pg_temp.fixture_id('booking_a'), 'REF', 110.50, 'gcash', '%sshot.png') $$,
    pg_temp.proof_folder('booking_b')),
  'GBA02', 'not_permitted',
  'a screenshot must be in the booking''s own folder'
);
select lives_ok(
  format($$ insert into fixture select 'proof_a1', public.submit_payment_proof(pg_temp.fixture_id('booking_a'), 'GC-111', 110.50,
       'gcash', '%sshot.png', 'Paid just now') $$, pg_temp.proof_folder('booking_a')),
  'the creator reports payment with a screenshot'
);
select throws_ok(
  $$ select public.submit_payment_proof(pg_temp.fixture_id('booking_a'), 'GC-112', 110.50, 'gcash') $$,
  'GBP02', 'payment_not_expected',
  'a second report while one is under review is refused'
);
reset role;

select results_eq(
  $$ select status::text, review_expires_at - now(), review_reminder_sent_at from public.bookings where id = pg_temp.fixture_id('booking_a') $$,
  $$ values ('payment_submitted', interval '12 hours', null::timestamptz) $$,
  'reporting payment moves the booking to payment_submitted and starts the 12-hour review time'
);
select results_eq(
  $$ select status::text, reference_number, amount_paid, method::text, submitted_by from public.payment_proofs
     where id = pg_temp.fixture_id('proof_a1') $$,
  $$ values ('submitted', 'GC-111', 110.50::numeric(20,2), 'gcash', pg_temp.fixture_id('guest_a')) $$,
  'the proof is stored as submitted'
);
select results_eq(
  $$ select recipient_user_id from public.notifications where entity_id = pg_temp.fixture_id('booking_a') and type = 'payment_submitted'
     order by recipient_user_id $$,
  $$ values ('10000000-0000-0000-0000-000000000002'::uuid), ('10000000-0000-0000-0000-000000000004'::uuid) $$,
  'the branch''s deposit reviewers are told: the owner and the staff member who reviews deposits'
);
select ok(
  exists (select 1 from public.activity_logs where action = 'payment_proof.submitted' and entity_id = pg_temp.fixture_id('booking_a')),
  'reporting writes its activity row'
);

-- 2. The hold ran out: refused even before the expire_holds job has tidied it.
update public.bookings set hold_expires_at = now() - interval '1 second' where id = pg_temp.fixture_id('booking_b');
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('guest_b'), true);
select throws_ok(
  $$ select public.submit_payment_proof(pg_temp.fixture_id('booking_b'), 'GC-222', 110.50, 'gcash') $$,
  'GBP01', 'hold_ran_out',
  'a report after the hold ran out is refused before the job has run'
);
reset role;
select private.expire_holds();
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('guest_b'), true);
select throws_ok(
  $$ select public.submit_payment_proof(pg_temp.fixture_id('booking_b'), 'GC-222', 110.50, 'gcash') $$,
  'GBP01', 'hold_ran_out',
  'and after the job has moved it to hold_expired'
);
reset role;

-- ---------------------------------------------------------------------------
-- 9. Who reads proofs
-- ---------------------------------------------------------------------------

create function pg_temp.visible_proof_count(p_booking_key text) returns integer language sql stable as $$
  select count(*)::integer from public.payment_proofs where booking_id = pg_temp.fixture_id(p_booking_key);
$$;
grant execute on function pg_temp.visible_proof_count(text) to authenticated;

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('guest_a'), true);
select is(pg_temp.visible_proof_count('booking_a'), 1, 'the submitter reads their proof');
select pg_temp.act_as(pg_temp.fixture_id('reviewing_staff'), false);
select is(pg_temp.visible_proof_count('booking_a'), 1, 'a staff member who reviews deposits at the branch reads it');
select pg_temp.act_as(pg_temp.fixture_id('plain_staff'), false);
select is(pg_temp.visible_proof_count('booking_a'), 0, 'a staff member who may not review deposits does not');
select pg_temp.act_as(pg_temp.fixture_id('bgc_manager'), false);
select is(pg_temp.visible_proof_count('booking_a'), 0, 'another branch''s manager does not');
select pg_temp.act_as(pg_temp.fixture_id('restricted_owner'), false);
select is(pg_temp.visible_proof_count('booking_a'), 0, 'another organization''s owner does not');
select is(
  (select count(*)::integer from public.payment_proofs where booking_id = '80000000-0000-0000-0000-000000000005'),
  0,
  'a restricted organization''s owner cannot read even their own branch''s proofs'
);

-- ---------------------------------------------------------------------------
-- 4. Who reviews, and resubmission
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.fixture_id('plain_staff'), false);
select throws_ok(
  $$ select public.review_payment_proof(pg_temp.fixture_id('proof_a1'), 'accepted') $$,
  'GBA02', 'not_permitted',
  'staff who may not review deposits cannot decide'
);
select pg_temp.act_as(pg_temp.fixture_id('bgc_manager'), false);
select throws_ok(
  $$ select public.review_payment_proof(pg_temp.fixture_id('proof_a1'), 'accepted') $$,
  'GBA02', 'not_permitted',
  'another branch''s manager cannot decide'
);
select pg_temp.act_as(pg_temp.fixture_id('guest_a'), true);
select throws_ok(
  $$ select public.review_payment_proof(pg_temp.fixture_id('proof_a1'), 'accepted') $$,
  'GBA01', 'sign_in_required',
  'a guest cannot decide'
);
reset role;

update public.bookings set review_expires_at = now() + interval '30 minutes', review_reminder_sent_at = now()
where id = pg_temp.fixture_id('booking_a');
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('reviewing_staff'), false);
select lives_ok(
  $$ select public.review_payment_proof(pg_temp.fixture_id('proof_a1'), 'resubmission_requested', 'Short by ₱10.50.') $$,
  'a staff member who reviews deposits asks for resubmission'
);
reset role;
select results_eq(
  $$ select b.status::text, b.review_expires_at - now(), b.review_reminder_sent_at, p.status::text, p.review_note, p.reviewed_by
     from public.bookings b join public.payment_proofs p on p.booking_id = b.id
     where b.id = pg_temp.fixture_id('booking_a') $$,
  $$ values ('needs_resubmission', interval '12 hours', null::timestamptz, 'resubmission_requested', 'Short by ₱10.50.',
       pg_temp.fixture_id('reviewing_staff')) $$,
  'asking for resubmission restarts the full review time and records the note'
);
select ok(
  exists (select 1 from public.notifications where entity_id = pg_temp.fixture_id('booking_a')
    and recipient_user_id = pg_temp.fixture_id('guest_a') and type = 'payment_resubmission_requested'
    and body like '%Short by ₱10.50.'),
  'the client is told, with the shop''s note'
);

update public.bookings set review_expires_at = now() + interval '5 minutes' where id = pg_temp.fixture_id('booking_a');
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('guest_a'), true);
select lives_ok(
  $$ insert into fixture select 'proof_a2', public.submit_payment_proof(pg_temp.fixture_id('booking_a'), 'GC-113', 110.50, 'gcash') $$,
  'the client reports again'
);
reset role;
select results_eq(
  $$ select status::text, review_expires_at - now() from public.bookings where id = pg_temp.fixture_id('booking_a') $$,
  $$ values ('payment_submitted', interval '12 hours') $$,
  'a new report restarts the review time'
);
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('owner'), false);
select throws_ok(
  $$ select public.review_payment_proof(pg_temp.fixture_id('proof_a1'), 'accepted') $$,
  'GBP03', 'proof_not_reviewable',
  'an earlier proof cannot be decided once a newer one exists'
);

-- ---------------------------------------------------------------------------
-- 5. Accepting: exactly one fee entry, and rollback
-- ---------------------------------------------------------------------------

reset role;
create function pg_temp.fail_fee_entries() returns trigger language plpgsql as $$
begin
  raise exception 'forced failure';
end;
$$;
create trigger forced_failure before insert on public.fee_entries
  for each row execute function pg_temp.fail_fee_entries();
create temporary table counts_before as
select (select count(*) from public.activity_logs) as activity_logs, (select count(*) from public.notifications) as notifications;

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('owner'), false);
select throws_ok(
  $$ select public.review_payment_proof(pg_temp.fixture_id('proof_a2'), 'accepted') $$,
  'P0001', 'forced failure',
  'a failure while recording the fee fails the acceptance'
);
reset role;
select results_eq(
  $$ select b.status::text, p.status::text, p.reviewed_by,
       (select count(*)::integer from public.fee_entries where booking_id = b.id),
       (select count(*) from public.activity_logs) - (select activity_logs from counts_before),
       (select count(*) from public.notifications) - (select notifications from counts_before)
     from public.bookings b join public.payment_proofs p on p.id = pg_temp.fixture_id('proof_a2')
     where b.id = pg_temp.fixture_id('booking_a') $$,
  $$ values ('payment_submitted', 'submitted', null::uuid, 0, 0::bigint, 0::bigint) $$,
  'nothing from the failed acceptance remains: the booking, proof, fee entries, log, and notifications are as before'
);
drop trigger forced_failure on public.fee_entries;

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('owner'), false);
select lives_ok(
  $$ select public.review_payment_proof(pg_temp.fixture_id('proof_a2'), 'accepted') $$,
  'the owner accepts the payment'
);
select throws_ok(
  $$ select public.review_payment_proof(pg_temp.fixture_id('proof_a2'), 'accepted') $$,
  'GBP03', 'proof_not_reviewable',
  'an accepted proof cannot be decided again'
);
reset role;
select results_eq(
  $$ select b.status::text, f.kind::text, f.amount, f.branch_id, f.created_by,
       (select count(*)::integer from public.fee_entries where booking_id = b.id)
     from public.bookings b join public.fee_entries f on f.booking_id = b.id
     where b.id = pg_temp.fixture_id('booking_a') $$,
  $$ values ('confirmed', 'booking_fee', 10.50::numeric(20,2), '30000000-0000-0000-0000-000000000001'::uuid,
       pg_temp.fixture_id('owner'), 1) $$,
  'accepting confirms the booking and records exactly one fee entry for its convenience fee'
);
select ok(
  exists (select 1 from public.notifications where entity_id = pg_temp.fixture_id('booking_a')
    and recipient_user_id = pg_temp.fixture_id('guest_a') and title = 'Booking confirmed'),
  'the client is told the booking is confirmed'
);
select ok(
  exists (select 1 from public.activity_logs where action = 'payment_proof.reviewed' and entity_id = pg_temp.fixture_id('booking_a')
    and metadata ->> 'outcome' = 'accepted'),
  'the decision writes its activity row'
);

-- Fee entries are the owner's, whatever the organization's access status.
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('owner'), false);
select ok(
  (select count(*) from public.fee_entries where booking_id = pg_temp.fixture_id('booking_a')) = 1,
  'the owner reads the fee entry'
);
select pg_temp.act_as(pg_temp.fixture_id('reviewing_staff'), false);
select is((select count(*)::integer from public.fee_entries), 0, 'staff read no fee entries');
select pg_temp.act_as(pg_temp.fixture_id('bgc_manager'), false);
select is((select count(*)::integer from public.fee_entries), 0, 'managers read no fee entries');
select pg_temp.act_as(pg_temp.fixture_id('restricted_owner'), false);
select results_eq(
  $$ select booking_id from public.fee_entries $$,
  $$ values ('80000000-0000-0000-0000-000000000005'::uuid) $$,
  'a restricted organization''s owner still reads their own fee entries, and only those'
);

-- ---------------------------------------------------------------------------
-- 6. Rejecting, review expiry, and reminders
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.fixture_id('guest_c'), true);
insert into fixture select 'proof_c', public.submit_payment_proof(pg_temp.fixture_id('booking_c'), 'GC-333', 50, 'gcash');
select pg_temp.act_as(pg_temp.fixture_id('owner'), false);
select lives_ok(
  $$ select public.review_payment_proof(pg_temp.fixture_id('proof_c'), 'rejected', 'No payment with this reference.') $$,
  'the owner rejects a short payment'
);
reset role;
select is(
  (select status::text from public.bookings where id = pg_temp.fixture_id('booking_c')),
  'payment_rejected',
  'the booking is rejected'
);
select ok(
  (select b.start_at in (
     select s.start_at from public.get_available_slots(b.branch_id, b.business_date, array['60000000-0000-0000-0000-000000000003'::uuid], b.staff_id) s)
   from public.bookings b where b.id = pg_temp.fixture_id('booking_c')),
  'its slot is offered again'
);
select is(
  (select count(*)::integer from public.fee_entries where booking_id = pg_temp.fixture_id('booking_c')),
  0,
  'a rejection records no fee'
);

-- Review time passes on a reported payment: flagged, slot kept, both sides told.
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('guest_d'), true);
insert into fixture select 'proof_d', public.submit_payment_proof(pg_temp.fixture_id('booking_d'), 'GC-444', 110.50, 'maya');
reset role;
update public.bookings set review_expires_at = now() - interval '1 second' where id = pg_temp.fixture_id('booking_d');
update public.bookings set review_expires_at = now() - interval '1 second' where id = '80000000-0000-0000-0000-000000000007';
select pg_temp.clear_claims();
select ok(private.expire_reviews() >= 2, 'expire_reviews flags the bookings whose review time passed');
select results_eq(
  $$ select status::text from public.bookings where id in (pg_temp.fixture_id('booking_d'), '80000000-0000-0000-0000-000000000007') $$,
  $$ values ('review_expired_pending_resolution'), ('review_expired_pending_resolution') $$,
  'a reported payment, and an awaited resubmission, become review_expired_pending_resolution'
);
select ok(
  not (select b.start_at in (
     select s.start_at from public.get_available_slots(b.branch_id, b.business_date, array['60000000-0000-0000-0000-000000000003'::uuid], b.staff_id) s)
   from public.bookings b where b.id = pg_temp.fixture_id('booking_d')),
  'a flagged booking keeps its slot'
);
select results_eq(
  $$ select recipient_user_id from public.notifications where entity_id = pg_temp.fixture_id('booking_d') and type = 'review_expired'
     order by recipient_user_id $$,
  $$ select recipient from unnest(array['10000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000004'::uuid,
       pg_temp.fixture_id('guest_d')]) as recipient order by recipient $$,
  'the client and the deposit reviewers are told'
);
select ok(
  exists (select 1 from public.activity_logs where action = 'booking.review_expired' and actor_user_id is null
    and entity_id = pg_temp.fixture_id('booking_d')),
  'the job logs the expiry with no actor'
);
set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('owner'), false);
select throws_ok(
  $$ select public.review_payment_proof(pg_temp.fixture_id('proof_d'), 'resubmission_requested') $$,
  'GBP03', 'proof_not_reviewable',
  'a flagged booking offers only accept or reject'
);
select lives_ok(
  $$ select public.review_payment_proof(pg_temp.fixture_id('proof_d'), 'accepted') $$,
  'a flagged booking can still be accepted'
);
select pg_temp.act_as(pg_temp.fixture_id('reviewing_staff'), false);
select lives_ok(
  $$ select public.review_payment_proof(
       (select id from public.payment_proofs where booking_id = '80000000-0000-0000-0000-000000000007'), 'rejected') $$,
  'a flagged booking still awaiting resubmission is decided on its latest proof'
);
reset role;

-- Reminders, once.
update public.bookings set status = 'payment_submitted', review_expires_at = now() + interval '30 minutes', review_reminder_sent_at = null
where id = '80000000-0000-0000-0000-000000000006';
select pg_temp.clear_claims();
select is(private.remind_pending_reviews(), 1, 'a reported payment with under an hour of review time left gets a reminder');
select results_eq(
  $$ select recipient_user_id from public.notifications where entity_id = '80000000-0000-0000-0000-000000000006' and type = 'review_reminder'
     order by recipient_user_id $$,
  $$ values ('10000000-0000-0000-0000-000000000002'::uuid), ('10000000-0000-0000-0000-000000000004'::uuid) $$,
  'the deposit reviewers are reminded'
);
select is(private.remind_pending_reviews(), 0, 'a reminder is sent only once');

-- ---------------------------------------------------------------------------
-- 7–8. Cancelling withdraws a proof; refunds
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('client'), false);
select lives_ok(
  $$ select public.cancel_booking('80000000-0000-0000-0000-000000000006', 'Found another time') $$,
  'the client cancels a booking whose payment is under review'
);
reset role;
select is(
  (select status::text from public.payment_proofs where booking_id = '80000000-0000-0000-0000-000000000006'),
  'withdrawn',
  'cancelling withdraws the submitted proof'
);

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('plain_staff'), false);
select throws_ok(
  $$ select public.record_refund_outcome('80000000-0000-0000-0000-000000000006', true, 100) $$,
  'GBA02', 'not_permitted',
  'staff who may not review deposits cannot record a refund'
);
select pg_temp.act_as(pg_temp.fixture_id('reviewing_staff'), false);
select throws_ok(
  $$ select public.record_refund_outcome(pg_temp.fixture_id('booking_a'), true, 100) $$,
  'GBP04', 'refund_not_applicable',
  'a confirmed booking has no refund to record'
);
select lives_ok(
  $$ select public.record_refund_outcome('80000000-0000-0000-0000-000000000006', true, 100, 'Sent back through GCash') $$,
  'a deposit reviewer records the refund on a cancelled booking'
);
reset role;
select results_eq(
  $$ select refund_metadata ->> 'outcome', (refund_metadata ->> 'amount')::numeric, refund_metadata ->> 'note',
       (refund_metadata ->> 'recorded_by')::uuid
     from public.bookings where id = '80000000-0000-0000-0000-000000000006' $$,
  $$ values ('refunded', 100::numeric, 'Sent back through GCash', pg_temp.fixture_id('reviewing_staff')) $$,
  'the refund records the outcome, amount, note, and who'
);

-- ---------------------------------------------------------------------------
-- 9. Screenshots
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as(pg_temp.fixture_id('guest_a'), true);
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id) values ('payment-proofs', '%sshot.png', '%s') $$,
    pg_temp.proof_folder('booking_a'), pg_temp.fixture_id('guest_a')),
  'the creator uploads a screenshot into the booking''s folder'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('payment-proofs', '%sshot.png') $$,
    pg_temp.proof_folder('booking_c')),
  '42501', null,
  'nobody uploads into another booking''s folder'
);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'payment-proofs' and name like pg_temp.proof_folder('booking_a') || '%'),
  1,
  'the uploader reads their screenshot'
);
select pg_temp.act_as(pg_temp.fixture_id('reviewing_staff'), false);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'payment-proofs' and name like pg_temp.proof_folder('booking_a') || '%'),
  1,
  'a deposit reviewer of the branch reads it'
);
select pg_temp.act_as(pg_temp.fixture_id('plain_staff'), false);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'payment-proofs'),
  0,
  'staff who may not review deposits read no screenshots'
);
reset role;

select * from finish();
rollback;
