-- Local development and test data. Never applied to the hosted project.
--
-- Every seeded email user signs in with the password `groombox-local`.
--   admin@groombox.test     platform admin
--   owner@haven.test        owner, Haven Spa (two branches; BGC is open 2:00 PM to 2:00 AM)
--   manager@haven.test      manager, Haven Spa BGC
--   staff@haven.test        staff, Haven Spa Makati, may review deposits
--   owner@kanto.test        owner, Kanto Barbers (restricted for an overdue statement)
--   staff@kanto.test        staff, Kanto Barbers Cubao
--   client@groombox.test    client with no membership
-- One anonymous guest session is seeded as well.
--
-- Haven Spa's branches and Kanto Barbers' branch are set up and published, with a catalogue,
-- staff, shifts (BGC's run past midnight), and payment details. The payment QR images and Haven's
-- logo are files in storage, which SQL cannot upload: after `supabase db reset`, run
-- `npm run db:seed:images` to put placeholder images at the seeded paths.
--
-- Bookings are placed relative to the time of the seed: a confirmed BGC booking that crosses
-- midnight; at Makati a guest's held and expired holds, a client's cancelled booking, and bookings
-- in every deposit review status, and today's floor (a waiting walk-in, an arrived appointment, a
-- walk-in in service), yesterday's no-show, and tomorrow's appointment; and a confirmed booking at the
-- restricted Kanto Barbers; and yesterday at Makati, two completed sales and the closed day.
-- Payment proofs cover every status, and each accepted deposit has its fee entry. Phase 8 adds
-- statements (docs/backend-schema.md §15).

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  seeded.id,
  'authenticated',
  'authenticated',
  seeded.email,
  case when seeded.email is null then null else extensions.crypt('groombox-local', extensions.gen_salt('bf')) end,
  case when seeded.email is null then null else now() end,
  case when seeded.email is null then '{}'::jsonb else '{"provider": "email", "providers": ["email"]}'::jsonb end,
  jsonb_build_object('full_name', seeded.full_name),
  seeded.email is null,
  now(),
  now(),
  '', '', '', ''
from (
  values
    ('10000000-0000-0000-0000-000000000001'::uuid, 'admin@groombox.test', 'Gabriel Admin'),
    ('10000000-0000-0000-0000-000000000002'::uuid, 'owner@haven.test', 'Marisol Reyes'),
    ('10000000-0000-0000-0000-000000000003'::uuid, 'manager@haven.test', 'Paolo Cruz'),
    ('10000000-0000-0000-0000-000000000004'::uuid, 'staff@haven.test', 'Jenny Santos'),
    ('10000000-0000-0000-0000-000000000005'::uuid, 'owner@kanto.test', 'Ramon Dizon'),
    ('10000000-0000-0000-0000-000000000006'::uuid, 'staff@kanto.test', 'Mike Villanueva'),
    ('10000000-0000-0000-0000-000000000007'::uuid, 'client@groombox.test', 'Bea Lim'),
    ('10000000-0000-0000-0000-000000000008'::uuid, null, 'Ana Guest')
) as seeded (id, email, full_name);

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(),
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email like '%.test';

insert into public.platform_admins (user_id) values ('10000000-0000-0000-0000-000000000001');

insert into public.organizations (
  id, name, slug, category, logo_path, access_status, restricted_at, restriction_reason, cancellation_policy,
  terms_accepted_at, terms_accepted_by
)
values
  ('20000000-0000-0000-0000-000000000001', 'Haven Spa', 'haven-spa', 'spa', '20000000-0000-0000-0000-000000000001/logo/seed-logo.png',
   'active', null, null, 'Cancel at least 24 hours ahead for a full deposit refund.',
   now() - interval '30 days', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000002', 'Kanto Barbers', 'kanto-barbers', 'barbershop', null, 'restricted', now() - interval '2 days',
   'overdue_statement', 'Deposits are not refunded for no-shows.',
   now() - interval '60 days', '10000000-0000-0000-0000-000000000005');

