-- GroomBox baseline: the complete current application database for a fresh Supabase installation.
-- Maintained by hand alongside supabase/migrations (see AGENTS.md, Supabase Migrations): edit each
-- object in place, never append ALTER sequences, never regenerate from a dump.
-- `npm run db:baseline:check` proves it matches the migration chain.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Internal helpers live in `private`, which PostgREST does not expose. Visitors without a session
-- need the schema too: the public views compute a branch's business date with
-- private.business_date, and a view's functions run with the caller's rights.
create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
grant usage on schema private to anon;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'manager', 'staff');
create type public.org_access_status as enum ('active', 'restricted');
create type public.org_restriction_reason as enum ('overdue_statement', 'manual');
create type public.org_category as enum ('salon', 'barbershop', 'spa', 'nails', 'lashes_brows', 'other');
create type public.deposit_type as enum ('fixed', 'percent');
create type public.cutoff_schedule as enum ('weekly', 'semi_monthly', 'monthly');
create type public.booking_source as enum ('online', 'staff', 'walk_in');
create type public.booking_status as enum (
  'held', 'payment_submitted', 'needs_resubmission', 'review_expired_pending_resolution', 'confirmed', 'waiting',
  'checked_in', 'in_service', 'completed', 'cancelled', 'no_show', 'hold_expired', 'payment_rejected'
);
create type public.proof_status as enum ('submitted', 'accepted', 'rejected', 'resubmission_requested', 'withdrawn');
create type public.payment_method as enum ('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'other');
create type public.fee_entry_kind as enum ('booking_fee', 'adjustment');

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

-- A moment's business date at a branch: its local date after subtracting business_day_start, so a
-- 1:30 AM moment belongs to the previous day with the default 5:00 AM start. Every business date
-- (bookings, sales, queue numbers, the daily close, the floor's "today") comes from here.
create function private.business_date(p_at timestamptz, p_timezone text, p_business_day_start time)
returns date
language sql
stable
set search_path = ''
as $$
  select ((p_at at time zone p_timezone) - p_business_day_start)::date;
$$;

-- Booking codes are typed and read aloud, so input ignores dashes, spaces, and case, and reads the
-- look-alike letters I, L, and O as Crockford's base32 does (1, 1, 0).
create function private.normalize_booking_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(upper(regexp_replace(p_code, '[^0-9A-Za-z]', '', 'g')), 'ILO', '110');
$$;

-- 12 random Crockford base32 characters (60 bits): the booking link's secret. Inserts never supply
-- it; the unique constraint is the final guard against a collision.
create function private.set_booking_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.booking_code := private.random_code(12);
  return new;
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
-- Clients
-- ---------------------------------------------------------------------------

-- The organization's own record of a client, linked to the platform-wide account when there is
-- one. Never visible to another organization.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id uuid references public.profiles (id),
  full_name text not null,
  mobile_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, user_id)
);

create index clients_organization_mobile_idx on public.clients (organization_id, mobile_number);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique,
  organization_id uuid not null references public.organizations (id),
  branch_id uuid not null,
  client_id uuid not null,
  booked_by uuid not null references public.profiles (id),
  staff_id uuid,
  source public.booking_source not null,
  status public.booking_status not null,
  start_at timestamptz,
  end_at timestamptz,
  business_date date not null,
  service_total numeric(20,2) not null,
  deposit_amount numeric(20,2) not null default 0,
  convenience_fee numeric(20,2) not null default 0,
  amount_due numeric(20,2) not null default 0,
  payment_instructions_snapshot jsonb,
  policy_acceptance_metadata jsonb,
  hold_expires_at timestamptz,
  review_expires_at timestamptz,
  review_reminder_sent_at timestamptz,
  queue_number smallint,
  client_note text,
  cancellation_metadata jsonb,
  refund_metadata jsonb,
  checked_in_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id),
  foreign key (client_id, organization_id) references public.clients (id, organization_id),
  foreign key (staff_id, organization_id) references public.staff (id, organization_id),
  constraint bookings_range_check check (end_at > start_at),
  constraint bookings_range_pair_check check ((start_at is null) = (end_at is null)),
  constraint bookings_scheduled_check check (status = 'waiting' or (staff_id is not null and start_at is not null)),
  constraint bookings_hold_check check (status <> 'held' or hold_expires_at is not null),
  constraint bookings_amount_due_check check (amount_due = deposit_amount + convenience_fee),
  constraint bookings_online_deposit_check check (source <> 'online' or deposit_amount > 0),
  -- No two bookings that block a slot overlap for one staff member. A held booking blocks only
  -- until hold_expires_at, which a constraint cannot read, so booking functions move the staff
  -- member's expired holds to hold_expired before inserting.
  constraint bookings_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (
    staff_id is not null and start_at is not null
    and status in (
      'held', 'payment_submitted', 'needs_resubmission', 'review_expired_pending_resolution', 'confirmed',
      'checked_in', 'in_service', 'completed'
    )
  )
);

create index bookings_branch_start_idx on public.bookings (branch_id, start_at);
create index bookings_branch_business_date_idx on public.bookings (branch_id, business_date);
create index bookings_staff_start_idx on public.bookings (staff_id, start_at);
create index bookings_booked_by_start_idx on public.bookings (booked_by, start_at desc);
create index bookings_organization_client_idx on public.bookings (organization_id, client_id);
create index bookings_hold_expires_idx on public.bookings (hold_expires_at) where status = 'held';
create index bookings_review_expires_idx on public.bookings (review_expires_at)
  where status in ('payment_submitted', 'needs_resubmission');
create index bookings_review_reminder_idx on public.bookings (review_expires_at)
  where status = 'payment_submitted' and review_reminder_sent_at is null;

-- Service names, durations, buffers, and prices as they were when the booking was made.
create table public.booking_services (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  service_id uuid not null,
  service_name text not null,
  duration_minutes smallint not null,
  buffer_minutes smallint not null,
  price numeric(20,2) not null,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  foreign key (booking_id, organization_id) references public.bookings (id, organization_id),
  foreign key (service_id, organization_id) references public.services (id, organization_id)
);

create index booking_services_booking_id_idx on public.booking_services (booking_id);
create index booking_services_service_id_idx on public.booking_services (service_id);
create index booking_services_organization_id_idx on public.booking_services (organization_id);

-- A client's report that they paid the amount due, and the shop's review of it. A booking can have
-- several over time; at most one is submitted at once.
create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  branch_id uuid not null,
  booking_id uuid not null,
  submitted_by uuid not null references public.profiles (id),
  reference_number text not null,
  amount_paid numeric(20,2) not null,
  method public.payment_method not null,
  proof_path text,
  note text,
  status public.proof_status not null default 'submitted',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  -- The wall-clock time, so proofs keep their order even within one transaction; the latest proof
  -- is the one a review decides.
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  foreign key (booking_id, organization_id) references public.bookings (id, organization_id),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id)
);

