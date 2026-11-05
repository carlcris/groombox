-- Row-level rules for the phase 1 tables.
--
-- Ways these rules could fail, each covered below:
--  1. A member of one organization reads another's organizations, branches, hours, members.
--  2. Staff or managers read the full member list or invites, which are the owner's.
--  3. A manager edits hours of a branch they are not assigned to; staff edit hours at all.
--  4. A manager edits the organization; the owner edits a column outside the update grants.
--  5. Members of a restricted organization, the owner included, still read its rows.
--  6. A removed (inactive) member still reads the organization.
--  7. A guest session creates an organization; the anon role reads any table.
--  8. Colleague profiles leak across organizations.
--  9. my_memberships shows other users' rows, or hides a restricted organization from its member.
-- 10. Notifications are visible to, or editable beyond read_at by, anyone but the recipient.
-- 11. Activity logs are readable by non-owners; direct writes are not logged.
-- 12. Platform admins cannot read organizations; others can read platform settings.

begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

create temporary table fixture (key text primary key, id uuid not null);
grant select, insert on fixture to authenticated, anon;

create function pg_temp.fixture_id(p_key text) returns uuid language sql stable as $$
  select id from fixture where key = p_key;
$$;

create function pg_temp.act_as(p_key text, p_anonymous boolean default false) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', pg_temp.fixture_id(p_key), 'role', 'authenticated', 'is_anonymous', p_anonymous)::text,
    true
  );
$$;

insert into fixture (key, id)
select key, gen_random_uuid()
from unnest(array['owner_a', 'manager_a', 'staff_a', 'owner_b', 'outsider', 'admin', 'guest']) as key;

insert into auth.users (id, email, raw_user_meta_data)
select id, key || '@tenancy.test', jsonb_build_object('full_name', key)
from fixture;

insert into public.platform_admins (user_id) values (pg_temp.fixture_id('admin'));

-- Organizations are created through the function, as their owners.
set local role authenticated;
select pg_temp.act_as('owner_a');
insert into fixture (key, id)
select 'org_a', organization_id from public.create_organization(
  'Org A', 'salon', 'A One', 'Street 1', 'Makati', 'Poblacion',
  '[{"day_of_week": 1, "opens_at": "10:00", "closes_at": "20:00", "closes_next_day": false, "is_closed": false}]'
);
select pg_temp.act_as('owner_b');
insert into fixture (key, id)
select 'org_b', organization_id from public.create_organization(
  'Org B', 'barbershop', 'B One', 'Street 2', 'Quezon City', 'Cubao',
  '[{"day_of_week": 1, "opens_at": "09:00", "closes_at": "18:00", "closes_next_day": false, "is_closed": false}]'
);
reset role;

insert into fixture (key, id)
select 'branch_a1', id from public.branches where organization_id = pg_temp.fixture_id('org_a');
insert into fixture (key, id) values ('branch_a2', gen_random_uuid());
insert into public.branches (id, organization_id, name, slug)
values (pg_temp.fixture_id('branch_a2'), pg_temp.fixture_id('org_a'), 'A Two', 'org-a-a-two-test');
insert into public.branch_hours (branch_id, organization_id, day_of_week, opens_at, closes_at)
values (pg_temp.fixture_id('branch_a2'), pg_temp.fixture_id('org_a'), 1, '10:00', '20:00');

insert into fixture (key, id) values ('member_manager_a', gen_random_uuid()), ('member_staff_a', gen_random_uuid());
insert into public.organization_members (id, organization_id, user_id, role)
values
  (pg_temp.fixture_id('member_manager_a'), pg_temp.fixture_id('org_a'), pg_temp.fixture_id('manager_a'), 'manager'),
  (pg_temp.fixture_id('member_staff_a'), pg_temp.fixture_id('org_a'), pg_temp.fixture_id('staff_a'), 'staff');