insert into public.branches (
  id, organization_id, name, slug, address, city, area, contact_number, payment_instructions, is_published
)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Makati', 'haven-spa-makati',
   '123 Jupiter Street', 'Makati', 'Bel-Air', '0917 555 0101',
   '{"method": "gcash", "account_name": "Haven Spa Makati", "account_number": "0917 555 0101", "qr_path": "20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/seed-qr.png"}',
   true),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'BGC Late Night', 'haven-spa-bgc',
   '5th Avenue corner 26th Street', 'Taguig', 'Bonifacio Global City', '0917 555 0102',
   '{"method": "maya", "account_name": "Haven Spa BGC", "account_number": "0917 555 0102", "qr_path": "20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000002/seed-qr.png"}',
   true),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Cubao', 'kanto-barbers-cubao',
   '45 Aurora Boulevard', 'Quezon City', 'Cubao', '0918 555 0201',
   '{"method": "gcash", "account_name": "Ramon Dizon", "account_number": "0918 555 0201", "qr_path": "20000000-0000-0000-0000-000000000002/30000000-0000-0000-0000-000000000003/seed-qr.png"}',
   true);

-- Makati: 10:00 AM to 8:00 PM, closed Mondays. BGC: 2:00 PM to 2:00 AM every day. Cubao: 9:00 AM to 7:00 PM.
insert into public.branch_hours (branch_id, organization_id, day_of_week, opens_at, closes_at, closes_next_day, is_closed)
select '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, day, '10:00'::time, '20:00'::time, false, day = 1
from generate_series(0, 6) as day
union all
select '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', day, '14:00', '02:00', true, false
from generate_series(0, 6) as day
union all
select '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', day, '09:00', '19:00', false, false
from generate_series(0, 6) as day;

insert into public.organization_members (id, organization_id, user_id, role, can_review_deposits)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'owner', false),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'manager', false),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'staff', true),
  ('40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', 'owner', false),
  ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000006', 'staff', false);

insert into public.member_branches (member_id, branch_id, organization_id)
values
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002');

insert into public.service_categories (id, organization_id, name, sort_order)
values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Massage', 0),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Hair', 1),
  ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Cuts', 0);

-- Hair color is a starting price with a 20% deposit override; the rest use the shop's ₱100 rule.
insert into public.services (
  id, organization_id, category_id, name, duration_minutes, buffer_minutes, price, price_is_starting, deposit_type,
  deposit_percent, sort_order
)
values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'Swedish massage', 60, 15, 900, false, null, null, 0),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'Foot spa', 45, 10, 500, false, null, null, 1),
  ('60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
   'Haircut', 45, 0, 350, false, null, null, 2),
  ('60000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
   'Hair color', 120, 15, 2500, true, 'percent', 20, 3),
  ('60000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003',
   'Barber cut', 30, 5, 250, false, null, null, 0);

insert into public.branch_services (branch_id, service_id, organization_id, price_override)
values
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null),
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', null),
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', null),
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', null),
  ('30000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1000),
  ('30000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', null),
  ('30000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', null);

-- Jenny has a login (staff@haven.test); Carlo and Lea do not.
insert into public.staff (id, organization_id, member_id, display_name, title, commission_percent)
values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003',
   'Jenny Santos', 'Stylist', 40),
  ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', null, 'Carlo Reyes', 'Senior stylist', 45),
  ('70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', null, 'Lea Ramos', 'Massage therapist', 35),
  ('70000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000005',
   'Mike Villanueva', 'Barber', 50);

insert into public.staff_branches (staff_id, branch_id, organization_id)
values
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002');

