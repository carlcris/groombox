-- Phase 3: the booking engine and public booking. Client records, bookings with their services,
-- the overlap guard, the booking code, the shared business date, availability, the booking quote,
-- online booking with "any available", the booking link functions, cancelling, the public views,
-- and the expire_holds job.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- The public views compute the branch's current business date with private.business_date, and a
-- view's functions run with the caller's rights, so visitors without a session need the schema.
grant usage on schema private to anon;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.booking_source as enum ('online', 'staff', 'walk_in');
create type public.booking_status as enum (
  'held', 'payment_submitted', 'needs_resubmission', 'review_expired_pending_resolution', 'confirmed', 'waiting',
  'checked_in', 'in_service', 'completed', 'cancelled', 'no_show', 'hold_expired', 'payment_rejected'
);

-- ---------------------------------------------------------------------------
-- Shared booking helpers
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger set_booking_code before insert on public.bookings
  for each row execute function private.set_booking_code();
create trigger set_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.bookings
  for each row execute function private.set_updated_at();

create trigger log_row_change after insert or update or delete on public.clients
  for each row execute function private.log_row_change('id', 'organization_id', 'full_name', 'mobile_number', 'notes');

-- ---------------------------------------------------------------------------
-- Access helper
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Row-level security
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
-- Never returns the client's mobile number or the shop's notes; the client's name and note only to
-- the booking's creator and the branch's members. A hold past its time reads as hold_expired even
-- before the expire_holds job has run.
create function public.get_booking_by_code(p_booking_code text)
returns table (
  booking_id uuid,
  booking_code text,
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

  perform private.log_activity(
    v_booking.organization_id, 'booking.cancelled', 'booking', p_booking_id,
    jsonb_build_object('from_status', v_booking.status, 'by', v_cancelled_by)
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

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------

select cron.schedule('expire_holds', '*/5 * * * *', 'select private.expire_holds()');