create unique index payment_proofs_one_submitted_idx on public.payment_proofs (booking_id) where status = 'submitted';
create index payment_proofs_booking_created_idx on public.payment_proofs (booking_id, created_at desc);
create index payment_proofs_submitted_branch_idx on public.payment_proofs (branch_id) where status = 'submitted';
create index payment_proofs_organization_id_idx on public.payment_proofs (organization_id);
create index payment_proofs_submitted_by_idx on public.payment_proofs (submitted_by);

-- What the organization owes GroomBox: one booking_fee entry per accepted deposit, plus a platform
-- admin's adjustments (phase 8). Amounts never change and entries are never deleted. Phase 8 adds
-- statement_id with the statements table.
create table public.fee_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  branch_id uuid,
  kind public.fee_entry_kind not null,
  booking_id uuid,
  amount numeric(20,2) not null,
  description text,
  accrued_at timestamptz not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id),
  foreign key (booking_id, organization_id) references public.bookings (id, organization_id),
  constraint fee_entries_booking_fee_check
    check (kind <> 'booking_fee' or (booking_id is not null and branch_id is not null and amount > 0))
);

create unique index fee_entries_one_per_booking_idx on public.fee_entries (booking_id) where kind = 'booking_fee';
create index fee_entries_organization_accrued_idx on public.fee_entries (organization_id, accrued_at);

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

-- Accessible organizations where the caller is the owner or a manager. SECURITY DEFINER for the
-- same reason as the other membership helpers; it takes no row-varying argument.
create function private.managed_organization_ids()
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
    and m.role in ('owner', 'manager')
    and o.access_status = 'active';
$$;

-- Branches where the caller reviews deposits: all of an owner's, a manager's assigned branches, and
-- a staff member's assigned branches when they may review deposits. Access must be active.
create function private.deposit_review_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.branch_ids_with_role('{owner,manager}')
  union all
  select mb.branch_id
  from public.member_branches mb
  join public.organization_members m on m.id = mb.member_id
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and m.role = 'staff'
    and m.can_review_deposits
    and o.access_status = 'active';
$$;

-- Organizations the caller owns, whatever their access status: a restricted owner still sees what
-- they owe (fee entries, and statements from phase 8).
create function private.billing_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = (select auth.uid())
    and m.is_active
    and m.role = 'owner';
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
-- Booking triggers
-- ---------------------------------------------------------------------------

create trigger set_booking_code before insert on public.bookings
  for each row execute function private.set_booking_code();
create trigger set_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.bookings
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.payment_proofs
  for each row execute function private.set_updated_at();

create trigger log_row_change after insert or update or delete on public.clients
  for each row execute function private.log_row_change('id', 'organization_id', 'full_name', 'mobile_number', 'notes');

-- ---------------------------------------------------------------------------
-- Booking row-level security
-- ---------------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_services enable row level security;

-- The owner and managers keep the client list; staff read the clients on their branches' bookings
-- (the bookings policy scopes the subquery). Staff find other clients through search_clients.
create policy clients_select on public.clients
  for select to authenticated
  using (
    organization_id in (select private.managed_organization_ids())
    or id in (
      select b.client_id
      from public.bookings b
      where b.branch_id in (select private.branch_ids_with_role('{staff}'))
    )
  );
create policy clients_insert on public.clients
  for insert to authenticated
  with check (organization_id in (select private.managed_organization_ids()));
create policy clients_update on public.clients
  for update to authenticated
  using (organization_id in (select private.managed_organization_ids()))
  with check (organization_id in (select private.managed_organization_ids()));

-- Members see their branches' bookings; a client or guest sees the bookings they created. Anyone
-- else holding the code goes through get_booking_by_code. Writes go through functions only.
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    branch_id in (select private.branch_ids_with_role('{owner,manager,staff}'))
    or booked_by = (select auth.uid())
  );

create policy booking_services_select on public.booking_services
  for select to authenticated
  using (booking_id in (select b.id from public.bookings b));

alter table public.payment_proofs enable row level security;
alter table public.fee_entries enable row level security;

create policy payment_proofs_select on public.payment_proofs
  for select to authenticated
  using (
    branch_id in (select private.deposit_review_branch_ids())
    or submitted_by = (select auth.uid())
  );

create policy fee_entries_select on public.fee_entries
  for select to authenticated
  using (
    organization_id in (select private.billing_organization_ids())
    or (select private.is_platform_admin())
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
-- Public views
-- ---------------------------------------------------------------------------
-- They run with the view owner's rights so visitors, guests, and clients read published branches
-- without reading the tables, and they select only public columns. Restricted organizations stay
-- listed: booking links keep working while members are locked out.

create view public.public_branches as
  select
    b.id,
    b.slug,
    b.name,
    b.address,
    b.city,
    b.area,
    b.contact_number,
    b.timezone,
    b.business_day_start,
    b.organization_id,
    o.name as organization_name,
    o.slug as organization_slug,
    o.logo_path as organization_logo_path,
    o.cancellation_policy,
    o.hold_minutes,
    o.booking_horizon_days,
    private.business_date(now(), b.timezone, b.business_day_start) as current_business_date,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'day_of_week', h.day_of_week,
            'opens_at', h.opens_at,
            'closes_at', h.closes_at,
            'closes_next_day', h.closes_next_day,
            'is_closed', h.is_closed
          )
          order by h.day_of_week
        ),
        '[]'::jsonb
      )
      from public.branch_hours h
      where h.branch_id = b.id
    ) as hours,
    (
      select coalesce(jsonb_agg(m.storage_path order by m.sort_order, m.created_at), '[]'::jsonb)
      from public.branch_media m
      where m.branch_id = b.id
    ) as photo_paths
  from public.branches b
  join public.organizations o on o.id = b.organization_id
  where b.is_published
    and b.is_active;

create view public.public_branch_services as
  select
    bs.branch_id,
    s.id as service_id,
    s.name,
    s.description,
    s.duration_minutes,
    coalesce(bs.price_override, s.price) as price,
    s.price_is_starting,
    s.sort_order,
    c.id as category_id,
    c.name as category_name,
    c.sort_order as category_sort_order
  from public.branch_services bs
  join public.branches b on b.id = bs.branch_id
  join public.services s on s.id = bs.service_id
  join public.service_categories c on c.id = s.category_id
  where b.is_published
    and b.is_active
    and s.is_active;

-- Bookable staff with a shift at the branch, and the branch's offered services each performs.
create view public.public_branch_staff as
  select
    sb.branch_id,
    st.id as staff_id,
    st.display_name,
    st.title,
    st.photo_path,
    array(
      select ss.service_id
      from public.staff_services ss
      join public.branch_services bs on bs.service_id = ss.service_id and bs.branch_id = sb.branch_id
      join public.services s on s.id = ss.service_id
      where ss.staff_id = st.id
        and s.is_active
      order by ss.service_id
    ) as service_ids
  from public.staff_branches sb
  join public.branches b on b.id = sb.branch_id
  join public.staff st on st.id = sb.staff_id
  where b.is_published
    and b.is_active
    and st.is_active
    and st.is_bookable
    and exists (select 1 from public.staff_shifts sh where sh.staff_id = st.id and sh.branch_id = sb.branch_id);

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

create function private.require_session()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
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
-- Booking engine internals
-- ---------------------------------------------------------------------------

