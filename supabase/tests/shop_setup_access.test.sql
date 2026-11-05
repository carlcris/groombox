-- Shop setup: who may change the catalogue, staff, branch setup, shifts, time off, and storage.
--
-- Ways these rules could fail, each covered below:
--  1. A manager or staff member edits the catalogue, staff profiles, or commission.
--  2. A manager edits offerings, closures, or shifts at a branch they are not assigned to.
--  3. Staff edit any setup.
--  4. A manager records time off for staff outside their branches.
--  5. A shift is created at a branch the staff member is not assigned to, or a row points at
--     another organization's category, service, or staff.
--  6. A manager changes branch payment details.
--  7. create_branch or accept_terms runs for someone other than the owner, or create_branch
--     leaves a branch without its hours.
--  8. An invite names another organization's staff profile; accepting does not link the profile.
--  9. Storage: a manager writes outside their branches' photo folders, the logo, or payment QR.
-- 10. branch_setup_status misreports what a branch has towards publishing.

begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

create temporary table fixture (key text primary key, id uuid not null);
grant select, insert on fixture to authenticated, anon;

create temporary table invite_code (key text primary key, code text not null);
grant select, insert on invite_code to authenticated;

create function pg_temp.fixture_id(p_key text) returns uuid language sql stable as $$
  select id from fixture where key = p_key;
$$;

create function pg_temp.act_as(p_key text) returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', pg_temp.fixture_id(p_key), 'role', 'authenticated', 'is_anonymous', false)::text,
    true
  );
$$;

insert into fixture (key, id)
select key, gen_random_uuid()
from unnest(array['owner_a', 'manager_a', 'staff_a', 'owner_b', 'stylist_login']) as key;

insert into auth.users (id, email, raw_user_meta_data)
select id, key || '@setup.test', jsonb_build_object('full_name', key)
from fixture;

set local role authenticated;
select pg_temp.act_as('owner_a');
insert into fixture (key, id)
select 'org_a', organization_id from public.create_organization(
  'Setup Org', 'salon', 'North', 'Street 1', 'Makati', 'Salcedo',
  '[{"day_of_week": 1, "opens_at": "10:00", "closes_at": "20:00", "closes_next_day": false, "is_closed": false}]'
);
insert into fixture (key, id)
select 'branch_a2', public.create_branch(
  pg_temp.fixture_id('org_a'), 'South', 'Street 9', 'Pasay', 'Mall of Asia',
  '[{"day_of_week": 2, "opens_at": "14:00", "closes_at": "02:00", "closes_next_day": true, "is_closed": false}]'
);
select pg_temp.act_as('owner_b');
insert into fixture (key, id)
select 'org_b', organization_id from public.create_organization(
  'Other Setup Org', 'spa', 'Only', 'Street 2', 'Pasig', 'Ortigas', '[]'
);
reset role;

insert into fixture (key, id)
select 'branch_a1', id from public.branches where organization_id = pg_temp.fixture_id('org_a') and name = 'North';

insert into fixture (key, id) values ('member_manager_a', gen_random_uuid()), ('member_staff_a', gen_random_uuid());
insert into public.organization_members (id, organization_id, user_id, role)
values
  (pg_temp.fixture_id('member_manager_a'), pg_temp.fixture_id('org_a'), pg_temp.fixture_id('manager_a'), 'manager'),
  (pg_temp.fixture_id('member_staff_a'), pg_temp.fixture_id('org_a'), pg_temp.fixture_id('staff_a'), 'staff');
insert into public.member_branches (member_id, branch_id, organization_id)
values
  (pg_temp.fixture_id('member_manager_a'), pg_temp.fixture_id('branch_a1'), pg_temp.fixture_id('org_a')),
  (pg_temp.fixture_id('member_staff_a'), pg_temp.fixture_id('branch_a1'), pg_temp.fixture_id('org_a'));

-- The owner builds the catalogue and staff directly, under row-level security.
set local role authenticated;
select pg_temp.act_as('owner_a');
insert into fixture (key, id) values
  ('category_a', gen_random_uuid()), ('service_a', gen_random_uuid()),
  ('stylist_north', gen_random_uuid()), ('stylist_south', gen_random_uuid());
insert into public.service_categories (id, organization_id, name)
values (pg_temp.fixture_id('category_a'), pg_temp.fixture_id('org_a'), 'Hair');
insert into public.services (id, organization_id, category_id, name, duration_minutes, price)
values (pg_temp.fixture_id('service_a'), pg_temp.fixture_id('org_a'), pg_temp.fixture_id('category_a'), 'Haircut', 45, 350);
insert into public.staff (id, organization_id, display_name, commission_percent)
values
  (pg_temp.fixture_id('stylist_north'), pg_temp.fixture_id('org_a'), 'Nina', 40),
  (pg_temp.fixture_id('stylist_south'), pg_temp.fixture_id('org_a'), 'Sol', 35);