insert into public.staff_services (staff_id, service_id, organization_id, commission_percent_override)
values
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', null),
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', null),
  ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', null),
  ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 50),
  ('70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null),
  ('70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', null),
  ('70000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', null);

-- Makati (closed Mondays): Jenny and Carlo Tuesday to Sunday, Lea on weekends. BGC: Lea 2:00 PM
-- to 2:00 AM every day. Cubao: Mike every day.
insert into public.staff_shifts (organization_id, staff_id, branch_id, day_of_week, starts_at, ends_at, ends_next_day)
select '20000000-0000-0000-0000-000000000001'::uuid, '70000000-0000-0000-0000-000000000001'::uuid,
  '30000000-0000-0000-0000-000000000001'::uuid, day, '10:00'::time, '19:00'::time, false
from unnest(array[0, 2, 3, 4, 5, 6]) as day
union all
select '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
  day, '11:00', '20:00', false
from unnest(array[0, 2, 3, 4, 5, 6]) as day
union all
select '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001',
  day, '10:00', '18:00', false
from unnest(array[0, 6]) as day
union all
select '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002',
  day, '14:00', '02:00', true
from generate_series(1, 5) as day
union all
select '20000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003',
  day, '09:00', '19:00', false
from generate_series(0, 6) as day;

insert into public.staff_time_off (organization_id, staff_id, starts_at, ends_at, reason)
values (
  '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002',
  date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' + interval '7 days',
  date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' + interval '9 days', 'Family trip'
);

insert into public.branch_closures (organization_id, branch_id, starts_at, ends_at, reason)
values (
  '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' + interval '14 days',
  date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' + interval '15 days', 'Holiday'
);

insert into public.organization_invites (organization_id, code, role, branch_ids, expires_at, created_by)
values (
  '20000000-0000-0000-0000-000000000001', 'HAVENSTAFF000001', 'staff',
  array['30000000-0000-0000-0000-000000000001'::uuid], now() + interval '7 days', '10000000-0000-0000-0000-000000000002'
);

insert into public.notifications (recipient_user_id, organization_id, type, title, body)
values
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'welcome', 'Welcome to GroomBox',
   'Finish setting up your branches to start taking online bookings.'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'welcome', 'You joined Haven Spa',
   'You can now see the BGC Late Night branch.');


-- Clients: Bea at both organizations, and the guest at Haven Spa.
insert into public.clients (id, organization_id, user_id, full_name, mobile_number, notes)
values
  ('90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
   'Bea Lim', '0917 555 0303', 'Prefers a firm massage.'),
  ('90000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000008',
   'Ana Guest', '0917 555 0404', null),
  ('90000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000007',
   'Bea Lim', '0917 555 0303', null);

-- Seed dates in Manila: the first weekday at least three days out, when Lea works at BGC, and the
-- first day at least two days out that Makati is open.
create temporary table seed_dates as
select
  (
    select day::date
    from generate_series(today + 3, today + 9, interval '1 day') as day
    where extract(dow from day) between 1 and 5
    order by day
    limit 1
  ) as bgc_date,
  (
    select day::date
    from generate_series(today + 2, today + 8, interval '1 day') as day
    where extract(dow from day) <> 1
    order by day
    limit 1
  ) as makati_date,
  today + 2 as cubao_date
from (select private.business_date(now(), 'Asia/Manila', '05:00') as today) as manila;

-- Booking codes come from the database; the seed omits them.
insert into public.bookings (
  id, organization_id, branch_id, client_id, booked_by, staff_id, source, status, start_at, end_at, business_date,
  service_total, deposit_amount, convenience_fee, amount_due, payment_instructions_snapshot, policy_acceptance_metadata,
  hold_expires_at, review_expires_at, cancellation_metadata
)
select
  seeded.id, seeded.organization_id, seeded.branch_id, seeded.client_id, seeded.booked_by, seeded.staff_id, 'online',
  seeded.status::public.booking_status, seeded.start_at, seeded.start_at + make_interval(mins => seeded.length_minutes),
  private.business_date(seeded.start_at, 'Asia/Manila', '05:00'), seeded.service_total, seeded.deposit_amount,
  seeded.convenience_fee, seeded.deposit_amount + seeded.convenience_fee, b.payment_instructions,
  jsonb_build_object(
    'cancellation_policy', o.cancellation_policy, 'privacy_notice_version', '2026-11-05',
    'accepted_at', now() - interval '2 hours'
  ),
  seeded.hold_expires_at, seeded.review_expires_at, seeded.cancellation_metadata
