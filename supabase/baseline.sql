-- GroomBox baseline: the complete current application database for a fresh Supabase installation.
-- Maintained by hand alongside supabase/migrations (see AGENTS.md, Supabase Migrations): edit each
-- object in place, never append ALTER sequences, never regenerate from a dump.
-- `npm run db:baseline:check` proves it matches the migration chain.

create extension if not exists pgcrypto with schema extensions;

-- Internal helpers live in `private`, which PostgREST does not expose.
create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'manager', 'staff');
create type public.org_access_status as enum ('active', 'restricted');
create type public.org_restriction_reason as enum ('overdue_statement', 'manual');
create type public.org_category as enum ('salon', 'barbershop', 'spa', 'nails', 'lashes_brows', 'other');
create type public.deposit_type as enum ('fixed', 'percent');
create type public.cutoff_schedule as enum ('weekly', 'semi_monthly', 'monthly');

-- ---------------------------------------------------------------------------
-- Shared functions
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Random characters from Crockford's base32 alphabet (no I, L, O, or U). 256 is a multiple of 32,
-- so each character is uniform.
create function private.random_code(p_length integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(p_length);
  v_code text := '';
begin
  for v_index in 0 .. p_length - 1 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_index) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

create function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g')), ''),
    'shop'
  );
$$;

-- A slug not yet used in `p_table` (organizations or branches): the plain slug, else the slug
-- with a short random suffix.
create function private.available_slug(p_table text, p_name text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_base text := left(private.slugify(p_name), 60);
  v_candidate text := v_base;
  v_taken boolean;
begin
  loop
    execute format('select exists (select 1 from public.%I where slug = $1)', p_table)
      into v_taken
      using v_candidate;
    exit when not v_taken;
    v_candidate := v_base || '-' || lower(private.random_code(4));
  end loop;
  return v_candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform tables
-- ---------------------------------------------------------------------------

create table public.platform_settings (
  id boolean primary key default true check (id),
  fee_percent numeric(5,2) not null default 3.00,
  fee_minimum numeric(20,2) not null default 10.00,
  fee_maximum numeric(20,2) not null default 50.00,
  cutoff_schedule public.cutoff_schedule not null default 'semi_monthly',
  cutoff_weekday smallint check (cutoff_weekday between 0 and 6),
  grace_period_days smallint not null default 7,
  statement_minimum numeric(20,2) not null default 100.00,
  payment_instructions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  constraint platform_settings_weekly_cutoff_check
    check (cutoff_schedule <> 'weekly' or cutoff_weekday is not null)
);

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  mobile_number text,
  avatar_path text,
  is_guest boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Organization tables
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category public.org_category not null,
  logo_path text,
  is_listed boolean not null default true,
  access_status public.org_access_status not null default 'active',
  restricted_at timestamptz,
  restriction_reason public.org_restriction_reason,
  deposit_type public.deposit_type not null default 'fixed',
  deposit_fixed_amount numeric(20,2) default 100.00 check (deposit_fixed_amount > 0),
  deposit_percent numeric(5,2) check (deposit_percent > 0 and deposit_percent <= 100),
  hold_minutes smallint not null default 15,
  review_hours smallint not null default 12,
  slot_interval_minutes smallint not null default 15,
  min_notice_minutes smallint not null default 60,
  booking_horizon_days smallint not null default 30,
  cancellation_policy text,
  terms_accepted_at timestamptz,
  terms_accepted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_deposit_rule_check check (
    (deposit_type = 'fixed' and deposit_fixed_amount is not null and deposit_percent is null)
    or (deposit_type = 'percent' and deposit_percent is not null and deposit_fixed_amount is null)
  ),
  constraint organizations_restriction_check check (
    (access_status = 'active' and restricted_at is null and restriction_reason is null)
    or (access_status = 'restricted' and restricted_at is not null and restriction_reason is not null)
  )
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  slug text not null unique,
  address text,
  city text,
  area text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  timezone text not null default 'Asia/Manila',
  business_day_start time not null default '05:00',
  contact_number text,
  payment_instructions jsonb,
  is_published boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create index branches_organization_id_idx on public.branches (organization_id);
create index branches_city_area_idx on public.branches (city, area);

-- Hours that close after midnight belong to the day they open and close by business_day_start;
-- the setup screen checks that.
create table public.branch_hours (
  branch_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  closes_next_day boolean not null default false,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, day_of_week),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id),
  constraint branch_hours_open_times_check
    check (is_closed or (opens_at is not null and closes_at is not null))
);

create index branch_hours_organization_id_idx on public.branch_hours (organization_id);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null references public.profiles (id),
  role public.member_role not null,
  can_review_deposits boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id)
);

create unique index organization_members_one_owner_idx
  on public.organization_members (organization_id)
  where role = 'owner';
create index organization_members_active_user_idx
  on public.organization_members (user_id, organization_id)
  where is_active;

create table public.member_branches (
  member_id uuid not null,
  branch_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  created_at timestamptz not null default now(),
  primary key (member_id, branch_id),
  foreign key (member_id, organization_id)
    references public.organization_members (id, organization_id) on delete cascade,
  foreign key (branch_id, organization_id) references public.branches (id, organization_id)
);

create index member_branches_branch_id_idx on public.member_branches (branch_id);
create index member_branches_organization_id_idx on public.member_branches (organization_id);

-- ---------------------------------------------------------------------------
-- Branch closures and photos
-- ---------------------------------------------------------------------------

create table public.branch_closures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  branch_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id),
  constraint branch_closures_range_check check (ends_at > starts_at)
);

create index branch_closures_branch_starts_idx on public.branch_closures (branch_id, starts_at);
create index branch_closures_organization_id_idx on public.branch_closures (organization_id);

create table public.branch_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  branch_id uuid not null,
  storage_path text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id)
);

create index branch_media_branch_sort_idx on public.branch_media (branch_id, sort_order);
create index branch_media_organization_id_idx on public.branch_media (organization_id);