insert into public.staff_branches (staff_id, branch_id, organization_id)
values
  (pg_temp.fixture_id('stylist_north'), pg_temp.fixture_id('branch_a1'), pg_temp.fixture_id('org_a')),
  (pg_temp.fixture_id('stylist_south'), pg_temp.fixture_id('branch_a2'), pg_temp.fixture_id('org_a'));

-- 7. create_branch and accept_terms
select results_eq(
  $$ select day_of_week, closes_at, closes_next_day from public.branch_hours where branch_id = pg_temp.fixture_id('branch_a2') $$,
  $$ values (2::smallint, '02:00'::time, true) $$,
  'create_branch saves the new branch with its hours'
);
select ok(
  exists (select 1 from public.activity_logs where action = 'branch.created' and entity_id = pg_temp.fixture_id('branch_a2')),
  'create_branch writes its activity row'
);
select lives_ok($$ select public.accept_terms(pg_temp.fixture_id('org_a')) $$, 'the owner accepts the terms');

-- 10. Publishing status before and after the remaining items
select results_eq(
  $$ select has_location, open_day_count, offered_service_count, bookable_staff_with_shift_count, has_payment_details, terms_accepted
     from public.branch_setup_status where branch_id = pg_temp.fixture_id('branch_a1') $$,
  $$ values (true, 1::bigint, 0::bigint, 0::bigint, false, true) $$,
  'a new branch has its location, hours, and the terms, and nothing else yet'
);

-- 1. Catalogue and staff are the owner's
select pg_temp.act_as('manager_a');
select throws_ok(
  $$ insert into public.services (organization_id, category_id, name, duration_minutes, price)
     values (pg_temp.fixture_id('org_a'), pg_temp.fixture_id('category_a'), 'Color', 90, 1500) $$,
  '42501', null, 'a manager cannot add a service'
);
with changed as (update public.staff set commission_percent = 90 returning 1)
select is(count(*), 0::bigint, 'a manager cannot change commission') from changed;
with changed as (update public.services set price = 1 returning 1)
select is(count(*), 0::bigint, 'a manager cannot change catalogue prices') from changed;
select throws_ok(
  $$ select public.create_branch(pg_temp.fixture_id('org_a'), 'East', 'x', 'x', 'x', '[]') $$,
  'GBA02', 'not_permitted', 'a manager cannot add a branch'
);
select throws_ok(
  $$ select public.accept_terms(pg_temp.fixture_id('org_a')) $$,
  'GBA02', 'not_permitted', 'a manager cannot accept the terms'
);

-- 6. Branch payment details are the owner's
with changed as (
  update public.branches set payment_instructions = '{"method": "gcash"}'::jsonb
  where id = pg_temp.fixture_id('branch_a1') returning 1
)
select is(count(*), 0::bigint, 'a manager cannot change branch payment details') from changed;

-- 2. Branch setup at the manager's own branch only
select lives_ok(
  $$ insert into public.branch_services (branch_id, service_id, organization_id, price_override)
     values (pg_temp.fixture_id('branch_a1'), pg_temp.fixture_id('service_a'), pg_temp.fixture_id('org_a'), 300) $$,
  'a manager offers a service at their branch with a price override'
);
select throws_ok(
  $$ insert into public.branch_services (branch_id, service_id, organization_id)
     values (pg_temp.fixture_id('branch_a2'), pg_temp.fixture_id('service_a'), pg_temp.fixture_id('org_a')) $$,
  '42501', null, 'a manager cannot change offerings at another branch'
);
select lives_ok(
  $$ insert into public.staff_shifts (organization_id, staff_id, branch_id, day_of_week, starts_at, ends_at)
     values (pg_temp.fixture_id('org_a'), pg_temp.fixture_id('stylist_north'), pg_temp.fixture_id('branch_a1'), 1, '10:00', '19:00') $$,
  'a manager adds a shift at their branch'
);
select throws_ok(
  $$ insert into public.staff_shifts (organization_id, staff_id, branch_id, day_of_week, starts_at, ends_at)
     values (pg_temp.fixture_id('org_a'), pg_temp.fixture_id('stylist_south'), pg_temp.fixture_id('branch_a2'), 2, '14:00', '02:00') $$,
  '42501', null, 'a manager cannot add a shift at another branch'
);
select throws_ok(
  $$ insert into public.branch_closures (organization_id, branch_id, starts_at, ends_at)
     values (pg_temp.fixture_id('org_a'), pg_temp.fixture_id('branch_a2'), now(), now() + interval '1 day') $$,
  '42501', null, 'a manager cannot close another branch'
);

