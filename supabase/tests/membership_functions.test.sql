-- create_organization, invites, and member changes: access checks, state guards, activity rows,
-- and rollback.
--
-- Ways these functions could fail, each covered below:
--  1. Someone other than the owner creates an invite, or the invite names another org's branch.
--  2. The invite preview is not readable before sign-in, or still shows a used invite.
--  3. accepting does not create the membership and branch assignments, or a code works twice,
--     after expiry, or for someone already a member.
--  4. update_member and remove_member reach the owner membership, or run for a non-owner.
--  5. A failure part-way through leaves a membership, an accepted invite, or a half-created
--     organization behind.
--  6. A function writes no activity row, or its inserts are logged again by the row triggers.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create temporary table fixture (key text primary key, id uuid not null);
grant select, insert on fixture to authenticated, anon;

create temporary table invite_code (key text primary key, code text not null);
grant select, insert on invite_code to authenticated, anon;

create function pg_temp.fixture_id(p_key text) returns uuid language sql stable as $$
  select id from fixture where key = p_key;
$$;

create function pg_temp.code(p_key text) returns text language sql stable as $$
  select code from invite_code where key = p_key;
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
from unnest(array['owner_a', 'owner_b', 'joiner', 'second_joiner', 'late_joiner']) as key;

insert into auth.users (id, email, raw_user_meta_data)
select id, key || '@membership.test', jsonb_build_object('full_name', key)
from fixture;

set local role authenticated;
select pg_temp.act_as('owner_a');
insert into fixture (key, id)
select 'org_a', organization_id from public.create_organization(
  'Membership Org', 'spa', 'Main', 'Street 1', 'Makati', 'Legaspi',
  '[{"day_of_week": 6, "opens_at": "14:00", "closes_at": "02:00", "closes_next_day": true, "is_closed": false}]'
);
select pg_temp.act_as('owner_b');
insert into fixture (key, id)
select 'org_b', organization_id from public.create_organization(
  'Other Org', 'salon', 'Other', 'Street 2', 'Pasig', 'Kapitolyo', '[]'
);
reset role;

insert into fixture (key, id)
select 'branch_a1', id from public.branches where organization_id = pg_temp.fixture_id('org_a');
insert into fixture (key, id)
select 'branch_b1', id from public.branches where organization_id = pg_temp.fixture_id('org_b');
insert into fixture (key, id)
select 'owner_member_a', id from public.organization_members where organization_id = pg_temp.fixture_id('org_a');

-- create_organization
select is(
  (select count(*) from public.activity_logs where organization_id = pg_temp.fixture_id('org_a')),
  1::bigint,
  'create_organization writes one activity row and no row-trigger duplicates'
);
select results_eq(
  $$ select closes_at, closes_next_day from public.branch_hours where branch_id = pg_temp.fixture_id('branch_a1') $$,
  $$ values ('02:00'::time, true) $$,
  'create_organization saves hours that close the next day'
);

set local role authenticated;

-- 1. create_invite
select pg_temp.act_as('owner_a');
insert into invite_code (key, code)
select 'manager', code from public.create_invite(pg_temp.fixture_id('org_a'), 'manager', array[pg_temp.fixture_id('branch_a1')]);
select matches(pg_temp.code('manager'), '^[0-9A-HJKMNP-TV-Z]{16}$', 'the invite code is 16 Crockford base32 characters');
select throws_ok(
  $$ select * from public.create_invite(pg_temp.fixture_id('org_a'), 'staff', array[pg_temp.fixture_id('branch_b1')]) $$,
  'GBA02',
  'not_permitted',
  'an invite cannot name another organization''s branch'
);
select pg_temp.act_as('owner_b');
select throws_ok(
  $$ select * from public.create_invite(pg_temp.fixture_id('org_a'), 'staff', array[pg_temp.fixture_id('branch_a1')]) $$,
  'GBA02',
  'not_permitted',
  'only the organization''s owner creates invites'
);

-- 2. Preview before sign-in
reset role;
set local role anon;
select results_eq(
  $$ select organization_name, role, branch_names from public.get_invite_preview(pg_temp.code('manager')) $$,
  $$ values ('Membership Org'::text, 'manager'::public.member_role, array['Main']::text[]) $$,
  'anyone holding the code sees the invite before signing in'
);
reset role;
set local role authenticated;

-- 3. accept_invite
select pg_temp.act_as('joiner');
select is(public.accept_invite(pg_temp.code('manager')), pg_temp.fixture_id('org_a'), 'accepting returns the organization');
select results_eq(
  'select organization_id, role from public.my_memberships',
  $$ values (pg_temp.fixture_id('org_a'), 'manager'::public.member_role) $$,
  'the invitee is now a manager'
);
select results_eq(
  'select id from public.my_branches',
  $$ select pg_temp.fixture_id('branch_a1') $$,
  'the invitee is assigned the invite''s branch'
);
insert into fixture (key, id) select 'joiner_member', member_id from public.my_memberships;

select pg_temp.act_as('second_joiner');
select throws_ok(
  $$ select public.accept_invite(pg_temp.code('manager')) $$,
  'GBI01',
  'invite_unavailable',
  'an invite works once'
);
select is(
  (select count(*) from public.get_invite_preview(pg_temp.code('manager'))),
  0::bigint,
  'a used invite has no preview'
);