insert into public.member_branches (member_id, branch_id, organization_id)
values
  (pg_temp.fixture_id('member_manager_a'), pg_temp.fixture_id('branch_a1'), pg_temp.fixture_id('org_a')),
  (pg_temp.fixture_id('member_staff_a'), pg_temp.fixture_id('branch_a1'), pg_temp.fixture_id('org_a'));

insert into public.organization_invites (organization_id, role, branch_ids, expires_at, created_by)
values (pg_temp.fixture_id('org_a'), 'staff', array[pg_temp.fixture_id('branch_a1')], now() + interval '1 day', pg_temp.fixture_id('owner_a'));

insert into public.notifications (recipient_user_id, organization_id, type, title)
values (pg_temp.fixture_id('staff_a'), pg_temp.fixture_id('org_a'), 'test', 'Hello');

set local role authenticated;

-- 1. Tenant isolation
select pg_temp.act_as('owner_a');
select results_eq(
  'select id from public.organizations',
  $$ select pg_temp.fixture_id('org_a') $$,
  'owner sees only their organization'
);
select results_eq(
  'select id from public.branches order by name',
  $$ values (pg_temp.fixture_id('branch_a1')), (pg_temp.fixture_id('branch_a2')) $$,
  'owner sees only their branches'
);
select is(
  (select count(*) from public.branch_hours where organization_id = pg_temp.fixture_id('org_b')),
  0::bigint,
  'owner sees no hours of another organization'
);
select is(
  (select count(*) from public.organization_members),
  3::bigint,
  'owner sees their three members and no others'
);
select is((select count(*) from public.organization_invites), 1::bigint, 'owner sees their invite');

-- 2. Staff and manager reads
select pg_temp.act_as('staff_a');
select results_eq('select id from public.organizations', $$ select pg_temp.fixture_id('org_a') $$, 'staff reads their organization');
select is((select count(*) from public.organization_members), 1::bigint, 'staff sees only their own membership');
select is((select count(*) from public.organization_invites), 0::bigint, 'staff sees no invites');
select is((select count(*) from public.member_branches), 1::bigint, 'staff sees only their own branch assignment');
select results_eq(
  'select id from public.my_branches',
  $$ select pg_temp.fixture_id('branch_a1') $$,
  'staff work in their assigned branch only'
);

-- 8. Colleague profiles
select ok(
  exists (select 1 from public.profiles where id = pg_temp.fixture_id('owner_a')),
  'staff see their colleague''s profile'
);
select ok(
  not exists (select 1 from public.profiles where id = pg_temp.fixture_id('owner_b')),
  'staff do not see another organization''s profiles'
);

-- 3. Branch hours writes
select pg_temp.act_as('manager_a');
with changed as (update public.branch_hours set closes_at = '21:00'
    where branch_id = pg_temp.fixture_id('branch_a1') returning 1)
select is(count(*), 1::bigint, 'manager edits hours of their branch') from changed;
with changed as (update public.branch_hours set closes_at = '21:00'
    where branch_id = pg_temp.fixture_id('branch_a2') returning 1)
select is(count(*), 0::bigint, 'manager cannot edit hours of an unassigned branch') from changed;
select throws_ok(
  $$ insert into public.branch_hours (branch_id, organization_id, day_of_week, opens_at, closes_at)
     values (pg_temp.fixture_id('branch_a2'), pg_temp.fixture_id('org_a'), 2, '10:00', '20:00') $$,
  '42501',
  null,
  'manager cannot add hours to an unassigned branch'
);
select pg_temp.act_as('staff_a');
with changed as (update public.branch_hours set closes_at = '22:00'
    where branch_id = pg_temp.fixture_id('branch_a1') returning 1)
select is(count(*), 0::bigint, 'staff cannot edit hours') from changed;