-- The services of an online booking at a published branch, in the order given, with the branch's
-- price and each service's deposit: its own rule, else the organization's, capped at its price.
-- Only offered, active services are returned; callers compare the count with the request.
create function private.online_booking_lines(p_branch_id uuid, p_service_ids uuid[])
returns table (
  service_id uuid,
  service_name text,
  duration_minutes smallint,
  buffer_minutes smallint,
  price numeric(20,2),
  deposit numeric(20,2),
  sort_order integer
)
language sql
stable
set search_path = ''
as $$
  select
    s.id,
    s.name,
    s.duration_minutes,
    s.buffer_minutes,
    priced.price,
    case
      when s.deposit_type = 'fixed' then least(s.deposit_fixed_amount, priced.price)
      when s.deposit_type = 'percent' then least(round(priced.price * s.deposit_percent / 100, 2), priced.price)
      when o.deposit_type = 'fixed' then least(o.deposit_fixed_amount, priced.price)
      else least(round(priced.price * o.deposit_percent / 100, 2), priced.price)
    end,
    requested.ordinality::integer
  from unnest(p_service_ids) with ordinality as requested (service_id, ordinality)
  join public.branch_services bs on bs.branch_id = p_branch_id and bs.service_id = requested.service_id
  join public.branches b on b.id = bs.branch_id
  join public.organizations o on o.id = b.organization_id
  join public.services s on s.id = bs.service_id
  cross join lateral (select coalesce(bs.price_override, s.price) as price) as priced
  where b.is_published
    and b.is_active
    and s.is_active;
$$;

-- The platform's fee on a service total: rounded to the centavo, then held between the minimum
-- and the maximum.
create function private.convenience_fee(p_service_total numeric)
returns numeric(20,2)
language sql
stable
set search_path = ''
as $$
  select greatest(ps.fee_minimum, least(ps.fee_maximum, round(p_service_total * ps.fee_percent / 100, 2)))
  from public.platform_settings ps;
$$;

-- Every open start time on one business date, with each staff member who can take it: the whole
-- range (the services back to back plus their largest buffer, once) fits inside the branch's
-- opening and the staff member's shift, avoids closures and time off, and overlaps no booking that
-- blocks the slot. Start times step by slot_interval_minutes from the opening time, start at least
-- min_notice_minutes from now, and the date lies within booking_horizon_days of today. Hours and
-- shifts past midnight belong to the day they open and end by the next business day's start, so
-- only that day's rows matter.
create function private.open_booking_slots(
  p_branch_id uuid,
  p_business_date date,
  p_service_ids uuid[],
  p_staff_id uuid
)
returns table (start_at timestamptz, end_at timestamptz, staff_id uuid)
language sql
stable
set search_path = ''
as $$
  with branch as (
    select b.id, b.timezone, o.slot_interval_minutes, o.min_notice_minutes
    from public.branches b
    join public.organizations o on o.id = b.organization_id
    where b.id = p_branch_id
      and b.is_published
      and b.is_active
      and p_business_date >= private.business_date(now(), b.timezone, b.business_day_start)
      and p_business_date <= private.business_date(now(), b.timezone, b.business_day_start) + o.booking_horizon_days
  ),
  booking_length as (
    select make_interval(mins => (sum(l.duration_minutes) + max(l.buffer_minutes))::integer) as length
    from private.online_booking_lines(p_branch_id, p_service_ids) l
    having count(*) = cardinality(p_service_ids)
  ),
  opening as (
    select
      (p_business_date + h.opens_at) at time zone br.timezone as opens,
      (p_business_date + h.closes_at + case when h.closes_next_day then interval '1 day' else interval '0' end)
        at time zone br.timezone as closes
    from branch br
    join public.branch_hours h on h.branch_id = br.id
    where h.day_of_week = extract(dow from p_business_date)
      and not h.is_closed
  ),
  candidate as (
    select slot.start_at, slot.start_at + bl.length as end_at
    from branch br
    cross join booking_length bl
    cross join opening op
    cross join lateral generate_series(
      op.opens, op.closes - bl.length, make_interval(mins => br.slot_interval_minutes::integer)
    ) as slot (start_at)
    where slot.start_at >= now() + make_interval(mins => br.min_notice_minutes::integer)
      and not exists (
        select 1
        from public.branch_closures c
        where c.branch_id = br.id
          and c.starts_at < slot.start_at + bl.length
          and c.ends_at > slot.start_at
      )
  ),
  shift as (
    select
      st.id as staff_id,
      (p_business_date + sh.starts_at) at time zone br.timezone as starts,
      (p_business_date + sh.ends_at + case when sh.ends_next_day then interval '1 day' else interval '0' end)
        at time zone br.timezone as ends
    from branch br
    join public.staff_branches sb on sb.branch_id = br.id
    join public.staff st on st.id = sb.staff_id
    join public.staff_shifts sh on sh.staff_id = st.id and sh.branch_id = br.id
    where sh.day_of_week = extract(dow from p_business_date)
      and st.is_active
      and st.is_bookable
      and (p_staff_id is null or st.id = p_staff_id)
      and (
        select count(*)
        from public.staff_services ss
        where ss.staff_id = st.id
          and ss.service_id = any (p_service_ids)
      ) = cardinality(p_service_ids)
  )
  select c.start_at, c.end_at, sh.staff_id
  from candidate c
  join shift sh on sh.starts <= c.start_at and sh.ends >= c.end_at
  where not exists (
      select 1
      from public.staff_time_off t
      where t.staff_id = sh.staff_id
        and t.starts_at < c.end_at
        and t.ends_at > c.start_at
    )
    and not exists (
      select 1
      from public.bookings bk
      where bk.staff_id = sh.staff_id
        and bk.start_at is not null
        and bk.status in (
          'held', 'payment_submitted', 'needs_resubmission', 'review_expired_pending_resolution', 'confirmed',
          'checked_in', 'in_service', 'completed'
        )
        and (bk.status <> 'held' or bk.hold_expires_at > now())
        and tstzrange(bk.start_at, bk.end_at, '[)') && tstzrange(c.start_at, c.end_at, '[)')
    );
$$;

-- Moves unpaid holds past hold_expires_at to hold_expired, releasing their slots: one staff
-- member's before a booking is inserted, or every one when the job runs. Logs each with the
-- caller as actor, which is null for the job.
create function private.expire_holds(p_staff_id uuid default null)
returns integer
language sql
set search_path = ''
as $$
  with expired as (
    update public.bookings
    set status = 'hold_expired'
    where status = 'held'
      and hold_expires_at <= now()
      and (p_staff_id is null or staff_id = p_staff_id)
    returning id, organization_id
  ),
  logged as (
    select private.log_activity(e.organization_id, 'booking.hold_expired', 'booking', e.id, '{}'::jsonb)
    from expired e
  )
  select count(*)::integer from logged;
$$;