from seed_dates d
cross join lateral (
  values
    -- Swedish massage at BGC, 11:45 PM to 1:00 AM with its clean-up time.
    ('80000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid,
     '30000000-0000-0000-0000-000000000002'::uuid, '90000000-0000-0000-0000-000000000001'::uuid,
     '10000000-0000-0000-0000-000000000007'::uuid, '70000000-0000-0000-0000-000000000003'::uuid, 'confirmed',
     (d.bgc_date + time '23:45') at time zone 'Asia/Manila', 75, 1000.00, 100.00, 30.00,
     now() - interval '105 minutes', now() - interval '90 minutes', null::jsonb),
    -- The guest's haircut, held for the next 15 minutes.
    ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002',
     '10000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-000000000001', 'held',
     (d.makati_date + time '15:00') at time zone 'Asia/Manila', 45, 350.00, 100.00, 10.50,
     now() + interval '15 minutes', null::timestamptz, null),
    -- The guest's earlier hair color hold, which ran out.
    ('80000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002',
     '10000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-000000000002', 'hold_expired',
     (d.makati_date + time '13:00') at time zone 'Asia/Manila', 135, 2500.00, 500.00, 50.00,
     now() - interval '1 hour', null, null),
    -- Bea's haircut: she reported paying, then cancelled, which withdrew the proof. The refund is
    -- still to be recorded.
    ('80000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000001', 'cancelled',
     (d.makati_date + time '16:00') at time zone 'Asia/Manila', 45, 350.00, 100.00, 10.50,
     now() - interval '90 minutes', now() + interval '10 hours',
     jsonb_build_object(
       'by', 'client', 'cancelled_by', '10000000-0000-0000-0000-000000000007', 'cancelled_at', now() - interval '100 minutes',
       'reason', 'Schedule changed'
     )),
    -- Bea's barber cut at the restricted Kanto Barbers: booking links keep working.
    ('80000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002',
     '30000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003',
     '10000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000004', 'confirmed',
     (d.cubao_date + time '10:00') at time zone 'Asia/Manila', 35, 250.00, 100.00, 10.00,
     now() - interval '3 hours', now() - interval '2 hours', null),
    -- Bea's haircut with Carlo, payment reported and waiting for review.
    ('80000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000002', 'payment_submitted',
     (d.makati_date + time '17:00') at time zone 'Asia/Manila', 45, 350.00, 100.00, 10.50,
     now() - interval '50 minutes', now() + interval '11 hours', null),
    -- The guest's haircut with Jenny: the shop asked them to send their payment details again.
    ('80000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002',
     '10000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-000000000001', 'needs_resubmission',
     (d.makati_date + time '11:00') at time zone 'Asia/Manila', 45, 350.00, 100.00, 10.50,
     now() - interval '3 hours', now() + interval '10 hours', null),
    -- Bea's haircut with Carlo: the review time passed, so it is flagged and keeps its slot.
    ('80000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000002', 'review_expired_pending_resolution',
     (d.makati_date + time '18:00') at time zone 'Asia/Manila', 45, 350.00, 100.00, 10.50,
     now() - interval '14 hours', now() - interval '1 hour', null),
    -- The guest's haircut with Jenny, whose payment the shop rejected. The refund is still to be
    -- recorded.
    ('80000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002',
     '10000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-000000000001', 'payment_rejected',
     (d.makati_date + time '12:00') at time zone 'Asia/Manila', 45, 350.00, 100.00, 10.50,
     now() - interval '5 hours', now() + interval '6 hours', null)
) as seeded (
  id, organization_id, branch_id, client_id, booked_by, staff_id, status, start_at, length_minutes, service_total,
  deposit_amount, convenience_fee, hold_expires_at, review_expires_at, cancellation_metadata
)
join public.branches b on b.id = seeded.branch_id
join public.organizations o on o.id = seeded.organization_id;

insert into public.booking_services (
  booking_id, organization_id, service_id, service_name, duration_minutes, buffer_minutes, price, sort_order
)
values
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
   'Swedish massage', 60, 15, 1000.00, 1),
  ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
   'Haircut', 45, 0, 350.00, 1),
  ('80000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004',
   'Hair color', 120, 15, 2500.00, 1),
  ('80000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
   'Haircut', 45, 0, 350.00, 1),
  ('80000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000005',
   'Barber cut', 30, 5, 250.00, 1),
  ('80000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
   'Haircut', 45, 0, 350.00, 1),
  ('80000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
   'Haircut', 45, 0, 350.00, 1),
  ('80000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
   'Haircut', 45, 0, 350.00, 1),
  ('80000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
   'Haircut', 45, 0, 350.00, 1);