-- 4. Organization writes
select pg_temp.act_as('manager_a');
with changed as (update public.organizations set name = 'Renamed' returning 1)
select is(count(*), 0::bigint, 'manager cannot edit the organization') from changed;
select pg_temp.act_as('owner_a');
with changed as (update public.organizations set name = 'Org A Renamed' returning 1)
select is(count(*), 1::bigint, 'owner edits the organization') from changed;
select throws_ok(
  'update public.organizations set slug = ''taken-over''',
  '42501',
  null,
  'owner cannot change the slug'
);
select throws_ok(
  'update public.organizations set access_status = ''active''',
  '42501',
  null,
  'owner cannot change access status'
);
select throws_ok(
  'update public.branches set slug = ''taken-over''',
  '42501',
  null,
  'owner cannot change a branch slug'
);

-- 11. Activity logs
select ok(
  exists (
    select 1 from public.activity_logs
    where action = 'organizations.update'
      and entity_id = pg_temp.fixture_id('org_a')
      and metadata = '{"columns": ["name"]}'::jsonb
  ),
  'a direct organization update is logged with the changed column'
);
select pg_temp.act_as('staff_a');
select is((select count(*) from public.activity_logs), 0::bigint, 'staff cannot read activity logs');

-- 10. Notifications
select is((select count(*) from public.notifications), 1::bigint, 'recipient sees their notification');
with changed as (update public.notifications set read_at = now() returning 1)
select is(count(*), 1::bigint, 'recipient marks their notification read') from changed;
select throws_ok(
  'update public.notifications set title = ''Changed''',
  '42501',
  null,
  'recipient cannot change anything but read_at'
);
select pg_temp.act_as('owner_a');
select is((select count(*) from public.notifications), 0::bigint, 'others cannot see the notification');

-- 7. Outsiders, guests, anon
select pg_temp.act_as('outsider');
select is((select count(*) from public.organizations), 0::bigint, 'an outsider sees no organizations');
select is((select count(*) from public.branches), 0::bigint, 'an outsider sees no branches');
select pg_temp.act_as('guest', true);
select throws_ok(
  $$ select * from public.create_organization('Guest Org', 'spa', 'G', 'x', 'x', 'x', '[]') $$,
  'GBA01',
  'sign_in_required',
  'a guest session cannot create an organization'
);
reset role;
set local role anon;
select throws_ok('select id from public.organizations', '42501', null, 'the anon role cannot read organizations');
reset role;

-- 12. Platform admin
set local role authenticated;
select pg_temp.act_as('admin');
select is(
  (select count(*) from public.organizations where id in (pg_temp.fixture_id('org_a'), pg_temp.fixture_id('org_b'))),
  2::bigint,
  'a platform admin reads every organization'
);
select is((select count(*) from public.platform_settings), 1::bigint, 'a platform admin reads platform settings');
select pg_temp.act_as('owner_a');
select is((select count(*) from public.platform_settings), 0::bigint, 'an owner cannot read platform settings');

-- 5. Restricted organization
reset role;
update public.organizations
set access_status = 'restricted', restricted_at = now(), restriction_reason = 'manual'
where id = pg_temp.fixture_id('org_a');
set local role authenticated;
select pg_temp.act_as('owner_a');
select is(
  (select count(*) from public.organizations) + (select count(*) from public.branches),
  0::bigint,
  'the owner of a restricted organization reads none of its rows'
);
select pg_temp.act_as('staff_a');
select results_eq(
  'select organization_id, access_status from public.my_memberships',
  $$ values (pg_temp.fixture_id('org_a'), 'restricted'::public.org_access_status) $$,
  'a member still learns their organization is restricted'
);

-- 6. Inactive member
reset role;
update public.organizations
set access_status = 'active', restricted_at = null, restriction_reason = null
where id = pg_temp.fixture_id('org_a');
update public.organization_members set is_active = false where id = pg_temp.fixture_id('member_staff_a');
set local role authenticated;
select pg_temp.act_as('staff_a');
select is(
  (select count(*) from public.organizations) + (select count(*) from public.my_memberships),
  0::bigint,
  'a removed member reads nothing of the organization'
);

select * from finish();
rollback;
