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
-- Later phases add the catalogue, staff profiles, bookings, sales, and statements listed in
-- docs/backend-schema.md §15.

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

insert into public.organizations (id, name, slug, category, access_status, restricted_at, restriction_reason, cancellation_policy)
values
  ('20000000-0000-0000-0000-000000000001', 'Haven Spa', 'haven-spa', 'spa', 'active', null, null,
   'Cancel at least 24 hours ahead for a full deposit refund.'),
  ('20000000-0000-0000-0000-000000000002', 'Kanto Barbers', 'kanto-barbers', 'barbershop', 'restricted', now() - interval '2 days',
   'overdue_statement', 'Deposits are not refunded for no-shows.');

insert into public.branches (id, organization_id, name, slug, address, city, area, contact_number)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Makati', 'haven-spa-makati',
   '123 Jupiter Street', 'Makati', 'Bel-Air', '0917 555 0101'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'BGC Late Night', 'haven-spa-bgc',
   '5th Avenue corner 26th Street', 'Taguig', 'Bonifacio Global City', '0917 555 0102'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Cubao', 'kanto-barbers-cubao',
   '45 Aurora Boulevard', 'Quezon City', 'Cubao', '0918 555 0201');

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
