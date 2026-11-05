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
-- Later phases add bookings, sales, and statements (docs/backend-schema.md §15).

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
    ('10000000-0000-0000-0000-000000000008'::uuid, null, null)
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