select pg_temp.act_as('owner_a');
insert into invite_code (key, code)
select 'second', code from public.create_invite(pg_temp.fixture_id('org_a'), 'staff', array[pg_temp.fixture_id('branch_a1')]);
insert into invite_code (key, code)
select 'expired', code from public.create_invite(pg_temp.fixture_id('org_a'), 'staff', array[pg_temp.fixture_id('branch_a1')]);
reset role;
update public.organization_invites set expires_at = now() - interval '1 minute' where code = pg_temp.code('expired');
set local role authenticated;

select pg_temp.act_as('late_joiner');
select throws_ok(
  $$ select public.accept_invite(pg_temp.code('expired')) $$,
  'GBI01',
  'invite_unavailable',
  'an expired invite cannot be accepted'
);
select pg_temp.act_as('joiner');
select throws_ok(
  $$ select public.accept_invite(pg_temp.code('second')) $$,
  'GBI02',
  'already_member',
  'an active member cannot accept another invite to the same organization'
);

-- 4. update_member and remove_member
select pg_temp.act_as('owner_a');
reset role;
insert into fixture (key, id) values ('branch_a2', gen_random_uuid());
insert into public.branches (id, organization_id, name, slug)
values (pg_temp.fixture_id('branch_a2'), pg_temp.fixture_id('org_a'), 'Second', 'membership-org-second-test');
set local role authenticated;

select lives_ok(
  $$ select public.update_member(
       pg_temp.fixture_id('joiner_member'), 'staff',
       array[pg_temp.fixture_id('branch_a1'), pg_temp.fixture_id('branch_a2')], true) $$,
  'the owner changes a member''s role, branches, and deposit permission'
);
select results_eq(
  $$ select role, can_review_deposits, (select count(*) from public.member_branches mb where mb.member_id = m.id)
     from public.organization_members m where m.id = pg_temp.fixture_id('joiner_member') $$,
  $$ values ('staff'::public.member_role, true, 2::bigint) $$,
  'the member now has the new role, permission, and both branches'
);
select throws_ok(
  $$ select public.update_member(pg_temp.fixture_id('owner_member_a'), 'manager', '{}', false) $$,
  'GBM01',
  'owner_membership_locked',
  'the owner membership cannot be changed'
);
select throws_ok(
  $$ select public.remove_member(pg_temp.fixture_id('owner_member_a')) $$,
  'GBM01',
  'owner_membership_locked',
  'the owner membership cannot be removed'
);
select pg_temp.act_as('joiner');
select throws_ok(
  $$ select public.remove_member(pg_temp.fixture_id('joiner_member')) $$,
  'GBA02',
  'not_permitted',
  'only the owner removes members'
);
select pg_temp.act_as('owner_a');
select lives_ok($$ select public.remove_member(pg_temp.fixture_id('joiner_member')) $$, 'the owner removes a member');
select results_eq(
  $$ select is_active, (select count(*) from public.member_branches mb where mb.member_id = m.id)
     from public.organization_members m where m.id = pg_temp.fixture_id('joiner_member') $$,
  $$ values (false, 0::bigint) $$,
  'the removed member is inactive with no branch assignments'
);

-- 6. Activity rows
select results_eq(
  $$ select action from public.activity_logs
     where organization_id = pg_temp.fixture_id('org_a')
     order by action $$,
  $$ values ('invite.accepted'), ('invite.created'), ('invite.created'), ('invite.created'), ('member.removed'),
            ('member.updated'), ('organization.created') $$,
  'each function writes its activity row'
);

-- 5. Rollback after an earlier write
reset role;
create function pg_temp.fail_insert() returns trigger language plpgsql as $$
begin
  raise exception 'forced failure';
end;
$$;
create trigger forced_failure before insert on public.member_branches
  for each row execute function pg_temp.fail_insert();
set local role authenticated;
select pg_temp.act_as('late_joiner');
select throws_ok(
  $$ select public.accept_invite(pg_temp.code('second')) $$,
  'P0001',
  'forced failure',
  'accept_invite fails when the branch assignment cannot be written'
);
reset role;
select is(
  (select count(*) from public.organization_members where user_id = pg_temp.fixture_id('late_joiner'))
    + (select count(*) from public.organization_invites where code = pg_temp.code('second') and accepted_at is not null),
  0::bigint,
  'the failed accept leaves no membership and the invite unused'
);
drop trigger forced_failure on public.member_branches;

create trigger forced_failure before insert on public.branch_hours
  for each row execute function pg_temp.fail_insert();
set local role authenticated;
select pg_temp.act_as('late_joiner');
select throws_ok(
  $$ select * from public.create_organization('Half Made', 'spa', 'H', 'x', 'x', 'x',
       '[{"day_of_week": 1, "opens_at": "10:00", "closes_at": "20:00", "closes_next_day": false, "is_closed": false}]') $$,
  'P0001',
  'forced failure',
  'create_organization fails when the hours cannot be written'
);
reset role;
select is(
  (select count(*) from public.organizations where name = 'Half Made')
    + (select count(*) from public.organization_members where user_id = pg_temp.fixture_id('late_joiner')),
  0::bigint,
  'the failed create leaves no organization, branch, or membership'
);
drop trigger forced_failure on public.branch_hours;

select * from finish();
rollback;