-- ---------------------------------------------------------------------------
-- Service catalogue and branch offerings
-- ---------------------------------------------------------------------------

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create index service_categories_organization_sort_idx on public.service_categories (organization_id, sort_order);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  category_id uuid not null,
  name text not null,
  description text,
  duration_minutes smallint not null check (duration_minutes > 0),
  buffer_minutes smallint not null default 0 check (buffer_minutes >= 0),
  price numeric(20,2) not null check (price >= 0),
  price_is_starting boolean not null default false,
  deposit_type public.deposit_type,
  deposit_fixed_amount numeric(20,2),
  deposit_percent numeric(5,2),
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (category_id, organization_id) references public.service_categories (id, organization_id),
  constraint services_deposit_override_check check (
    (deposit_type is null and deposit_fixed_amount is null and deposit_percent is null)
    or (deposit_type = 'fixed' and deposit_fixed_amount > 0 and deposit_percent is null)
    or (deposit_type = 'percent' and deposit_percent > 0 and deposit_percent <= 100 and deposit_fixed_amount is null)
  )
);

create index services_organization_sort_idx on public.services (organization_id, sort_order);
create index services_category_id_idx on public.services (category_id);

create table public.branch_services (
  branch_id uuid not null,
  service_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  price_override numeric(20,2) check (price_override >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, service_id),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id),
  foreign key (service_id, organization_id) references public.services (id, organization_id)
);

create index branch_services_service_id_idx on public.branch_services (service_id);
create index branch_services_organization_id_idx on public.branch_services (organization_id);

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

-- A bookable staff profile. member_id is the only link to a login.
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  member_id uuid unique,
  display_name text not null,
  title text,
  photo_path text,
  commission_percent numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  is_bookable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (member_id, organization_id) references public.organization_members (id, organization_id)
);

create index staff_organization_id_idx on public.staff (organization_id);

-- Where a staff profile takes bookings. Separate from member_branches, where a login works.
create table public.staff_branches (
  staff_id uuid not null,
  branch_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  created_at timestamptz not null default now(),
  primary key (staff_id, branch_id),
  foreign key (staff_id, organization_id) references public.staff (id, organization_id),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id)
);

create index staff_branches_branch_id_idx on public.staff_branches (branch_id);
create index staff_branches_organization_id_idx on public.staff_branches (organization_id);

create table public.staff_services (
  staff_id uuid not null,
  service_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  commission_percent_override numeric(5,2) check (commission_percent_override between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (staff_id, service_id),
  foreign key (staff_id, organization_id) references public.staff (id, organization_id),
  foreign key (service_id, organization_id) references public.services (id, organization_id)
);

create index staff_services_service_id_idx on public.staff_services (service_id);
create index staff_services_organization_id_idx on public.staff_services (organization_id);

-- A weekly shift at a branch the staff member is assigned to; removing the assignment removes its
-- shifts. Shifts past midnight belong to the day they start (see branch_hours).
create table public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  staff_id uuid not null,
  branch_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  ends_next_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (staff_id, organization_id) references public.staff (id, organization_id),
  foreign key (staff_id, branch_id) references public.staff_branches (staff_id, branch_id) on delete cascade
);

create index staff_shifts_branch_day_idx on public.staff_shifts (branch_id, day_of_week);
create index staff_shifts_staff_id_idx on public.staff_shifts (staff_id);
create index staff_shifts_organization_id_idx on public.staff_shifts (organization_id);

create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  staff_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (staff_id, organization_id) references public.staff (id, organization_id),
  constraint staff_time_off_range_check check (ends_at > starts_at)
);

create index staff_time_off_staff_starts_idx on public.staff_time_off (staff_id, starts_at);
create index staff_time_off_organization_id_idx on public.staff_time_off (organization_id);

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  code text not null unique default private.random_code(16),
  role public.member_role not null check (role in ('manager', 'staff')),
  branch_ids uuid[] not null,
  staff_id uuid,
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (staff_id, organization_id) references public.staff (id, organization_id)
);

create index organization_invites_organization_created_idx
  on public.organization_invites (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications and audit
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id),
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc);
create index notifications_organization_id_idx on public.notifications (organization_id);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id),
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_logs_metadata_size_check check (octet_length(metadata::text) <= 2048)
);

create index activity_logs_organization_created_idx
  on public.activity_logs (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Activity logging
-- ---------------------------------------------------------------------------

-- Written by state-changing functions, and by the row trigger below for direct writes.
create function private.log_activity(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_organization_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
$$;

-- AFTER trigger for tables that take direct single-row writes under row-level security.
-- Arguments: the entity id column ('' for none), the organization id column ('' for none), then
-- the allow-listed column names whose changes are recorded.
-- It runs with the caller's rights and logs only writes made directly by an app role. Database
-- functions run as SECURITY DEFINER and write their own activity row, so their writes are skipped.
create function private.log_row_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_entity_column text := tg_argv[0];
  v_organization_column text := tg_argv[1];
  v_allowed_columns text[] := tg_argv[2:tg_nargs - 1];
  v_changed_columns text[];
begin
  if current_user not in ('authenticated', 'anon') then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(changed.key order by changed.key), '{}')
      into v_changed_columns
      from jsonb_each(to_jsonb(new)) as changed
      where changed.key = any (v_allowed_columns)
        and changed.value is distinct from to_jsonb(old) -> changed.key;

    if cardinality(v_changed_columns) = 0 then
      return null;
    end if;
  end if;

  perform private.log_activity(
    case when v_organization_column = '' then null else (v_row ->> v_organization_column)::uuid end,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    case when v_entity_column = '' then null else (v_row ->> v_entity_column)::uuid end,
    case when tg_op = 'UPDATE' then jsonb_build_object('columns', to_jsonb(v_changed_columns)) else '{}'::jsonb end
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, is_guest)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), ''),
    coalesce(new.is_anonymous, false)
  );
  return new;
end;
$$;

create trigger create_profile_after_insert
  after insert on auth.users
  for each row execute function private.create_profile_for_new_user();

create function private.stamp_platform_settings_editor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger set_updated_at before update on public.platform_settings
  for each row execute function private.set_updated_at();
create trigger stamp_editor before update on public.platform_settings
  for each row execute function private.stamp_platform_settings_editor();
create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.branches
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.branch_hours
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.organization_members
  for each row execute function private.set_updated_at();