-- Payment proofs in every status. Screenshots are optional and the seed has none.
insert into public.payment_proofs (
  booking_id, organization_id, branch_id, submitted_by, reference_number, amount_paid, method, note, status, reviewed_by,
  reviewed_at, review_note, created_at
)
values
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000007', 'MAYA-5521-0091', 130.00, 'maya', null, 'accepted',
   '10000000-0000-0000-0000-000000000003', now() - interval '80 minutes', null, now() - interval '100 minutes'),
  ('80000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000007', 'GC-7781-2040', 110.00, 'gcash', null, 'accepted',
   '10000000-0000-0000-0000-000000000005', now() - interval '150 minutes', null, now() - interval '170 minutes'),
  ('80000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000007', 'GC-1180-3355', 110.50, 'gcash', null, 'withdrawn',
   null, null, null, now() - interval '105 minutes'),
  ('80000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000007', 'GC-4402-1187', 110.50, 'gcash', 'Paid from my sister''s account.', 'submitted',
   null, null, null, now() - interval '1 hour'),
  ('80000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000008', 'GC-0000-1111', 100.00, 'gcash', null, 'resubmission_requested',
   '10000000-0000-0000-0000-000000000004', now() - interval '2 hours', 'We received ₱100. Please send the remaining ₱10.50 and report again.',
   now() - interval '170 minutes'),
  ('80000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000007', 'BPI-88812', 110.50, 'bank_transfer', null, 'submitted',
   null, null, null, now() - interval '13 hours'),
  ('80000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000008', 'GC-9999-0000', 110.50, 'gcash', null, 'rejected',
   '10000000-0000-0000-0000-000000000002', now() - interval '4 hours', 'No payment with this reference reached our account.',
   now() - interval '290 minutes');

-- The fee owed to GroomBox for each accepted deposit.
insert into public.fee_entries (organization_id, branch_id, kind, booking_id, amount, accrued_at, created_by)
values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'booking_fee',
   '80000000-0000-0000-0000-000000000001', 30.00, now() - interval '80 minutes', '10000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'booking_fee',
   '80000000-0000-0000-0000-000000000005', 10.00, now() - interval '150 minutes', '10000000-0000-0000-0000-000000000005');

drop table seed_dates;

insert into public.notifications (recipient_user_id, organization_id, type, title, body, entity_type, entity_id)
values
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'booking_created', 'New online booking',
   'Bea Lim booked Swedish massage at BGC Late Night.', 'booking', '80000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 'booking_cancelled',
   'Booking cancelled', 'You cancelled your haircut at Makati.', 'booking', '80000000-0000-0000-0000-000000000004');

-- Today's floor at Makati, in Manila's business date: a waiting walk-in who would like Jenny, an
-- appointment with Carlo whose client has arrived, and a walk-in with Jenny already in service; plus
-- yesterday's no-show and tomorrow's appointment, both entered by the shop.
insert into public.clients (id, organization_id, user_id, full_name, mobile_number, notes)
values ('90000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', null, 'Rico Dela Cruz',
  '0918 555 0505', 'Sensitive to strong hair dyes. Patch test first.');

insert into public.bookings (
  id, organization_id, branch_id, client_id, booked_by, staff_id, source, status, start_at, end_at, business_date,
  service_total, queue_number, checked_in_at, started_at
)
select
  seeded.id, '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', seeded.client_id,
  '10000000-0000-0000-0000-000000000004', seeded.staff_id, seeded.source::public.booking_source,
  seeded.status::public.booking_status, seeded.start_at, seeded.start_at + interval '45 minutes',
  coalesce(private.business_date(seeded.start_at, 'Asia/Manila', '05:00'), manila.today), 350.00, seeded.queue_number,
  seeded.checked_in_at, seeded.started_at