-- A branch's deposit reviewers: the owner, the managers assigned to it, and the staff assigned to
-- it who may review deposits.
create function private.deposit_reviewer_user_ids(p_branch_id uuid)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select m.user_id
  from public.branches b
  join public.organization_members m on m.organization_id = b.organization_id
  where b.id = p_branch_id
    and m.is_active
    and m.role = 'owner'
  union
  select m.user_id
  from public.member_branches mb
  join public.organization_members m on m.id = mb.member_id
  where mb.branch_id = p_branch_id
    and m.is_active
    and (m.role = 'manager' or (m.role = 'staff' and m.can_review_deposits));
$$;

-- The login linked to a staff profile, if any.
create function private.staff_login_user_id(p_staff_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select m.user_id
  from public.staff s
  join public.organization_members m on m.id = s.member_id
  where s.id = p_staff_id
    and m.is_active;
$$;

-- "₱1,300" or "₱1,300.50", for notification text.
create function private.format_peso(p_amount numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select '₱' || case
    when p_amount = trunc(p_amount) then to_char(p_amount, 'FM999,999,999,990')
    else to_char(p_amount, 'FM999,999,999,990.00')
  end;
$$;

-- "Sat, 10 Oct, 2:30 PM" at the branch, for notification text.
create function private.format_branch_time(p_at timestamptz, p_timezone text)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_at at time zone p_timezone, 'Dy, FMDD Mon, FMHH12:MI AM');
$$;

-- ---------------------------------------------------------------------------
-- Functions called through PostgREST
-- ---------------------------------------------------------------------------
-- Client-facing functions never check the organization's access status.

-- Open start times for a branch, business date, and services, with one staff member or anyone
-- who qualifies ("any available").
create function public.get_available_slots(
  p_branch_id uuid,
  p_business_date date,
  p_service_ids uuid[],
  p_staff_id uuid default null
)
returns table (start_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct slot.start_at
  from private.open_booking_slots(p_branch_id, p_business_date, p_service_ids, p_staff_id) as slot
  order by slot.start_at;
$$;

-- The first business date after p_after_date, within the booking window, with an open start
-- time; null when there is none.
create function public.get_next_available_date(
  p_branch_id uuid,
  p_after_date date,
  p_service_ids uuid[],
  p_staff_id uuid default null
)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_last_date date;
  v_date date := p_after_date + 1;
begin
  select private.business_date(now(), b.timezone, b.business_day_start) + o.booking_horizon_days
    into v_last_date
  from public.branches b
  join public.organizations o on o.id = b.organization_id
  where b.id = p_branch_id;

  while v_date <= v_last_date loop
    if exists (select 1 from private.open_booking_slots(p_branch_id, v_date, p_service_ids, p_staff_id)) then
      return v_date;
    end if;
    v_date := v_date + 1;
  end loop;
  return null;
end;
$$;

-- What an online booking of these services would cost, as create_online_booking calculates it.
-- No row when the branch is not taking bookings or a service is not offered.
create function public.get_booking_quote(p_branch_id uuid, p_service_ids uuid[])
returns table (
  service_total numeric(20,2),
  deposit_amount numeric(20,2),
  convenience_fee numeric(20,2),
  amount_due numeric(20,2)
)
language sql
stable
security definer
set search_path = ''
as $$
  select totals.service_total, totals.deposit_amount, fee.amount, totals.deposit_amount + fee.amount
  from (
    select sum(l.price) as service_total, sum(l.deposit) as deposit_amount
    from private.online_booking_lines(p_branch_id, p_service_ids) l
    having count(*) = cardinality(p_service_ids)
  ) as totals
  cross join lateral (select private.convenience_fee(totals.service_total) as amount) as fee;
$$;

-- Holds a slot for the caller, a client or a guest. Refuses a caller who already has two
-- unexpired holds. With no staff member named, picks the qualifying staff member with the fewest
-- booked minutes that business date. Calculates the totals, deposit, and fee; snapshots the
-- payment details, services, cancellation policy, and accepted privacy notice; upserts the
-- organization's client record; and notifies the deposit reviewers and the booked staff member.
create function public.create_online_booking(
  p_branch_id uuid,
  p_service_ids uuid[],
  p_start_at timestamptz,
  p_client_name text,
  p_mobile_number text,
  p_privacy_notice_version text,
  p_staff_id uuid default null,
  p_client_note text default null
)
returns table (booking_id uuid, booking_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_session();
  v_branch record;
  v_business_date date;
  v_service_count integer;
  v_service_total numeric(20,2);
  v_deposit numeric(20,2);
  v_fee numeric(20,2);
  v_length_minutes integer;
  v_service_names text;
  v_staff_id uuid;
  v_client_id uuid;
  v_booking_id uuid;
  v_booking_code text;
  v_attempt integer := 0;
begin
  -- One booking at a time per caller, so the hold limit cannot be raced.
  perform 1 from public.profiles where id = v_user_id for update;

  if (
    select count(*)
    from public.bookings b
    where b.booked_by = v_user_id
      and b.status = 'held'
      and b.hold_expires_at > now()
  ) >= 2 then
    raise exception using errcode = 'GBB01', message = 'hold_limit_reached';
  end if;

  select b.organization_id, b.name, b.timezone, b.business_day_start, b.payment_instructions, o.hold_minutes,
      o.cancellation_policy
    into v_branch
  from public.branches b
  join public.organizations o on o.id = b.organization_id
  where b.id = p_branch_id
    and b.is_published
    and b.is_active;

  if not found then
    raise exception using errcode = 'GBB02', message = 'branch_not_bookable';
  end if;

  select count(*), sum(l.price), sum(l.deposit), sum(l.duration_minutes) + max(l.buffer_minutes),
      string_agg(l.service_name, ', ' order by l.sort_order)
    into v_service_count, v_service_total, v_deposit, v_length_minutes, v_service_names
  from private.online_booking_lines(p_branch_id, p_service_ids) l;

  if v_service_count <> cardinality(p_service_ids) then
    raise exception using errcode = 'GBB03', message = 'slot_unavailable';
  end if;

  v_fee := private.convenience_fee(v_service_total);
  v_business_date := private.business_date(p_start_at, v_branch.timezone, v_branch.business_day_start);

  -- A booking committed by someone else while this one was being placed trips the overlap guard.
  -- With "any available" another qualifying staff member may still be free, so look again.
  loop
    v_attempt := v_attempt + 1;
    begin
      select slot.staff_id into v_staff_id
      from private.open_booking_slots(p_branch_id, v_business_date, p_service_ids, p_staff_id) as slot
      join public.staff st on st.id = slot.staff_id
      cross join lateral (
        select coalesce(sum(extract(epoch from bk.end_at - bk.start_at)), 0) as booked_seconds
        from public.bookings bk
        where bk.staff_id = slot.staff_id
          and bk.business_date = v_business_date
          and bk.start_at is not null
          and bk.status in (
            'held', 'payment_submitted', 'needs_resubmission', 'review_expired_pending_resolution', 'confirmed',
            'checked_in', 'in_service', 'completed'
          )
          and (bk.status <> 'held' or bk.hold_expires_at > now())
      ) as booked
      where slot.start_at = p_start_at
      order by booked.booked_seconds, st.display_name, st.id
      limit 1;

      if v_staff_id is null then
        raise exception using errcode = 'GBB03', message = 'slot_unavailable';
      end if;

      perform private.expire_holds(v_staff_id);

      insert into public.clients (organization_id, user_id, full_name, mobile_number)
      values (v_branch.organization_id, v_user_id, p_client_name, p_mobile_number)
      on conflict (organization_id, user_id) do update
        set full_name = excluded.full_name, mobile_number = excluded.mobile_number
      returning id into v_client_id;

      insert into public.bookings (
        organization_id, branch_id, client_id, booked_by, staff_id, source, status, start_at, end_at, business_date,
        service_total, deposit_amount, convenience_fee, amount_due, payment_instructions_snapshot,
        policy_acceptance_metadata, hold_expires_at, client_note
      )
      values (
        v_branch.organization_id, p_branch_id, v_client_id, v_user_id, v_staff_id, 'online', 'held', p_start_at,
        p_start_at + make_interval(mins => v_length_minutes), v_business_date, v_service_total, v_deposit, v_fee,
        v_deposit + v_fee, v_branch.payment_instructions,
        jsonb_build_object(
          'cancellation_policy', v_branch.cancellation_policy,
          'privacy_notice_version', p_privacy_notice_version,
          'accepted_at', now()
        ),
        now() + make_interval(mins => v_branch.hold_minutes::integer), p_client_note
      )
      returning id, bookings.booking_code into v_booking_id, v_booking_code;
      exit;
    exception
      when exclusion_violation then
        if p_staff_id is not null or v_attempt >= 3 then
          raise exception using errcode = 'GBB03', message = 'slot_unavailable';
        end if;
        v_staff_id := null;
    end;
  end loop;

  insert into public.booking_services (
    booking_id, organization_id, service_id, service_name, duration_minutes, buffer_minutes, price, sort_order
  )
  select v_booking_id, v_branch.organization_id, l.service_id, l.service_name, l.duration_minutes, l.buffer_minutes,
    l.price, l.sort_order
  from private.online_booking_lines(p_branch_id, p_service_ids) l;

  -- The account keeps the details given the first time, so the next booking is prefilled.
  update public.profiles
  set full_name = coalesce(full_name, p_client_name), mobile_number = coalesce(mobile_number, p_mobile_number)
  where id = v_user_id
    and (full_name is null or mobile_number is null);

  perform private.log_activity(
    v_branch.organization_id, 'booking.created', 'booking', v_booking_id,
    jsonb_build_object(
      'source', 'online',
      'service_count', v_service_count,
      'staff_chosen_by_client', p_staff_id is not null,
      'amount_due', v_deposit + v_fee
    )
  );

  begin
    insert into public.notifications (recipient_user_id, organization_id, type, title, body, entity_type, entity_id)
    select recipient.user_id, v_branch.organization_id, 'booking_created', 'New online booking',
      format(
        '%s booked %s at %s for %s.', p_client_name, v_service_names, v_branch.name,
        private.format_branch_time(p_start_at, v_branch.timezone)
      ),
      'booking', v_booking_id
    from (
      select private.deposit_reviewer_user_ids(p_branch_id) as user_id
      union
      select private.staff_login_user_id(v_staff_id)
    ) as recipient
    where recipient.user_id is not null
      and recipient.user_id <> v_user_id;
  exception
    when others then
      raise warning 'create_online_booking: notifications were not written (%)', sqlstate;
  end;

  return query select v_booking_id, v_booking_code;
end;
$$;

-- The client-facing view of one booking, for anyone holding its code, with or without a session.
-- Never returns the client's mobile number or the shop's notes; the client's name and note, and the
-- latest proof's reference number, amount, and method, only to the booking's creator and the
-- branch's members. Anyone holding the code sees the latest proof's status and the shop's review
-- note. A hold past its time reads as hold_expired even before the expire_holds job has run.
create function public.get_booking_by_code(p_booking_code text)
returns table (
  booking_id uuid,
  booking_code text,
  organization_id uuid,
  status public.booking_status,
  branch_name text,
  branch_slug text,
  branch_address text,
  branch_city text,
  branch_area text,
  branch_contact_number text,
  branch_timezone text,
  organization_name text,
  staff_display_name text,
  start_at timestamptz,
  services_end_at timestamptz,
  services jsonb,
  service_total numeric(20,2),
  deposit_amount numeric(20,2),
  convenience_fee numeric(20,2),
  amount_due numeric(20,2),
  payment_instructions jsonb,
  booked_at timestamptz,
  hold_expires_at timestamptz,
  review_expires_at timestamptz,
  policy_acceptance jsonb,
  cancelled_by text,
  latest_proof_status public.proof_status,
  latest_proof_review_note text,
  latest_proof_reference_number text,
  latest_proof_amount_paid numeric(20,2),
  latest_proof_method public.payment_method,
  client_name text,
  client_note text,
  viewer_is_creator boolean,
  viewer_is_member boolean,
  booked_by_guest boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.booking_code,
    b.organization_id,
    case when b.status = 'held' and b.hold_expires_at <= now() then 'hold_expired'::public.booking_status else b.status end,
    br.name,
    br.slug,
    br.address,
    br.city,
    br.area,
    br.contact_number,
    br.timezone,
    o.name,
    st.display_name,
    b.start_at,
    b.start_at + make_interval(mins => lines.duration_minutes),
    lines.services,
    b.service_total,
    b.deposit_amount,
    b.convenience_fee,
    b.amount_due,
    b.payment_instructions_snapshot,
    b.created_at,
    b.hold_expires_at,
    b.review_expires_at,
    b.policy_acceptance_metadata,
    b.cancellation_metadata ->> 'by',
    proof.status,
    proof.review_note,
    case when viewer.is_creator or viewer.is_member then proof.reference_number end,
    case when viewer.is_creator or viewer.is_member then proof.amount_paid end,
    case when viewer.is_creator or viewer.is_member then proof.method end,
    case when viewer.is_creator or viewer.is_member then c.full_name end,
    case when viewer.is_creator or viewer.is_member then b.client_note end,
    viewer.is_creator,
    viewer.is_member,
    creator.is_guest
  from public.bookings b
  join public.branches br on br.id = b.branch_id
  join public.organizations o on o.id = b.organization_id
  join public.clients c on c.id = b.client_id
  join public.profiles creator on creator.id = b.booked_by
  left join public.staff st on st.id = b.staff_id
  cross join lateral (
    select
      coalesce(sum(bs.duration_minutes), 0)::integer as duration_minutes,
      coalesce(
        jsonb_agg(
          jsonb_build_object('name', bs.service_name, 'duration_minutes', bs.duration_minutes, 'price', bs.price)
          order by bs.sort_order
        ),
        '[]'::jsonb
      ) as services
    from public.booking_services bs
    where bs.booking_id = b.id
  ) as lines
  left join lateral (
    select pp.status, pp.review_note, pp.reference_number, pp.amount_paid, pp.method
    from public.payment_proofs pp
    where pp.booking_id = b.id
    order by pp.created_at desc, pp.id desc
    limit 1
  ) as proof on true
  cross join lateral (
    select
      coalesce(b.booked_by = auth.uid(), false) as is_creator,
      b.branch_id in (select private.branch_ids_with_role('{owner,manager,staff}')) as is_member
  ) as viewer
  where b.booking_code = private.normalize_booking_code(p_booking_code);
$$;

-- Makes the caller the creator of a booking a guest made, so it can be paid, cancelled, or carried
-- into an account from this device; the previous device loses access. A booking made by a signed-in
-- account is managed by signing in instead.
create function public.claim_guest_booking(p_booking_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_session();
  v_booking_id uuid;
  v_organization_id uuid;
  v_creator_is_guest boolean;
begin
  select b.id, b.organization_id, p.is_guest
    into v_booking_id, v_organization_id, v_creator_is_guest
  from public.bookings b
  join public.profiles p on p.id = b.booked_by
  where b.booking_code = private.normalize_booking_code(p_booking_code)
  for update of b;

  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  if not v_creator_is_guest then
    raise exception using errcode = 'GBB05', message = 'booking_not_claimable';
  end if;

  update public.bookings
  set booked_by = v_user_id
  where id = v_booking_id;

  perform private.log_activity(v_organization_id, 'booking.claimed', 'booking', v_booking_id, '{}'::jsonb);

  return v_booking_id;
end;
$$;

-- Cancels a booking. Its creator cancels before the start time from held (while the hold lasts),
-- payment_submitted, needs_resubmission, review_expired_pending_resolution, or confirmed; a member
-- of the branch from those and waiting or checked_in. Records who, when, and why, and notifies the
-- other side.
create function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_session();
  v_booking public.bookings;
  v_branch record;
  v_cancelled_by text;
  v_client_name text;
  v_withdrawn_count integer;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  if v_booking.booked_by = v_user_id then
    v_cancelled_by := 'client';
    if v_booking.status not in (
        'held', 'payment_submitted', 'needs_resubmission', 'review_expired_pending_resolution', 'confirmed'
      )
      or (v_booking.status = 'held' and v_booking.hold_expires_at <= now())
      or v_booking.start_at <= now()
    then
      raise exception using errcode = 'GBB04', message = 'booking_not_cancellable';
    end if;
  elsif v_booking.branch_id in (select private.branch_ids_with_role('{owner,manager,staff}')) then
    v_cancelled_by := 'shop';
    if v_booking.status not in (
        'held', 'payment_submitted', 'needs_resubmission', 'review_expired_pending_resolution', 'confirmed',
        'waiting', 'checked_in'
      )
      or (v_booking.status = 'held' and v_booking.hold_expires_at <= now())
    then
      raise exception using errcode = 'GBB04', message = 'booking_not_cancellable';
    end if;
  else
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  update public.bookings
  set status = 'cancelled',
    cancellation_metadata = jsonb_build_object(
      'by', v_cancelled_by,
      'cancelled_by', v_user_id,
      'cancelled_at', now(),
      'reason', p_reason
    )
  where id = p_booking_id;

  update public.payment_proofs
  set status = 'withdrawn'
  where booking_id = p_booking_id
    and status = 'submitted';
  get diagnostics v_withdrawn_count = row_count;

  perform private.log_activity(
    v_booking.organization_id, 'booking.cancelled', 'booking', p_booking_id,
    jsonb_build_object('from_status', v_booking.status, 'by', v_cancelled_by, 'proof_withdrawn', v_withdrawn_count > 0)
  );

  select b.name, b.timezone into v_branch from public.branches b where b.id = v_booking.branch_id;

  begin
    if v_cancelled_by = 'client' then
      select c.full_name into v_client_name from public.clients c where c.id = v_booking.client_id;
      insert into public.notifications (recipient_user_id, organization_id, type, title, body, entity_type, entity_id)
      select recipient.user_id, v_booking.organization_id, 'booking_cancelled', 'Booking cancelled',
        format(
          '%s cancelled their booking at %s for %s.', v_client_name, v_branch.name,
          private.format_branch_time(v_booking.start_at, v_branch.timezone)
        ),
        'booking', p_booking_id
      from (
        select private.deposit_reviewer_user_ids(v_booking.branch_id) as user_id
        union
        select private.staff_login_user_id(v_booking.staff_id)
      ) as recipient
      where recipient.user_id is not null
        and recipient.user_id <> v_user_id;
    elsif v_booking.booked_by <> v_user_id then
      insert into public.notifications (recipient_user_id, organization_id, type, title, body, entity_type, entity_id)
      values (
        v_booking.booked_by, v_booking.organization_id, 'booking_cancelled', 'Your booking was cancelled',
        format(
          '%s cancelled your booking for %s.', v_branch.name,
          coalesce(private.format_branch_time(v_booking.start_at, v_branch.timezone), 'your visit')
        ),
        'booking', p_booking_id
      );
    end if;
  exception
    when others then
      raise warning 'cancel_booking: notifications were not written (%)', sqlstate;
  end;
end;
$$;

-- The client reports paying the amount due: on a held booking whose hold has not run out, or again
-- when the shop asked for resubmission. Refused once the hold has run out, even before the
-- expire_holds job has run, because the slot may already be someone else's. Starts the review time
-- and notifies the deposit reviewers. Proof screenshots live under the booking's folder.
create function public.submit_payment_proof(
  p_booking_id uuid,
  p_reference_number text,
  p_amount_paid numeric,
  p_method public.payment_method,
  p_proof_path text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_session();
  v_booking public.bookings;
  v_review_hours smallint;
  v_proof_id uuid;
  v_branch record;
  v_client_name text;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.booked_by <> v_user_id
    or (p_proof_path is not null and p_proof_path not like v_booking.organization_id || '/' || v_booking.id || '/%')
  then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  if v_booking.status = 'hold_expired' or (v_booking.status = 'held' and v_booking.hold_expires_at <= now()) then
    raise exception using errcode = 'GBP01', message = 'hold_ran_out';
  end if;

  if v_booking.status not in ('held', 'needs_resubmission') then
    raise exception using errcode = 'GBP02', message = 'payment_not_expected';
  end if;

  select o.review_hours into v_review_hours from public.organizations o where o.id = v_booking.organization_id;

  insert into public.payment_proofs (
    organization_id, branch_id, booking_id, submitted_by, reference_number, amount_paid, method, proof_path, note
  )
  values (
    v_booking.organization_id, v_booking.branch_id, p_booking_id, v_user_id, p_reference_number, p_amount_paid, p_method,
    p_proof_path, p_note
  )
  returning id into v_proof_id;

  update public.bookings
  set status = 'payment_submitted',
    review_expires_at = now() + make_interval(hours => v_review_hours::integer),
    review_reminder_sent_at = null
  where id = p_booking_id;

  perform private.log_activity(
    v_booking.organization_id, 'payment_proof.submitted', 'booking', p_booking_id,
    jsonb_build_object(
      'proof_id', v_proof_id,
      'method', p_method,
      'amount_paid', p_amount_paid,
      'amount_due', v_booking.amount_due,
      'resubmission', v_booking.status = 'needs_resubmission',
      'has_screenshot', p_proof_path is not null
    )
  );

  begin
    select b.name, b.timezone into v_branch from public.branches b where b.id = v_booking.branch_id;
    select c.full_name into v_client_name from public.clients c where c.id = v_booking.client_id;
    insert into public.notifications (recipient_user_id, organization_id, type, title, body, entity_type, entity_id)
    select recipient.user_id, v_booking.organization_id, 'payment_submitted', 'Payment reported',
      format(
        '%s reported paying %s for their booking at %s on %s.', v_client_name, private.format_peso(p_amount_paid),
        v_branch.name, private.format_branch_time(v_booking.start_at, v_branch.timezone)
      ),
      'booking', p_booking_id
    from private.deposit_reviewer_user_ids(v_booking.branch_id) as recipient (user_id)
    where recipient.user_id <> v_user_id;
  exception
    when others then
      raise warning 'submit_payment_proof: notifications were not written (%)', sqlstate;
  end;

  return v_proof_id;
end;
$$;

-- A deposit reviewer's decision on the booking's latest proof: accepted (the full amount due
-- arrived; the booking is confirmed and its fee entry recorded), rejected (the slot is released),
-- or resubmission_requested (the client gets a full review time to send a new proof). A booking
-- flagged for resolution can only be accepted or rejected. Notifies the booking's creator.
create function public.review_payment_proof(
  p_proof_id uuid,
  p_outcome public.proof_status,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
  v_booking_id uuid;
  v_booking public.bookings;
  v_proof public.payment_proofs;
  v_latest_proof_id uuid;
  v_review_hours smallint;
  v_branch record;
  v_title text;
  v_body text;
begin
  select pp.booking_id into v_booking_id from public.payment_proofs pp where pp.id = p_proof_id;

  select * into v_booking
  from public.bookings
  where id = v_booking_id
  for update;

  if not found or v_booking.branch_id not in (select private.deposit_review_branch_ids()) then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  select * into v_proof from public.payment_proofs where id = p_proof_id for update;
  select pp.id into v_latest_proof_id
  from public.payment_proofs pp
  where pp.booking_id = v_booking_id
  order by pp.created_at desc, pp.id desc
  limit 1;

  if v_latest_proof_id <> p_proof_id
    or not (
      (v_booking.status = 'payment_submitted' and v_proof.status = 'submitted')
      or (
        v_booking.status = 'review_expired_pending_resolution'
        and v_proof.status in ('submitted', 'resubmission_requested')
        and p_outcome in ('accepted', 'rejected')
      )
    )
  then
    raise exception using errcode = 'GBP03', message = 'proof_not_reviewable';
  end if;

  update public.payment_proofs
  set status = p_outcome, reviewed_by = v_user_id, reviewed_at = now(), review_note = p_review_note
  where id = p_proof_id;

  if p_outcome = 'accepted' then
    update public.bookings set status = 'confirmed' where id = v_booking_id;
    insert into public.fee_entries (organization_id, branch_id, kind, booking_id, amount, accrued_at, created_by)
    values (v_booking.organization_id, v_booking.branch_id, 'booking_fee', v_booking_id, v_booking.convenience_fee, now(), v_user_id);
  elsif p_outcome = 'rejected' then
    update public.bookings set status = 'payment_rejected' where id = v_booking_id;
  elsif p_outcome = 'resubmission_requested' then
    select o.review_hours into v_review_hours from public.organizations o where o.id = v_booking.organization_id;
    update public.bookings
    set status = 'needs_resubmission',
      review_expires_at = now() + make_interval(hours => v_review_hours::integer),
      review_reminder_sent_at = null
    where id = v_booking_id;
  else
    raise exception using errcode = 'GBP03', message = 'proof_not_reviewable';
  end if;

  perform private.log_activity(
    v_booking.organization_id, 'payment_proof.reviewed', 'booking', v_booking_id,
    jsonb_build_object(
      'proof_id', p_proof_id,
      'outcome', p_outcome,
      'amount_paid', v_proof.amount_paid,
      'amount_due', v_booking.amount_due,
      'from_status', v_booking.status
    )
  );

  begin
    select b.name, b.timezone into v_branch from public.branches b where b.id = v_booking.branch_id;
    if p_outcome = 'accepted' then
      v_title := 'Booking confirmed';
      v_body := format('%s accepted your payment. See you on %s.', v_branch.name,
        private.format_branch_time(v_booking.start_at, v_branch.timezone));
    elsif p_outcome = 'rejected' then
      v_title := 'Payment not accepted';
      v_body := format('%s could not accept your payment for %s.', v_branch.name,
        private.format_branch_time(v_booking.start_at, v_branch.timezone));
    else
      v_title := 'Please send your payment details again';
      v_body := format('%s asked you to send your payment details again for %s.', v_branch.name,
        private.format_branch_time(v_booking.start_at, v_branch.timezone));
    end if;
    if p_review_note is not null then
      v_body := v_body || ' ' || left(p_review_note, 300);
    end if;
    insert into public.notifications (recipient_user_id, organization_id, type, title, body, entity_type, entity_id)
    values (v_booking.booked_by, v_booking.organization_id, 'payment_' || p_outcome::text, v_title, v_body, 'booking', v_booking_id);
  exception
    when others then
      raise warning 'review_payment_proof: notifications were not written (%)', sqlstate;
  end;
end;
$$;

-- A refund settled outside GroomBox, recorded by a deposit reviewer of the branch: on a cancelled,
-- rejected, or no-show booking with a deposit, or a completed one whose deposit was larger than
-- the bill. Recording again replaces the earlier outcome.
create function public.record_refund_outcome(
  p_booking_id uuid,
  p_refunded boolean,
  p_amount numeric,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
  v_booking public.bookings;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.branch_id not in (select private.deposit_review_branch_ids()) then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  if v_booking.status not in ('cancelled', 'payment_rejected', 'no_show', 'completed') or v_booking.deposit_amount = 0 then
    raise exception using errcode = 'GBP04', message = 'refund_not_applicable';
  end if;

  update public.bookings
  set refund_metadata = jsonb_build_object(
    'outcome', case when p_refunded then 'refunded' else 'not_refunded' end,
    'amount', p_amount,
    'note', p_note,
    'recorded_by', v_user_id,
    'recorded_at', now()
  )
  where id = p_booking_id;

  perform private.log_activity(
    v_booking.organization_id, 'booking.refund_recorded', 'booking', p_booking_id,
    jsonb_build_object('refunded', p_refunded, 'amount', p_amount, 'status', v_booking.status)
  );
end;
$$;

-- Bookings whose review time passed with a payment reported (or a resubmission still awaited) are
-- flagged for resolution and keep their slot: the client may already have paid. Notifies the
-- client and the deposit reviewers. Run by pg_cron with no actor.
create function private.expire_reviews()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_expired_count integer;
begin
  create temporary table expired_review on commit drop as
  with expired as (
    update public.bookings
    set status = 'review_expired_pending_resolution'
    where status in ('payment_submitted', 'needs_resubmission')
      and review_expires_at <= now()
    returning id, organization_id, branch_id, booked_by, start_at
  )
  select * from expired;

  select count(*) into v_expired_count from expired_review;

  perform private.log_activity(e.organization_id, 'booking.review_expired', 'booking', e.id, '{}'::jsonb)
  from expired_review e;

  begin
    insert into public.notifications (recipient_user_id, organization_id, type, title, body, entity_type, entity_id)
    select e.booked_by, e.organization_id, 'review_expired', 'Your slot is still held',
      format('%s has not reviewed your payment yet. Your slot is still held.', b.name), 'booking', e.id
    from expired_review e
    join public.branches b on b.id = e.branch_id
    union all
    select reviewer.user_id, e.organization_id, 'review_expired', 'Payment review time passed',
      format('A reported payment for %s at %s needs a decision.', private.format_branch_time(e.start_at, b.timezone), b.name),
      'booking', e.id
    from expired_review e
    join public.branches b on b.id = e.branch_id
    cross join lateral private.deposit_reviewer_user_ids(e.branch_id) as reviewer (user_id);
  exception
    when others then
      raise warning 'expire_reviews: notifications were not written (%)', sqlstate;
  end;

  drop table expired_review;
  return v_expired_count;
end;
$$;

-- Reminds the deposit reviewers once when a reported payment has an hour or less of review time
-- left. Run by pg_cron with no actor.
create function private.remind_pending_reviews()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_reminded_count integer;
begin
  create temporary table review_reminder on commit drop as
  with reminded as (
    update public.bookings
    set review_reminder_sent_at = now()
    where status = 'payment_submitted'
      and review_reminder_sent_at is null
      and review_expires_at > now()
      and review_expires_at <= now() + interval '1 hour'
    returning id, organization_id, branch_id, start_at
  )
  select * from reminded;

  select count(*) into v_reminded_count from review_reminder;

  perform private.log_activity(r.organization_id, 'booking.review_reminder_sent', 'booking', r.id, '{}'::jsonb)
  from review_reminder r;

  begin
    insert into public.notifications (recipient_user_id, organization_id, type, title, body, entity_type, entity_id)
    select reviewer.user_id, r.organization_id, 'review_reminder', 'A payment review is due soon',
      format('A reported payment for %s at %s has an hour or less of review time left.',
        private.format_branch_time(r.start_at, b.timezone), b.name),
      'booking', r.id
    from review_reminder r
    join public.branches b on b.id = r.branch_id
    cross join lateral private.deposit_reviewer_user_ids(r.branch_id) as reviewer (user_id);
  exception
    when others then
      raise warning 'remind_pending_reviews: notifications were not written (%)', sqlstate;
  end;

  drop table review_reminder;
  return v_reminded_count;
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

-- Booking privileges

revoke all on table
  public.clients, public.bookings, public.booking_services,
  public.public_branches, public.public_branch_services, public.public_branch_staff
from anon, authenticated;

grant select on public.clients to authenticated;
grant insert (organization_id, full_name, mobile_number, notes) on public.clients to authenticated;
grant update (full_name, mobile_number, notes) on public.clients to authenticated;
grant select on public.bookings to authenticated;
grant select on public.booking_services to authenticated;
grant select on public.public_branches, public.public_branch_services, public.public_branch_staff
  to anon, authenticated;

revoke all on function
  private.business_date(timestamptz, text, time),
  private.normalize_booking_code(text),
  private.set_booking_code(),
  private.require_session(),
  private.managed_organization_ids(),
  private.online_booking_lines(uuid, uuid[]),
  private.convenience_fee(numeric),
  private.open_booking_slots(uuid, date, uuid[], uuid),
  private.expire_holds(uuid),
  private.deposit_reviewer_user_ids(uuid),
  private.staff_login_user_id(uuid),
  private.format_branch_time(timestamptz, text)
from public, anon, authenticated;
grant execute on function private.business_date(timestamptz, text, time) to anon, authenticated;
grant execute on function private.managed_organization_ids() to authenticated;

revoke all on function
  public.get_available_slots(uuid, date, uuid[], uuid),
  public.get_next_available_date(uuid, date, uuid[], uuid),
  public.get_booking_quote(uuid, uuid[]),
  public.create_online_booking(uuid, uuid[], timestamptz, text, text, text, uuid, text),
  public.get_booking_by_code(text),
  public.claim_guest_booking(text),
  public.cancel_booking(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.get_available_slots(uuid, date, uuid[], uuid),
  public.get_next_available_date(uuid, date, uuid[], uuid),
  public.get_booking_quote(uuid, uuid[]),
  public.get_booking_by_code(text)
to anon, authenticated;
grant execute on function
  public.create_online_booking(uuid, uuid[], timestamptz, text, text, text, uuid, text),
  public.claim_guest_booking(text),
  public.cancel_booking(uuid, text)
to authenticated;

-- Deposit privileges

revoke all on table public.payment_proofs, public.fee_entries from anon, authenticated;
grant select on public.payment_proofs, public.fee_entries to authenticated;

revoke all on function
  private.deposit_review_branch_ids(),
  private.billing_organization_ids(),
  private.format_peso(numeric),
  private.expire_reviews(),
  private.remind_pending_reviews()
from public, anon, authenticated;
grant execute on function private.deposit_review_branch_ids(), private.billing_organization_ids() to authenticated;

revoke all on function
  public.submit_payment_proof(uuid, text, numeric, public.payment_method, text, text),
  public.review_payment_proof(uuid, public.proof_status, text),
  public.record_refund_outcome(uuid, boolean, numeric, text)
from public, anon, authenticated;
grant execute on function
  public.submit_payment_proof(uuid, text, numeric, public.payment_method, text, text),
  public.review_payment_proof(uuid, public.proof_status, text),
  public.record_refund_outcome(uuid, boolean, numeric, text)
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

-- payment-proofs {organization_id}/{booking_id}/{file}: private, read through short-lived signed
-- URLs by the uploader and the branch's deposit reviewers.
-- The booking's creator uploads into the booking's folder.
create policy payment_proofs_insert_creator on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] || '/' || (storage.foldername(name))[2] in (
      select b.organization_id::text || '/' || b.id::text
      from public.bookings b
      where b.booked_by = (select auth.uid())
    )
  );

create policy payment_proofs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      owner_id = (select auth.uid())::text
      or (storage.foldername(name))[1] || '/' || (storage.foldername(name))[2] in (
        select b.organization_id::text || '/' || b.id::text
        from public.bookings b
        where b.branch_id in (select private.deposit_review_branch_ids())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime and bootstrap records
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.payment_proofs, public.bookings;

insert into public.platform_settings (id) values (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('shop-media', 'shop-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-qr', 'payment-qr', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Scheduled jobs
select cron.schedule('expire_holds', '*/5 * * * *', 'select private.expire_holds()');
select cron.schedule('expire_reviews', '*/5 * * * *', 'select private.expire_reviews()');
select cron.schedule('remind_pending_reviews', '*/5 * * * *', 'select private.remind_pending_reviews()');

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
  ('20261106120000', 'shop_setup'),
  ('20261107120000', 'booking_engine'),
  ('20261108120000', 'deposits');