create trigger log_row_change after insert or update or delete on public.platform_settings
  for each row execute function private.log_row_change(
    '', '', 'fee_percent', 'fee_minimum', 'fee_maximum', 'cutoff_schedule', 'cutoff_weekday',
    'grace_period_days', 'statement_minimum', 'payment_instructions'
  );
create trigger log_row_change after insert or update or delete on public.profiles
  for each row execute function private.log_row_change(
    'id', '', 'full_name', 'mobile_number', 'avatar_path', 'is_guest'
  );
create trigger log_row_change after insert or update or delete on public.organizations
  for each row execute function private.log_row_change(
    'id', 'id', 'name', 'logo_path', 'category', 'is_listed', 'deposit_type', 'deposit_fixed_amount',
    'deposit_percent', 'hold_minutes', 'review_hours', 'slot_interval_minutes', 'min_notice_minutes',
    'booking_horizon_days', 'cancellation_policy'
  );
create trigger log_row_change after insert or update or delete on public.branches
  for each row execute function private.log_row_change(
    'id', 'organization_id', 'name', 'address', 'city', 'area', 'latitude', 'longitude', 'timezone',
    'business_day_start', 'contact_number', 'payment_instructions', 'is_published', 'is_active'
  );
create trigger log_row_change after insert or update or delete on public.branch_hours
  for each row execute function private.log_row_change(
    'branch_id', 'organization_id', 'opens_at', 'closes_at', 'closes_next_day', 'is_closed'
  );

-- ---------------------------------------------------------------------------
-- Access helpers used by policies
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because the membership tables' own policies use them: a direct subquery on
-- organization_members inside its own policy, or inside the organizations policy, recurses.
-- Each takes no row-varying argument and is used as `column in (select private.helper())`, so it
-- runs once per statement.

create function private.accessible_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and o.access_status = 'active';
$$;

create function private.owned_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and m.role = 'owner'
    and o.access_status = 'active';
$$;