-- 4. Time off for staff at the manager's branches only
select lives_ok(
  $$ insert into public.staff_time_off (organization_id, staff_id, starts_at, ends_at)
     values (pg_temp.fixture_id('org_a'), pg_temp.fixture_id('stylist_north'), now(), now() + interval '1 day') $$,
  'a manager records time off for staff at their branch'
);
select throws_ok(
  $$ insert into public.staff_time_off (organization_id, staff_id, starts_at, ends_at)
     values (pg_temp.fixture_id('org_a'), pg_temp.fixture_id('stylist_south'), now(), now() + interval '1 day') $$,
  '42501', null, 'a manager cannot record time off for staff at another branch'
);

-- 3. Staff change no setup
select pg_temp.act_as('staff_a');
with changed as (update public.branch_services set price_override = 1 returning 1)
select is(count(*), 0::bigint, 'staff cannot change offerings') from changed;
select throws_ok(
  $$ insert into public.staff_shifts (organization_id, staff_id, branch_id, day_of_week, starts_at, ends_at)
     values (pg_temp.fixture_id('org_a'), pg_temp.fixture_id('stylist_north'), pg_temp.fixture_id('branch_a1'), 3, '10:00', '19:00') $$,
  '42501', null, 'staff cannot add shifts'
);
select is((select count(*) from public.services), 1::bigint, 'staff read the catalogue');

-- 5. Integrity across branches and organizations
select pg_temp.act_as('owner_a');
select throws_ok(
  $$ insert into public.staff_shifts (organization_id, staff_id, branch_id, day_of_week, starts_at, ends_at)
     values (pg_temp.fixture_id('org_a'), pg_temp.fixture_id('stylist_south'), pg_temp.fixture_id('branch_a1'), 1, '10:00', '19:00') $$,
  '23503', null, 'a shift needs the staff member assigned to the branch'
);
select pg_temp.act_as('owner_b');
select throws_ok(
  $$ insert into public.services (organization_id, category_id, name, duration_minutes, price)
     values (pg_temp.fixture_id('org_b'), pg_temp.fixture_id('category_a'), 'Stolen', 30, 100) $$,
  '23503', null, 'a service cannot use another organization''s category'
);

-- 10. Publishing status after an offering and a shift
select pg_temp.act_as('owner_a');
select results_eq(
  $$ select offered_service_count, bookable_staff_with_shift_count
     from public.branch_setup_status where branch_id = pg_temp.fixture_id('branch_a1') $$,
  $$ values (1::bigint, 1::bigint) $$,
  'the status counts the offering and the bookable staff member with a shift'
);
update public.staff set is_bookable = false where id = pg_temp.fixture_id('stylist_north');
select results_eq(
  $$ select bookable_staff_with_shift_count from public.branch_setup_status where branch_id = pg_temp.fixture_id('branch_a1') $$,
  $$ values (0::bigint) $$,
  'a staff member who is not bookable does not count'
);

-- 8. Invites linked to a staff profile
select throws_ok(
  $$ select * from public.create_invite(pg_temp.fixture_id('org_b'), 'staff', '{}', pg_temp.fixture_id('stylist_north')) $$,
  'GBA02', 'not_permitted', 'an invite cannot name another organization''s staff profile'
);
insert into invite_code (key, code)
select 'stylist', code from public.create_invite(
  pg_temp.fixture_id('org_a'), 'staff', array[pg_temp.fixture_id('branch_a1')], pg_temp.fixture_id('stylist_north')
);
select pg_temp.act_as('stylist_login');
select lives_ok($$ select public.accept_invite((select code from invite_code where key = 'stylist')) $$, 'the stylist accepts');
select is(
  (select m.user_id from public.staff s join public.organization_members m on m.id = s.member_id
   where s.id = pg_temp.fixture_id('stylist_north')),
  pg_temp.fixture_id('stylist_login'),
  'accepting links the staff profile to the new login'
);

-- 9. Storage paths
select pg_temp.act_as('manager_a');
select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('shop-media', '%s/branches/%s/front.jpg') $$,
    pg_temp.fixture_id('org_a'), pg_temp.fixture_id('branch_a1')
  ),
  'a manager uploads a photo of their branch'
);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('shop-media', '%s/branches/%s/front.jpg') $$,
    pg_temp.fixture_id('org_a'), pg_temp.fixture_id('branch_a2')
  ),
  '42501', null, 'a manager cannot upload photos of another branch'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('shop-media', '%s/logo/logo.png') $$, pg_temp.fixture_id('org_a')),
  '42501', null, 'a manager cannot replace the logo'
);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('payment-qr', '%s/%s/qr.png') $$,
    pg_temp.fixture_id('org_a'), pg_temp.fixture_id('branch_a1')
  ),
  '42501', null, 'a manager cannot upload a payment QR'
);
select pg_temp.act_as('owner_a');
select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('payment-qr', '%s/%s/qr.png') $$,
    pg_temp.fixture_id('org_a'), pg_temp.fixture_id('branch_a1')
  ),
  'the owner uploads the payment QR'
);