from (select private.business_date(now(), 'Asia/Manila', '05:00') as today) as manila
cross join lateral (
  values
    ('80000000-0000-0000-0000-000000000010'::uuid, '90000000-0000-0000-0000-000000000004'::uuid,
     '70000000-0000-0000-0000-000000000001'::uuid, 'walk_in', 'waiting', null::timestamptz, 1::smallint,
     null::timestamptz, null::timestamptz),
    ('80000000-0000-0000-0000-000000000011', '90000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002',
     'staff', 'checked_in', now() - interval '5 minutes', null, now() - interval '8 minutes', null),
    ('80000000-0000-0000-0000-000000000012', '90000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001',
     'walk_in', 'in_service', now() - interval '20 minutes', 2, null, now() - interval '20 minutes'),
    ('80000000-0000-0000-0000-000000000013', '90000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000002',
     'staff', 'no_show', (manila.today - 1 + time '15:00') at time zone 'Asia/Manila', null, null, null),
    ('80000000-0000-0000-0000-000000000014', '90000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001',
     'staff', 'confirmed', (manila.today + 1 + time '14:00') at time zone 'Asia/Manila', null, null, null)
) as seeded (id, client_id, staff_id, source, status, start_at, queue_number, checked_in_at, started_at);

insert into public.booking_services (
  booking_id, organization_id, service_id, service_name, duration_minutes, buffer_minutes, price, sort_order
)
select booking.id, '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'Haircut', 45, 0, 350.00, 1
from unnest(array[
  '80000000-0000-0000-0000-000000000010', '80000000-0000-0000-0000-000000000011', '80000000-0000-0000-0000-000000000012',
  '80000000-0000-0000-0000-000000000013', '80000000-0000-0000-0000-000000000014'
]::uuid[]) as booking (id);

-- Yesterday at Makati: Rico's walk-in haircut with Jenny, paid in cash with a ₱50 tip; and Bea's
-- online hair color and haircut with Carlo, with a ₱285 discount, a ₱100 tip, and her ₱600 deposit
-- applied, the balance paid by GCash. The day is closed with a ₱1,000 float and the cash counted
-- exactly. Commission: Jenny's 40% default; Carlo's 50% override on hair color and 45% default on
-- the haircut, each after its discount share.
insert into public.bookings (
  id, organization_id, branch_id, client_id, booked_by, staff_id, source, status, start_at, end_at, business_date,
  service_total, deposit_amount, convenience_fee, amount_due, queue_number, payment_instructions_snapshot,
  policy_acceptance_metadata, hold_expires_at, review_expires_at, checked_in_at, started_at, completed_at
)
select
  seeded.id, '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', seeded.client_id,
  seeded.booked_by, seeded.staff_id, seeded.source::public.booking_source, 'completed', seeded.start_at,
  seeded.start_at + make_interval(mins => seeded.length_minutes), manila.today - 1, seeded.service_total, seeded.deposit,
  seeded.fee, seeded.deposit + seeded.fee, seeded.queue_number, seeded.payment_instructions, seeded.policy, seeded.hold_expires_at,
  seeded.review_expires_at, seeded.checked_in_at, seeded.start_at, seeded.start_at + make_interval(mins => seeded.length_minutes)
from (select private.business_date(now(), 'Asia/Manila', '05:00') as today) as manila
cross join lateral (
  values
    ('80000000-0000-0000-0000-000000000015'::uuid, '90000000-0000-0000-0000-000000000004'::uuid,
     '10000000-0000-0000-0000-000000000004'::uuid, '70000000-0000-0000-0000-000000000001'::uuid, 'walk_in',
     (manila.today - 1 + time '11:00') at time zone 'Asia/Manila', 45, 350.00, 0.00, 0.00, 1::smallint, null::jsonb,
     null::jsonb, null::timestamptz, null::timestamptz, null::timestamptz),
    ('80000000-0000-0000-0000-000000000016', '90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
     '70000000-0000-0000-0000-000000000002', 'online', (manila.today - 1 + time '13:00') at time zone 'Asia/Manila', 180,
     2850.00, 600.00, 50.00, null,
     (select b.payment_instructions from public.branches b where b.id = '30000000-0000-0000-0000-000000000001'),
     jsonb_build_object('cancellation_policy', 'Cancel at least 24 hours ahead for a full deposit refund.',
       'privacy_notice_version', '2026-11-05', 'accepted_at', now() - interval '3 days'),
     now() - interval '3 days' + interval '15 minutes', now() - interval '3 days' + interval '12 hours',
     (manila.today - 1 + time '12:55') at time zone 'Asia/Manila')
) as seeded (
  id, client_id, booked_by, staff_id, source, start_at, length_minutes, service_total, deposit, fee, queue_number,
  payment_instructions, policy, hold_expires_at, review_expires_at, checked_in_at
);