-- Branches of accessible organizations where the caller holds one of `p_roles`: every branch for
-- an owner, the assigned branches for a manager or staff member.
create function private.branch_ids_with_role(p_roles public.member_role[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
  from public.branches b
  join public.organization_members m on m.organization_id = b.organization_id
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and m.role = 'owner'
    and 'owner' = any (p_roles)
    and o.access_status = 'active'
  union all
  select mb.branch_id
  from public.member_branches mb
  join public.organization_members m on m.id = mb.member_id
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and m.role <> 'owner'
    and m.role = any (p_roles)
    and o.access_status = 'active';
$$;

create function private.colleague_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
  from public.organization_members m
  where m.is_active
    and m.organization_id in (select private.accessible_organization_ids());
$$;

create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.platform_settings enable row level security;
alter table public.platform_admins enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.branch_hours enable row level security;
alter table public.organization_members enable row level security;
alter table public.member_branches enable row level security;
alter table public.organization_invites enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

create policy platform_settings_select on public.platform_settings
  for select to authenticated
  using ((select private.is_platform_admin()));
create policy platform_settings_update on public.platform_settings
  for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy platform_admins_select_own on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or id in (select private.colleague_user_ids()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy organizations_select on public.organizations
  for select to authenticated
  using (id in (select private.accessible_organization_ids()) or (select private.is_platform_admin()));
create policy organizations_update_owner on public.organizations
  for update to authenticated
  using (id in (select private.owned_organization_ids()))
  with check (id in (select private.owned_organization_ids()));

create policy branches_select on public.branches
  for select to authenticated
  using (
    organization_id in (select private.accessible_organization_ids())
    or (select private.is_platform_admin())
  );
create policy branches_update_owner on public.branches
  for update to authenticated
  using (organization_id in (select private.owned_organization_ids()))
  with check (organization_id in (select private.owned_organization_ids()));

create policy branch_hours_select on public.branch_hours
  for select to authenticated
  using (organization_id in (select private.accessible_organization_ids()));
create policy branch_hours_insert on public.branch_hours
  for insert to authenticated
  with check (branch_id in (select private.branch_ids_with_role('{owner,manager}')));
create policy branch_hours_update on public.branch_hours
  for update to authenticated
  using (branch_id in (select private.branch_ids_with_role('{owner,manager}')))
  with check (branch_id in (select private.branch_ids_with_role('{owner,manager}')));
create policy branch_hours_delete on public.branch_hours
  for delete to authenticated
  using (branch_id in (select private.branch_ids_with_role('{owner,manager}')));

create policy organization_members_select on public.organization_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or organization_id in (select private.owned_organization_ids())
  );

create policy member_branches_select on public.member_branches
  for select to authenticated
  using (
    member_id in (select m.id from public.organization_members m where m.user_id = (select auth.uid()))
    or organization_id in (select private.owned_organization_ids())
  );

create policy organization_invites_select_owner on public.organization_invites
  for select to authenticated
  using (organization_id in (select private.owned_organization_ids()));

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

create policy activity_logs_select on public.activity_logs
  for select to authenticated
  using (
    organization_id in (select private.owned_organization_ids())
    or (select private.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- Shop setup triggers
-- ---------------------------------------------------------------------------

create trigger set_updated_at before update on public.branch_closures
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.service_categories
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.services
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.branch_services
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.staff
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.staff_services
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.staff_shifts
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.staff_time_off
  for each row execute function private.set_updated_at();

create trigger log_row_change after insert or update or delete on public.branch_closures
  for each row execute function private.log_row_change('id', 'organization_id', 'starts_at', 'ends_at', 'reason');
create trigger log_row_change after insert or update or delete on public.branch_media
  for each row execute function private.log_row_change('id', 'organization_id', 'storage_path', 'sort_order');
create trigger log_row_change after insert or update or delete on public.service_categories
  for each row execute function private.log_row_change('id', 'organization_id', 'name', 'sort_order');
create trigger log_row_change after insert or update or delete on public.services
  for each row execute function private.log_row_change(
    'id', 'organization_id', 'category_id', 'name', 'description', 'duration_minutes', 'buffer_minutes', 'price',
    'price_is_starting', 'deposit_type', 'deposit_fixed_amount', 'deposit_percent', 'is_active', 'sort_order'
  );
create trigger log_row_change after insert or update or delete on public.branch_services
  for each row execute function private.log_row_change('service_id', 'organization_id', 'price_override');
create trigger log_row_change after insert or update or delete on public.staff
  for each row execute function private.log_row_change(
    'id', 'organization_id', 'member_id', 'display_name', 'title', 'photo_path', 'commission_percent',
    'is_bookable', 'is_active'
  );
create trigger log_row_change after insert or update or delete on public.staff_branches
  for each row execute function private.log_row_change('staff_id', 'organization_id');
create trigger log_row_change after insert or update or delete on public.staff_services
  for each row execute function private.log_row_change('staff_id', 'organization_id', 'commission_percent_override');
create trigger log_row_change after insert or update or delete on public.staff_shifts
  for each row execute function private.log_row_change(
    'id', 'organization_id', 'day_of_week', 'starts_at', 'ends_at', 'ends_next_day'
  );
create trigger log_row_change after insert or update or delete on public.staff_time_off
  for each row execute function private.log_row_change('id', 'organization_id', 'starts_at', 'ends_at', 'reason');

-- ---------------------------------------------------------------------------
-- Shop setup row-level security
-- ---------------------------------------------------------------------------

alter table public.branch_closures enable row level security;
alter table public.branch_media enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.branch_services enable row level security;
alter table public.staff enable row level security;
alter table public.staff_branches enable row level security;
alter table public.staff_services enable row level security;
alter table public.staff_shifts enable row level security;
alter table public.staff_time_off enable row level security;

-- Branch-level setup: members read; the owner and the branch's managers write.
create policy branch_closures_select on public.branch_closures
  for select to authenticated
  using (organization_id in (select private.accessible_organization_ids()));
create policy branch_closures_insert on public.branch_closures
  for insert to authenticated
  with check (branch_id in (select private.branch_ids_with_role('{owner,manager}')));
create policy branch_closures_update on public.branch_closures
  for update to authenticated
  using (branch_id in (select private.branch_ids_with_role('{owner,manager}')))
  with check (branch_id in (select private.branch_ids_with_role('{owner,manager}')));
create policy branch_closures_delete on public.branch_closures
  for delete to authenticated
  using (branch_id in (select private.branch_ids_with_role('{owner,manager}')));

create policy branch_media_select on public.branch_media
  for select to authenticated
  using (organization_id in (select private.accessible_organization_ids()));
create policy branch_media_insert on public.branch_media
  for insert to authenticated
  with check (branch_id in (select private.branch_ids_with_role('{owner,manager}')));
create policy branch_media_update on public.branch_media
  for update to authenticated
  using (branch_id in (select private.branch_ids_with_role('{owner,manager}')))
  with check (branch_id in (select private.branch_ids_with_role('{owner,manager}')));
create policy branch_media_delete on public.branch_media
  for delete to authenticated
  using (branch_id in (select private.branch_ids_with_role('{owner,manager}')));

create policy branch_services_select on public.branch_services
  for select to authenticated
  using (organization_id in (select private.accessible_organization_ids()));
create policy branch_services_insert on public.branch_services
  for insert to authenticated
  with check (branch_id in (select private.branch_ids_with_role('{owner,manager}')));
create policy branch_services_update on public.branch_services
  for update to authenticated
  using (branch_id in (select private.branch_ids_with_role('{owner,manager}')))
  with check (branch_id in (select private.branch_ids_with_role('{owner,manager}')));
create policy branch_services_delete on public.branch_services
  for delete to authenticated
  using (branch_id in (select private.branch_ids_with_role('{owner,manager}')));

-- Organization-wide catalogue and staff profiles: members read; only the owner writes.
create policy service_categories_select on public.service_categories
  for select to authenticated
  using (organization_id in (select private.accessible_organization_ids()));
create policy service_categories_write on public.service_categories
  for all to authenticated
  using (organization_id in (select private.owned_organization_ids()))
  with check (organization_id in (select private.owned_organization_ids()));

create policy services_select on public.services
  for select to authenticated
  using (organization_id in (select private.accessible_organization_ids()));
create policy services_write on public.services
  for all to authenticated
  using (organization_id in (select private.owned_organization_ids()))
  with check (organization_id in (select private.owned_organization_ids()));

create policy staff_select on public.staff
  for select to authenticated
  using (organization_id in (select private.accessible_organization_ids()));
create policy staff_write on public.staff
  for all to authenticated
  using (organization_id in (select private.owned_organization_ids()))
  with check (organization_id in (select private.owned_organization_ids()));

create policy staff_branches_select on public.staff_branches
  for select to authenticated
  using (organization_id in (select private.accessible_organization_ids()));
create policy staff_branches_write on public.staff_branches
  for all to authenticated
  using (organization_id in (select private.owned_organization_ids()))
  with check (organization_id in (select private.owned_organization_ids()));

create policy staff_services_select on public.staff_services
  for select to authenticated
  using (organization_id in (select private.accessible_organization_ids()));
create policy staff_services_write on public.staff_services
  for all to authenticated
  using (organization_id in (select private.owned_organization_ids()))
  with check (organization_id in (select private.owned_organization_ids()));

-- Shifts: the owner, and managers for shifts at their branches.
create policy staff_shifts_select on public.staff_shifts
  for select to authenticated
  using (organization_id in (select private.accessible_organization_ids()));
create policy staff_shifts_write on public.staff_shifts
  for all to authenticated
  using (branch_id in (select private.branch_ids_with_role('{owner,manager}')))
  with check (branch_id in (select private.branch_ids_with_role('{owner,manager}')));

-- Time off: the owner, and managers for staff assigned to their branches.
create policy staff_time_off_select on public.staff_time_off
  for select to authenticated
  using (organization_id in (select private.accessible_organization_ids()));
create policy staff_time_off_write on public.staff_time_off
  for all to authenticated
  using (
    organization_id in (select private.owned_organization_ids())
    or staff_id in (
      select sb.staff_id
      from public.staff_branches sb
      where sb.branch_id in (select private.branch_ids_with_role('{manager}'))
    )
  )
  with check (
    organization_id in (select private.owned_organization_ids())
    or staff_id in (
      select sb.staff_id
      from public.staff_branches sb
      where sb.branch_id in (select private.branch_ids_with_role('{manager}'))
    )
  );

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- The caller's own active memberships with the organization's access status. Runs with the view
-- owner's rights so a member of a restricted organization can still learn that it is restricted;
-- it exposes only the caller's own rows.
create view public.my_memberships as
  select
    m.id as member_id,
    m.organization_id,
    o.name as organization_name,
    o.slug as organization_slug,
    o.access_status,
    m.role,
    m.can_review_deposits
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.is_active;

-- The active branches the caller works in: all of an owner's, a manager's or staff member's
-- assigned ones. Runs with the caller's rights.
create view public.my_branches with (security_invoker = true) as
  select b.id, b.organization_id, b.name, b.slug, b.timezone, b.business_day_start
  from public.branches b
  where b.is_active
    and b.id in (select private.branch_ids_with_role('{owner,manager,staff}'));

-- ---------------------------------------------------------------------------
-- Publishing checklist
-- ---------------------------------------------------------------------------

-- What each active branch has towards publishing (SET-10). The setup screens read it to decide
-- whether the branch can be published, or whether a removal would take away the last required
-- item; the database does not enforce these rules.
create view public.branch_setup_status with (security_invoker = true) as
  select
    b.id as branch_id,
    b.organization_id,
    b.is_published,
    (
      coalesce(trim(b.address), '') <> ''
      and coalesce(trim(b.city), '') <> ''
      and coalesce(trim(b.area), '') <> ''
    ) as has_location,
    (select count(*) from public.branch_hours h where h.branch_id = b.id and not h.is_closed) as open_day_count,
    (
      select count(*)
      from public.branch_services bs
      join public.services s on s.id = bs.service_id
      where bs.branch_id = b.id and s.is_active
    ) as offered_service_count,
    (
      select count(distinct sh.staff_id)
      from public.staff_shifts sh
      join public.staff st on st.id = sh.staff_id
      where sh.branch_id = b.id and st.is_bookable and st.is_active
    ) as bookable_staff_with_shift_count,
    (
      coalesce(b.payment_instructions ->> 'method', '') <> ''
      and coalesce(b.payment_instructions ->> 'account_name', '') <> ''
      and coalesce(b.payment_instructions ->> 'account_number', '') <> ''
      and coalesce(b.payment_instructions ->> 'qr_path', '') <> ''
    ) as has_payment_details,
    o.terms_accepted_at is not null as terms_accepted
  from public.branches b
  join public.organizations o on o.id = b.organization_id
  where b.is_active;

-- ---------------------------------------------------------------------------
-- Functions called through PostgREST
-- ---------------------------------------------------------------------------
-- Coded errors use SQLSTATE class GB; the app maps each code to a safe message.

create function private.require_signed_in_account()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = 'GBA01', message = 'sign_in_required';
  end if;
  return v_user_id;
end;
$$;

-- Inserts a branch with a free slug and its weekly hours. Used by create_organization and
-- create_branch, which check the caller first.
create function private.insert_branch(
  p_organization_id uuid,
  p_organization_name text,
  p_branch_name text,
  p_address text,
  p_city text,
  p_area text,
  p_hours jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  -- Another branch may take the same slug at the same moment; pick again until one sticks.
  loop
    insert into public.branches (organization_id, name, slug, address, city, area)
    values (
      p_organization_id,
      p_branch_name,
      private.available_slug('branches', p_organization_name || ' ' || p_branch_name),
      p_address,
      p_city,
      p_area
    )
    on conflict (slug) do nothing
    returning id into v_branch_id;
    exit when v_branch_id is not null;
  end loop;

  insert into public.branch_hours (branch_id, organization_id, day_of_week, opens_at, closes_at, closes_next_day, is_closed)
  select v_branch_id, p_organization_id, h.day_of_week, h.opens_at, h.closes_at, h.closes_next_day, h.is_closed
  from jsonb_to_recordset(p_hours)
    as h (day_of_week smallint, opens_at time, closes_at time, closes_next_day boolean, is_closed boolean);

  return v_branch_id;
end;
$$;

create function public.create_organization(
  p_organization_name text,
  p_category public.org_category,
  p_branch_name text,
  p_address text,
  p_city text,
  p_area text,
  p_hours jsonb
)
returns table (organization_id uuid, branch_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
  v_organization_id uuid;
  v_branch_id uuid;
begin
  -- Another organization may take the same slug at the same moment; pick again until one sticks.
  loop
    insert into public.organizations (name, slug, category)
    values (p_organization_name, private.available_slug('organizations', p_organization_name), p_category)
    on conflict (slug) do nothing
    returning id into v_organization_id;
    exit when v_organization_id is not null;
  end loop;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_organization_id, v_user_id, 'owner');

  v_branch_id := private.insert_branch(
    v_organization_id, p_organization_name, p_branch_name, p_address, p_city, p_area, p_hours
  );

  perform private.log_activity(
    v_organization_id, 'organization.created', 'organization', v_organization_id,
    jsonb_build_object('branch_id', v_branch_id, 'category', p_category)
  );

  return query select v_organization_id, v_branch_id;
end;
$$;


create function public.create_branch(
  p_organization_id uuid,
  p_branch_name text,
  p_address text,
  p_city text,
  p_area text,
  p_hours jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_name text;
  v_branch_id uuid;
begin
  perform private.require_signed_in_account();

  select o.name into v_organization_name
  from public.organizations o
  where o.id = p_organization_id
    and o.id in (select private.owned_organization_ids())
  for update;

  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  v_branch_id := private.insert_branch(
    p_organization_id, v_organization_name, p_branch_name, p_address, p_city, p_area, p_hours
  );

  perform private.log_activity(
    p_organization_id, 'branch.created', 'branch', v_branch_id, '{}'::jsonb
  );

  return v_branch_id;
end;
$$;

create function public.accept_terms(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
begin
  perform 1
  from public.organizations o
  where o.id = p_organization_id
    and o.id in (select private.owned_organization_ids())
  for update;

  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  update public.organizations
  set terms_accepted_at = now(), terms_accepted_by = v_user_id
  where id = p_organization_id;

  perform private.log_activity(
    p_organization_id, 'organization.terms_accepted', 'organization', p_organization_id, '{}'::jsonb
  );
end;
$$;
create function public.create_invite(
  p_organization_id uuid,
  p_role public.member_role,
  p_branch_ids uuid[],
  p_staff_id uuid default null
)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
  v_invite public.organization_invites;
begin
  if p_organization_id not in (select private.owned_organization_ids())
    or exists (
      select 1
      from unnest(p_branch_ids) as requested (branch_id)
      where not exists (
        select 1
        from public.branches b
        where b.id = requested.branch_id
          and b.organization_id = p_organization_id
          and b.is_active
      )
    )
    or (
      p_staff_id is not null
      and not exists (
        select 1 from public.staff s where s.id = p_staff_id and s.organization_id = p_organization_id
      )
    )
  then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  insert into public.organization_invites (organization_id, role, branch_ids, staff_id, expires_at, created_by)
  values (p_organization_id, p_role, p_branch_ids, p_staff_id, now() + interval '7 days', v_user_id)
  returning * into v_invite;

  perform private.log_activity(
    p_organization_id, 'invite.created', 'organization_invite', v_invite.id,
    jsonb_build_object('role', p_role, 'branch_count', cardinality(p_branch_ids), 'staff_linked', p_staff_id is not null)
  );

  return query select v_invite.id, v_invite.code, v_invite.expires_at;
end;
$$;

-- Readable by anyone holding the code, before signing in. Returns no row when the invite is
-- used, expired, or unknown.
create function public.get_invite_preview(p_code text)
returns table (
  organization_name text,
  role public.member_role,
  branch_names text[],
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.name,
    i.role,
    array(select b.name from public.branches b where b.id = any (i.branch_ids) and b.is_active order by b.name),
    i.expires_at
  from public.organization_invites i
  join public.organizations o on o.id = i.organization_id
  where i.code = p_code
    and i.accepted_at is null
    and i.expires_at > now();
$$;

create function public.accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
  v_invite public.organization_invites;
  v_member_id uuid;
  v_member_is_active boolean;
begin
  select * into v_invite
  from public.organization_invites
  where code = p_code
  for update;

  if not found or v_invite.accepted_at is not null or v_invite.expires_at <= now() then
    raise exception using errcode = 'GBI01', message = 'invite_unavailable';
  end if;

  select id, is_active into v_member_id, v_member_is_active
  from public.organization_members
  where organization_id = v_invite.organization_id
    and user_id = v_user_id
  for update;

  if v_member_is_active then
    raise exception using errcode = 'GBI02', message = 'already_member';
  end if;

  if v_member_id is null then
    insert into public.organization_members (organization_id, user_id, role)
    values (v_invite.organization_id, v_user_id, v_invite.role)
    returning id into v_member_id;
  else
    update public.organization_members
    set role = v_invite.role, can_review_deposits = false, is_active = true
    where id = v_member_id;
  end if;

  insert into public.member_branches (member_id, branch_id, organization_id)
  select v_member_id, b.id, b.organization_id
  from public.branches b
  where b.id = any (v_invite.branch_ids)
    and b.organization_id = v_invite.organization_id
    and b.is_active;

  -- A login links to at most one staff profile: the one the invite names.
  if v_invite.staff_id is not null then
    update public.staff
    set member_id = null
    where member_id = v_member_id
      and id <> v_invite.staff_id;

    update public.staff
    set member_id = v_member_id
    where id = v_invite.staff_id;
  end if;

  update public.organization_invites
  set accepted_by = v_user_id, accepted_at = now()
  where id = v_invite.id;

  perform private.log_activity(
    v_invite.organization_id, 'invite.accepted', 'organization_member', v_member_id,
    jsonb_build_object('invite_id', v_invite.id, 'role', v_invite.role, 'staff_linked', v_invite.staff_id is not null)
  );

  return v_invite.organization_id;
end;
$$;

-- Creates or updates a staff profile with its branches and services in one step. Leaving a branch
-- removes the staff member's shifts there (staff_shifts cascades from staff_branches).
-- p_services: [{"service_id": uuid, "commission_percent_override": number or null}]. Without
-- p_staff_id it creates a profile.
create function public.save_staff_profile(
  p_organization_id uuid,
  p_display_name text,
  p_commission_percent numeric,
  p_is_bookable boolean,
  p_is_active boolean,
  p_branch_ids uuid[],
  p_services jsonb,
  p_staff_id uuid default null,
  p_title text default null,
  p_photo_path text default null,
  p_member_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := p_staff_id;
begin
  perform private.require_signed_in_account();

  if p_organization_id not in (select private.owned_organization_ids()) then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  if v_staff_id is null then
    insert into public.staff (
      organization_id, display_name, title, photo_path, commission_percent, is_bookable, is_active, member_id
    )
    values (
      p_organization_id, p_display_name, p_title, p_photo_path, p_commission_percent, p_is_bookable, p_is_active,
      p_member_id
    )
    returning id into v_staff_id;
  else
    perform 1
    from public.staff
    where id = v_staff_id and organization_id = p_organization_id
    for update;

    if not found then
      raise exception using errcode = 'GBA02', message = 'not_permitted';
    end if;

    update public.staff
    set display_name = p_display_name,
      title = p_title,
      photo_path = p_photo_path,
      commission_percent = p_commission_percent,
      is_bookable = p_is_bookable,
      is_active = p_is_active,
      member_id = p_member_id
    where id = v_staff_id;
  end if;

  delete from public.staff_branches
  where staff_id = v_staff_id
    and branch_id <> all (p_branch_ids);

  insert into public.staff_branches (staff_id, branch_id, organization_id)
  select v_staff_id, requested.branch_id, p_organization_id
  from unnest(p_branch_ids) as requested (branch_id)
  on conflict (staff_id, branch_id) do nothing;

  delete from public.staff_services
  where staff_id = v_staff_id
    and service_id not in (
      select (requested ->> 'service_id')::uuid from jsonb_array_elements(p_services) as requested
    );

  insert into public.staff_services (staff_id, service_id, organization_id, commission_percent_override)
  select v_staff_id, requested.service_id, p_organization_id, requested.commission_percent_override
  from jsonb_to_recordset(p_services) as requested (service_id uuid, commission_percent_override numeric)
  on conflict (staff_id, service_id) do update
    set commission_percent_override = excluded.commission_percent_override;

  perform private.log_activity(
    p_organization_id, case when p_staff_id is null then 'staff.created' else 'staff.updated' end, 'staff',
    v_staff_id,
    jsonb_build_object(
      'branch_count', cardinality(p_branch_ids),
      'service_count', jsonb_array_length(p_services),
      'is_bookable', p_is_bookable,
      'is_active', p_is_active
    )
  );

  return v_staff_id;
end;
$$;

-- Replaces a branch's weekly hours. p_hours holds all seven days, as create_organization takes
-- them.
create function public.set_branch_hours(p_branch_id uuid, p_hours jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  perform private.require_signed_in_account();

  select b.organization_id into v_organization_id
  from public.branches b
  where b.id = p_branch_id
    and b.id in (select private.branch_ids_with_role('{owner,manager}'))
  for update;

  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  insert into public.branch_hours (branch_id, organization_id, day_of_week, opens_at, closes_at, closes_next_day, is_closed)
  select p_branch_id, v_organization_id, h.day_of_week, h.opens_at, h.closes_at, h.closes_next_day, h.is_closed
  from jsonb_to_recordset(p_hours)
    as h (day_of_week smallint, opens_at time, closes_at time, closes_next_day boolean, is_closed boolean)
  on conflict (branch_id, day_of_week) do update
    set opens_at = excluded.opens_at,
      closes_at = excluded.closes_at,
      closes_next_day = excluded.closes_next_day,
      is_closed = excluded.is_closed;

  perform private.log_activity(
    v_organization_id, 'branch.hours_updated', 'branch', p_branch_id,
    jsonb_build_object('open_days', (select count(*) from jsonb_array_elements(p_hours) as day where not (day ->> 'is_closed')::boolean))
  );
end;
$$;

create function public.update_member(
  p_member_id uuid,
  p_role public.member_role,
  p_branch_ids uuid[],
  p_can_review_deposits boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.organization_members;
begin
  perform private.require_signed_in_account();

  select * into v_member
  from public.organization_members
  where id = p_member_id
  for update;

  if not found
    or v_member.organization_id not in (select private.owned_organization_ids())
    or exists (
      select 1
      from unnest(p_branch_ids) as requested (branch_id)
      where not exists (
        select 1
        from public.branches b
        where b.id = requested.branch_id
          and b.organization_id = v_member.organization_id
          and b.is_active
      )
    )
  then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  if v_member.role = 'owner' then
    raise exception using errcode = 'GBM01', message = 'owner_membership_locked';
  end if;

  update public.organization_members
  set role = p_role, can_review_deposits = p_can_review_deposits
  where id = p_member_id;

  delete from public.member_branches
  where member_id = p_member_id
    and branch_id <> all (p_branch_ids);

  insert into public.member_branches (member_id, branch_id, organization_id)
  select p_member_id, requested.branch_id, v_member.organization_id
  from unnest(p_branch_ids) as requested (branch_id)
  on conflict (member_id, branch_id) do nothing;

  perform private.log_activity(
    v_member.organization_id, 'member.updated', 'organization_member', p_member_id,
    jsonb_build_object(
      'role', p_role,
      'branch_count', cardinality(p_branch_ids),
      'can_review_deposits', p_can_review_deposits
    )
  );
end;
$$;

create function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.organization_members;
begin
  perform private.require_signed_in_account();

  select * into v_member
  from public.organization_members
  where id = p_member_id
  for update;

  if not found or v_member.organization_id not in (select private.owned_organization_ids()) then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  if v_member.role = 'owner' then
    raise exception using errcode = 'GBM01', message = 'owner_membership_locked';
  end if;

  update public.organization_members
  set is_active = false, can_review_deposits = false
  where id = p_member_id;

  delete from public.member_branches where member_id = p_member_id;

  perform private.log_activity(
    v_member.organization_id, 'member.removed', 'organization_member', p_member_id,
    jsonb_build_object('role', v_member.role)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Supabase grants every new public table and function to anon and authenticated by default.
-- Revoke that and grant only what the policies above are written for.

revoke all on table
  public.platform_settings, public.platform_admins, public.profiles, public.organizations,
  public.branches, public.branch_hours, public.organization_members, public.member_branches,
  public.organization_invites, public.notifications, public.activity_logs,
  public.my_memberships, public.my_branches
from anon, authenticated;

grant select on public.platform_settings to authenticated;
grant update (
  fee_percent, fee_minimum, fee_maximum, cutoff_schedule, cutoff_weekday, grace_period_days,
  statement_minimum, payment_instructions
) on public.platform_settings to authenticated;
grant select on public.platform_admins to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, mobile_number, avatar_path) on public.profiles to authenticated;
grant select on public.organizations to authenticated;
grant update (
  name, logo_path, category, is_listed, deposit_type, deposit_fixed_amount, deposit_percent,
  hold_minutes, review_hours, slot_interval_minutes, min_notice_minutes, booking_horizon_days,
  cancellation_policy
) on public.organizations to authenticated;
grant select on public.branches to authenticated;
grant update (
  name, address, city, area, latitude, longitude, timezone, business_day_start, contact_number,
  payment_instructions, is_published, is_active
) on public.branches to authenticated;
grant select, insert, delete on public.branch_hours to authenticated;
grant update (opens_at, closes_at, closes_next_day, is_closed) on public.branch_hours to authenticated;
grant select on public.organization_members to authenticated;
grant select on public.member_branches to authenticated;
grant select on public.organization_invites to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.activity_logs to authenticated;
grant select on public.my_memberships to authenticated;
grant select on public.my_branches to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
-- log_activity is reachable only from SQL; PostgREST does not expose the private schema.
grant execute on function
  private.log_activity(uuid, text, text, uuid, jsonb),
  private.accessible_organization_ids(),
  private.owned_organization_ids(),
  private.branch_ids_with_role(public.member_role[]),
  private.colleague_user_ids(),
  private.is_platform_admin()
to authenticated;

revoke all on function
  public.create_organization(text, public.org_category, text, text, text, text, jsonb),
  public.create_invite(uuid, public.member_role, uuid[], uuid),
  public.get_invite_preview(text),
  public.accept_invite(text),
  public.update_member(uuid, public.member_role, uuid[], boolean),
  public.remove_member(uuid)
from public, anon, authenticated;
grant execute on function
  public.create_organization(text, public.org_category, text, text, text, text, jsonb),
  public.create_invite(uuid, public.member_role, uuid[], uuid),
  public.get_invite_preview(text),
  public.accept_invite(text),
  public.update_member(uuid, public.member_role, uuid[], boolean),
  public.remove_member(uuid)
to authenticated;
grant execute on function public.get_invite_preview(text) to anon;

-- Shop setup privileges

-- ---------------------------------------------------------------------------

revoke all on table
  public.branch_closures, public.branch_media, public.service_categories, public.services,
  public.branch_services, public.staff, public.staff_branches, public.staff_services,
  public.staff_shifts, public.staff_time_off, public.branch_setup_status
from anon, authenticated;

grant select, insert, delete on public.branch_closures to authenticated;
grant update (starts_at, ends_at, reason) on public.branch_closures to authenticated;
grant select, insert, delete on public.branch_media to authenticated;
grant update (sort_order) on public.branch_media to authenticated;
grant select, insert, delete on public.service_categories to authenticated;
grant update (name, sort_order) on public.service_categories to authenticated;
grant select, insert, delete on public.services to authenticated;
grant update (
  category_id, name, description, duration_minutes, buffer_minutes, price, price_is_starting, deposit_type,
  deposit_fixed_amount, deposit_percent, is_active, sort_order
) on public.services to authenticated;
grant select, insert, delete on public.branch_services to authenticated;
grant update (price_override) on public.branch_services to authenticated;
grant select, insert on public.staff to authenticated;
grant update (member_id, display_name, title, photo_path, commission_percent, is_bookable, is_active)
  on public.staff to authenticated;
grant select, insert, delete on public.staff_branches to authenticated;
grant select, insert, delete on public.staff_services to authenticated;
grant update (commission_percent_override) on public.staff_services to authenticated;
grant select, insert, delete on public.staff_shifts to authenticated;
grant update (day_of_week, starts_at, ends_at, ends_next_day) on public.staff_shifts to authenticated;
grant select, insert, delete on public.staff_time_off to authenticated;
grant update (starts_at, ends_at, reason) on public.staff_time_off to authenticated;
grant select on public.branch_setup_status to authenticated;

revoke all on function private.insert_branch(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;

revoke all on function
  public.create_branch(uuid, text, text, text, text, jsonb),
  public.accept_terms(uuid),
  public.save_staff_profile(uuid, text, numeric, boolean, boolean, uuid[], jsonb, uuid, text, text, uuid),
  public.set_branch_hours(uuid, jsonb)
from public, anon, authenticated;
grant execute on function
  public.create_branch(uuid, text, text, text, text, jsonb),
  public.accept_terms(uuid),
  public.save_staff_profile(uuid, text, numeric, boolean, boolean, uuid[], jsonb, uuid, text, text, uuid),
  public.set_branch_hours(uuid, jsonb)
to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
-- Paths: shop-media {organization_id}/logo/{file}, {organization_id}/branches/{branch_id}/{file},
-- {organization_id}/staff/{staff_id}/{file}; payment-qr {organization_id}/{branch_id}/{file}.
-- Both buckets are public to read. 5 MB, images only.

-- The owner writes anything under the organization's folder; a manager writes the photos of
-- their own branches.
create policy shop_media_select_writers on storage.objects
  for select to authenticated
  using (
    bucket_id = 'shop-media'
    and (
      (storage.foldername(name))[1] in (select o::text from private.owned_organization_ids() as o)
      or (
        (storage.foldername(name))[2] = 'branches'
        and (storage.foldername(name))[1] || '/' || (storage.foldername(name))[3] in (
          select b.organization_id::text || '/' || b.id::text
          from public.branches b
          where b.id in (select private.branch_ids_with_role('{manager}'))
        )
      )
    )
  );
create policy shop_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'shop-media'
    and (
      (storage.foldername(name))[1] in (select o::text from private.owned_organization_ids() as o)
      or (
        (storage.foldername(name))[2] = 'branches'
        and (storage.foldername(name))[1] || '/' || (storage.foldername(name))[3] in (
          select b.organization_id::text || '/' || b.id::text
          from public.branches b
          where b.id in (select private.branch_ids_with_role('{manager}'))
        )
      )
    )
  );
create policy shop_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'shop-media'
    and (
      (storage.foldername(name))[1] in (select o::text from private.owned_organization_ids() as o)
      or (
        (storage.foldername(name))[2] = 'branches'
        and (storage.foldername(name))[1] || '/' || (storage.foldername(name))[3] in (
          select b.organization_id::text || '/' || b.id::text
          from public.branches b
          where b.id in (select private.branch_ids_with_role('{manager}'))
        )
      )
    )
  );

create policy payment_qr_select_owner on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-qr'
    and (storage.foldername(name))[1] in (select o::text from private.owned_organization_ids() as o)
  );
create policy payment_qr_insert_owner on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-qr'
    and (storage.foldername(name))[1] in (select o::text from private.owned_organization_ids() as o)
  );
create policy payment_qr_delete_owner on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-qr'
    and (storage.foldername(name))[1] in (select o::text from private.owned_organization_ids() as o)
  );

-- ---------------------------------------------------------------------------
-- Realtime and bootstrap records
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.notifications;

insert into public.platform_settings (id) values (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('shop-media', 'shop-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-qr', 'payment-qr', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- ---------------------------------------------------------------------------
-- Applied migrations
-- ---------------------------------------------------------------------------
-- Marks the migrations this baseline already contains, so the CLI applies only newer ones.

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations (version, name)
values
  ('20261105120000', 'foundation_and_tenancy'),
  ('20261106120000', 'shop_setup');