-- 11. save_staff_profile and set_branch_hours
reset role;
insert into public.staff_shifts (organization_id, staff_id, branch_id, day_of_week, starts_at, ends_at)
values (pg_temp.fixture_id('org_a'), pg_temp.fixture_id('stylist_south'), pg_temp.fixture_id('branch_a2'), 2, '14:00', '23:00');
set local role authenticated;
select pg_temp.act_as('manager_a');
select throws_ok(
  $$ select public.save_staff_profile(p_organization_id => pg_temp.fixture_id('org_a'), p_display_name => 'Sneaky',
       p_commission_percent => 50, p_is_bookable => true, p_is_active => true, p_branch_ids => '{}', p_services => '[]') $$,
  'GBA02', 'not_permitted', 'a manager cannot save staff profiles'
);
select lives_ok(
  $$ select public.set_branch_hours(pg_temp.fixture_id('branch_a1'),
       '[{"day_of_week": 1, "opens_at": "09:00", "closes_at": "21:00", "closes_next_day": false, "is_closed": false},
         {"day_of_week": 6, "opens_at": "12:00", "closes_at": "03:00", "closes_next_day": true, "is_closed": false}]') $$,
  'a manager sets the hours of their branch'
);
select throws_ok(
  $$ select public.set_branch_hours(pg_temp.fixture_id('branch_a2'), '[]') $$,
  'GBA02', 'not_permitted', 'a manager cannot set another branch''s hours'
);
select pg_temp.act_as('owner_a');
select results_eq(
  $$ select day_of_week, opens_at, closes_at, closes_next_day from public.branch_hours
     where branch_id = pg_temp.fixture_id('branch_a1') order by day_of_week $$,
  $$ values (1::smallint, '09:00'::time, '21:00'::time, false), (6::smallint, '12:00'::time, '03:00'::time, true) $$,
  'set_branch_hours updates existing days and adds new ones'
);
select lives_ok(
  format(
    $$ select public.save_staff_profile(p_organization_id => %L, p_staff_id => %L, p_display_name => 'Sol',
         p_title => 'Senior stylist', p_commission_percent => 45, p_is_bookable => true, p_is_active => true,
         p_branch_ids => array[%L]::uuid[], p_services => '[{"service_id": "%s", "commission_percent_override": 50}]') $$,
    pg_temp.fixture_id('org_a'), pg_temp.fixture_id('stylist_south'), pg_temp.fixture_id('branch_a1'), pg_temp.fixture_id('service_a')
  ),
  'the owner moves a staff member to another branch and sets a service commission'
);
select results_eq(
  $$ select (select count(*) from public.staff_shifts where staff_id = pg_temp.fixture_id('stylist_south')),
            (select commission_percent_override from public.staff_services where staff_id = pg_temp.fixture_id('stylist_south')) $$,
  $$ values (0::bigint, 50.00::numeric) $$,
  'leaving a branch removes the shifts there, and the service override is saved'
);
reset role;
create function pg_temp.fail_insert() returns trigger language plpgsql as $fail$
begin
  raise exception 'forced failure';
end;
$fail$;
create trigger forced_failure before insert on public.staff_services
  for each row execute function pg_temp.fail_insert();
set local role authenticated;
select pg_temp.act_as('owner_a');
select throws_ok(
  format(
    $$ select public.save_staff_profile(p_organization_id => %L, p_display_name => 'Half saved', p_commission_percent => 30,
         p_is_bookable => true, p_is_active => true, p_branch_ids => array[%L]::uuid[],
         p_services => '[{"service_id": "%s", "commission_percent_override": null}]') $$,
    pg_temp.fixture_id('org_a'), pg_temp.fixture_id('branch_a1'), pg_temp.fixture_id('service_a')
  ),
  'P0001', 'forced failure', 'save_staff_profile fails when a service assignment cannot be written'
);
reset role;
drop trigger forced_failure on public.staff_services;
select is(
  (select count(*) from public.staff where display_name = 'Half saved'),
  0::bigint,
  'the failed save leaves no staff profile or branch assignment'
);

select * from finish();
rollback;