insert into public.booking_services (
  booking_id, organization_id, service_id, service_name, duration_minutes, buffer_minutes, price, sort_order
)
values
  ('80000000-0000-0000-0000-000000000015', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
   'Haircut', 45, 0, 350.00, 1),
  ('80000000-0000-0000-0000-000000000016', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004',
   'Hair color', 120, 15, 2500.00, 1),
  ('80000000-0000-0000-0000-000000000016', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
   'Haircut', 45, 0, 350.00, 2);

insert into public.payment_proofs (
  booking_id, organization_id, branch_id, submitted_by, reference_number, amount_paid, method, status, reviewed_by,
  reviewed_at, created_at
)
values ('80000000-0000-0000-0000-000000000016', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000007', 'GC-3300-6501', 650.00, 'gcash', 'accepted', '10000000-0000-0000-0000-000000000002',
  now() - interval '3 days' + interval '1 hour', now() - interval '3 days' + interval '10 minutes');

insert into public.fee_entries (organization_id, branch_id, kind, booking_id, amount, accrued_at, created_by)
values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'booking_fee',
  '80000000-0000-0000-0000-000000000016', 50.00, now() - interval '3 days' + interval '1 hour', '10000000-0000-0000-0000-000000000002');

insert into public.sales (
  id, organization_id, branch_id, booking_id, client_id, business_date, subtotal, discount_amount, tip_amount,
  deposit_applied, balance_collected, completed_by, completed_at
)
select seeded.id, '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', seeded.booking_id,
  seeded.client_id, private.business_date(now(), 'Asia/Manila', '05:00') - 1, seeded.subtotal, seeded.discount, seeded.tip,
  seeded.deposit_applied, seeded.subtotal - seeded.discount + seeded.tip - seeded.deposit_applied, seeded.completed_by,
  b.completed_at
from (
  values
    ('a1000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000015'::uuid,
     '90000000-0000-0000-0000-000000000004'::uuid, 350.00, 0.00, 50.00, 0.00, '10000000-0000-0000-0000-000000000004'::uuid),
    ('a1000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000016', '90000000-0000-0000-0000-000000000001',
     2850.00, 285.00, 100.00, 600.00, '10000000-0000-0000-0000-000000000004')
) as seeded (id, booking_id, client_id, subtotal, discount, tip, deposit_applied, completed_by)
join public.bookings b on b.id = seeded.booking_id;

insert into public.sale_items (
  sale_id, organization_id, service_id, description, staff_id, amount, discount_share, commission_percent,
  commission_amount, sort_order
)
values
  ('a1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
   'Haircut', '70000000-0000-0000-0000-000000000001', 350.00, 0.00, 40.00, 140.00, 1),
  ('a1000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004',
   'Hair color', '70000000-0000-0000-0000-000000000002', 2500.00, 250.00, 50.00, 1125.00, 1),
  ('a1000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
   'Haircut', '70000000-0000-0000-0000-000000000002', 350.00, 35.00, 45.00, 141.75, 2);

insert into public.sale_tips (sale_id, staff_id, organization_id, amount)
values
  ('a1000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 50.00),
  ('a1000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 100.00);

insert into public.sale_payments (sale_id, organization_id, method, amount, reference)
values
  ('a1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'cash', 400.00, null),
  ('a1000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'gcash', 2065.00, 'GC-3301-0002');

insert into public.daily_closes (
  id, organization_id, branch_id, business_date, gross_sales, discounts, tips, deposits_applied, deposits_received,
  fees_collected, totals_by_method, cash_float, cash_expected, cash_counted, cash_variance, closed_by, closed_at
)
values ('a2000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  private.business_date(now(), 'Asia/Manila', '05:00') - 1, 3200.00, 285.00, 150.00, 600.00, 0.00, 0.00,
  '{"cash": 400.00, "gcash": 2065.00}', 1000.00, 1400.00, 1400.00, 0.00, '10000000-0000-0000-0000-000000000002',
  now() - interval '10 hours');

insert into public.daily_close_staff (
  daily_close_id, staff_id, organization_id, service_revenue, commission_amount, tip_amount, visit_count
)
values
  ('a2000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   2565.00, 1266.75, 100.00, 1),
  ('a2000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   350.00, 140.00, 50.00, 1);
