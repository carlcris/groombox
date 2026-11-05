-- Phase 5: floor and calendar. Walk-ins with queue numbers, staff-entered appointments,
-- rescheduling, the visit status moves (check in, start, no-show), client search and merge, client
-- notes kept from staff, and each branch's current business date for the floor.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Clients: search indexes and notes kept from staff
-- ---------------------------------------------------------------------------

-- search_clients matches part of a name, or the digits of a mobile number however it was typed.
create index clients_full_name_trgm_idx on public.clients using gin (full_name extensions.gin_trgm_ops);
create index clients_mobile_digits_trgm_idx on public.clients
  using gin (regexp_replace(coalesce(mobile_number, ''), '\D', '', 'g') extensions.gin_trgm_ops);

-- Staff read the clients on their branches' bookings, but never the shop's notes. Row-level
-- security cannot hide one column, so authenticated callers may read every column except notes;
-- owners and managers read notes through get_client_notes.
revoke select on public.clients from authenticated;
grant select (id, organization_id, user_id, full_name, mobile_number, created_at, updated_at) on public.clients to authenticated;

-- ---------------------------------------------------------------------------
-- The floor's "today"
-- ---------------------------------------------------------------------------

create or replace view public.my_branches with (security_invoker = true) as
  select
    b.id,
    b.organization_id,
    b.name,
    b.slug,
    b.timezone,
    b.business_day_start,
    private.business_date(now(), b.timezone, b.business_day_start) as current_business_date
  from public.branches b
  where b.is_active
    and b.id in (select private.branch_ids_with_role('{owner,manager,staff}'));

-- ---------------------------------------------------------------------------
-- Shared booking internals
-- ---------------------------------------------------------------------------

-- The services a branch offers, active, in the order given, at the branch's price. Callers compare
-- the count with the request.
create function private.branch_service_lines(p_branch_id uuid, p_service_ids uuid[])
returns table (
  service_id uuid,
  service_name text,
  duration_minutes smallint,
  buffer_minutes smallint,
  price numeric(20,2),
  sort_order integer
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.name, s.duration_minutes, s.buffer_minutes, coalesce(bs.price_override, s.price), requested.ordinality::integer
  from unnest(p_service_ids) with ordinality as requested (service_id, ordinality)
  join public.branch_services bs on bs.branch_id = p_branch_id and bs.service_id = requested.service_id
  join public.services s on s.id = bs.service_id
  where s.is_active;
$$;

-- Online bookings take the same lines at a published branch, with each service's deposit: its own
-- rule, else the organization's, capped at its price.
create or replace function private.online_booking_lines(p_branch_id uuid, p_service_ids uuid[])
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
    l.service_id,
    l.service_name,
    l.duration_minutes,
    l.buffer_minutes,
    l.price,
    case
      when s.deposit_type = 'fixed' then least(s.deposit_fixed_amount, l.price)
      when s.deposit_type = 'percent' then least(round(l.price * s.deposit_percent / 100, 2), l.price)
      when o.deposit_type = 'fixed' then least(o.deposit_fixed_amount, l.price)
      else least(round(l.price * o.deposit_percent / 100, 2), l.price)
    end,
    l.sort_order
  from private.branch_service_lines(p_branch_id, p_service_ids) l
  join public.services s on s.id = l.service_id
  join public.branches b on b.id = p_branch_id
  join public.organizations o on o.id = b.organization_id
  where b.is_published
    and b.is_active;
$$;

-- One writer at a time for a staff member's schedule. Simultaneous inserts that overlap can
-- otherwise deadlock on the overlap index before either commits. Booking functions take this lock
-- just before writing a staff member's time, one staff member at a time (a lost "any available"
-- attempt releases it with its savepoint), so no two writers wait on each other in a cycle. The
-- overlap constraint stays the final guard.
create function private.lock_staff_schedule(p_staff_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('staff_schedule:' || p_staff_id::text, 0));
$$;

-- The client for a visit the shop enters: an existing record of the organization (the bookings
-- foreign key keeps it in the organization), or a new one with the name and number given.
create function private.resolve_visit_client(
  p_organization_id uuid,
  p_client_id uuid,
  p_client_name text,
  p_mobile_number text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_client_id uuid := p_client_id;
begin
  if v_client_id is null then
    insert into public.clients (organization_id, full_name, mobile_number)
    values (p_organization_id, p_client_name, p_mobile_number)
    returning id into v_client_id;
  end if;
  return v_client_id;
end;
$$;

create function private.insert_booking_services(
  p_booking_id uuid,
  p_organization_id uuid,
  p_branch_id uuid,
  p_service_ids uuid[]
)
returns void
language sql
set search_path = ''
as $$
  insert into public.booking_services (
    booking_id, organization_id, service_id, service_name, duration_minutes, buffer_minutes, price, sort_order
  )
  select p_booking_id, p_organization_id, l.service_id, l.service_name, l.duration_minutes, l.buffer_minutes, l.price,
    l.sort_order
  from private.branch_service_lines(p_branch_id, p_service_ids) l;
$$;

-- A member's branch, checked: the caller holds any role there and the organization is accessible.
create function private.member_branch(p_branch_id uuid)
returns table (organization_id uuid, timezone text, business_day_start time)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query
  select b.organization_id, b.timezone, b.business_day_start
  from public.branches b
  where b.id = p_branch_id
    and b.id in (select private.branch_ids_with_role('{owner,manager,staff}'));
  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Functions called through PostgREST
-- ---------------------------------------------------------------------------
-- Every function here is called by members and checks the caller's branch through the same
-- membership lookup as the policies, so a restricted organization's members are refused.

-- A bounded search of the organization's clients by part of the name or of the mobile number, for
-- any member of the branch. Returns the id, name, and mobile number only; never notes.
create function public.search_clients(
  p_branch_id uuid,
  p_query text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (id uuid, full_name text, mobile_number text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_pattern text := '%' || regexp_replace(trim(p_query), '([%_\\])', '\\\1', 'g') || '%';
  v_digits text := regexp_replace(p_query, '\D', '', 'g');
begin
  perform private.require_signed_in_account();
  select branch.organization_id into v_organization_id from private.member_branch(p_branch_id) as branch;

  return query
  select c.id, c.full_name, c.mobile_number
  from public.clients c
  where c.organization_id = v_organization_id
    and (
      c.full_name ilike v_pattern
      or (v_digits <> '' and regexp_replace(coalesce(c.mobile_number, ''), '\D', '', 'g') like '%' || v_digits || '%')
    )
  order by c.full_name, c.id
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
end;
$$;

-- The shop's private notes on a client, for the owner and managers.
create function public.get_client_notes(p_client_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_notes text;
begin
  perform private.require_signed_in_account();
  select c.notes into v_notes
  from public.clients c
  where c.id = p_client_id
    and c.organization_id in (select private.managed_organization_ids());
  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;
  return v_notes;
end;
$$;

-- A walk-in joins the branch's queue as waiting, with the next queue number for the business date
-- and an optional staff preference. No time range, deposit, or fee until it starts.
create function public.add_walk_in(
  p_branch_id uuid,
  p_service_ids uuid[],
  p_client_id uuid default null,
  p_client_name text default null,
  p_mobile_number text default null,
  p_staff_id uuid default null,
  p_client_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
  v_branch record;
  v_business_date date;
  v_service_count integer;
  v_service_total numeric(20,2);
  v_queue_number smallint;
  v_client_id uuid;
  v_booking_id uuid;
begin
  select branch.organization_id, branch.timezone, branch.business_day_start into v_branch
  from private.member_branch(p_branch_id) as branch;

  -- Queue numbers are handed out one at a time per branch.
  perform 1 from public.branches where id = p_branch_id for update;

  select count(*), sum(l.price) into v_service_count, v_service_total
  from private.branch_service_lines(p_branch_id, p_service_ids) l;
  if v_service_count <> cardinality(p_service_ids) then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  v_business_date := private.business_date(now(), v_branch.timezone, v_branch.business_day_start);
  select coalesce(max(b.queue_number), 0) + 1 into v_queue_number
  from public.bookings b
  where b.branch_id = p_branch_id
    and b.business_date = v_business_date
    and b.source = 'walk_in';

  v_client_id := private.resolve_visit_client(v_branch.organization_id, p_client_id, p_client_name, p_mobile_number);

  insert into public.bookings (
    organization_id, branch_id, client_id, booked_by, staff_id, source, status, business_date, service_total,
    queue_number, client_note
  )
  values (
    v_branch.organization_id, p_branch_id, v_client_id, v_user_id, p_staff_id, 'walk_in', 'waiting', v_business_date,
    v_service_total, v_queue_number, p_client_note
  )
  returning id into v_booking_id;

  perform private.insert_booking_services(v_booking_id, v_branch.organization_id, p_branch_id, p_service_ids);

  perform private.log_activity(
    v_branch.organization_id, 'booking.walk_in_added', 'booking', v_booking_id,
    jsonb_build_object(
      'queue_number', v_queue_number,
      'service_count', v_service_count,
      'staff_preferred', p_staff_id is not null,
      'new_client', p_client_id is null
    )
  );

  return v_booking_id;
end;
$$;

-- An appointment the shop enters for a client: confirmed straight away, with no deposit and no
-- fee. The overlap guard is the only time rule; the shop may book outside online availability.
create function public.create_staff_booking(
  p_branch_id uuid,
  p_service_ids uuid[],
  p_start_at timestamptz,
  p_staff_id uuid,
  p_client_id uuid default null,
  p_client_name text default null,
  p_mobile_number text default null,
  p_client_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
  v_branch record;
  v_service_count integer;
  v_service_total numeric(20,2);
  v_length_minutes integer;
  v_client_id uuid;
  v_booking_id uuid;
begin
  select branch.organization_id, branch.timezone, branch.business_day_start into v_branch
  from private.member_branch(p_branch_id) as branch;

  select count(*), sum(l.price), sum(l.duration_minutes) + max(l.buffer_minutes)
    into v_service_count, v_service_total, v_length_minutes
  from private.branch_service_lines(p_branch_id, p_service_ids) l;
  if v_service_count <> cardinality(p_service_ids) then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  perform private.lock_staff_schedule(p_staff_id);
  perform private.expire_holds(p_staff_id);
  v_client_id := private.resolve_visit_client(v_branch.organization_id, p_client_id, p_client_name, p_mobile_number);

  begin
    insert into public.bookings (
      organization_id, branch_id, client_id, booked_by, staff_id, source, status, start_at, end_at, business_date,
      service_total, client_note
    )
    values (
      v_branch.organization_id, p_branch_id, v_client_id, v_user_id, p_staff_id, 'staff', 'confirmed', p_start_at,
      p_start_at + make_interval(mins => v_length_minutes),
      private.business_date(p_start_at, v_branch.timezone, v_branch.business_day_start), v_service_total, p_client_note
    )
    returning id into v_booking_id;
  exception
    when exclusion_violation then
      raise exception using errcode = 'GBF01', message = 'staff_busy';
  end;

  perform private.insert_booking_services(v_booking_id, v_branch.organization_id, p_branch_id, p_service_ids);

  perform private.log_activity(
    v_branch.organization_id, 'booking.staff_created', 'booking', v_booking_id,
    jsonb_build_object('service_count', v_service_count, 'new_client', p_client_id is null)
  );

  return v_booking_id;
end;
$$;

-- Moves an upcoming booking to a new time or staff member, keeping its length (services and
-- buffer), subject to the overlap guard. Tells an online booking's client.
create function public.reschedule_booking(p_booking_id uuid, p_start_at timestamptz, p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
  v_booking public.bookings;
  v_branch record;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;
  select branch.organization_id, branch.timezone, branch.business_day_start into v_branch
  from private.member_branch(v_booking.branch_id) as branch;

  if v_booking.status not in ('confirmed', 'payment_submitted', 'needs_resubmission', 'review_expired_pending_resolution') then
    raise exception using errcode = 'GBF02', message = 'visit_status_changed';
  end if;

  perform private.lock_staff_schedule(p_staff_id);
  perform private.expire_holds(p_staff_id);

  begin
    update public.bookings
    set start_at = p_start_at,
      end_at = p_start_at + (v_booking.end_at - v_booking.start_at),
      staff_id = p_staff_id,
      business_date = private.business_date(p_start_at, v_branch.timezone, v_branch.business_day_start)
    where id = p_booking_id;
  exception
    when exclusion_violation then
      raise exception using errcode = 'GBF01', message = 'staff_busy';
  end;

  perform private.log_activity(
    v_booking.organization_id, 'booking.rescheduled', 'booking', p_booking_id,
    jsonb_build_object('staff_changed', p_staff_id is distinct from v_booking.staff_id, 'source', v_booking.source)
  );

  if v_booking.source = 'online' and v_booking.booked_by <> v_user_id then
    begin
      insert into public.notifications (recipient_user_id, organization_id, type, title, body, entity_type, entity_id)
      select v_booking.booked_by, v_booking.organization_id, 'booking_rescheduled', 'Your booking was moved',
        format('%s moved your booking to %s.', b.name, private.format_branch_time(p_start_at, b.timezone)),
        'booking', p_booking_id
      from public.branches b
      where b.id = v_booking.branch_id;
    exception
      when others then
        raise warning 'reschedule_booking: notifications were not written (%)', sqlstate;
    end;
  end if;
end;
$$;

-- The client of a confirmed appointment arrived.
create function public.check_in_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  perform private.require_signed_in_account();
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;
  perform private.member_branch(v_booking.branch_id);

  if v_booking.status <> 'confirmed' then
    raise exception using errcode = 'GBF02', message = 'visit_status_changed';
  end if;

  update public.bookings set status = 'checked_in', checked_in_at = now() where id = p_booking_id;
  perform private.log_activity(v_booking.organization_id, 'booking.checked_in', 'booking', p_booking_id, '{}'::jsonb);
end;
$$;

-- Service begins. An arrived appointment keeps its booked range. A waiting walk-in takes the staff
-- member chosen (or its preference) and a range from now for its services and buffer, which the
-- overlap guard checks against that staff member's bookings.
create function public.start_service(p_booking_id uuid, p_staff_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_staff_id uuid;
  v_length_minutes integer;
begin
  perform private.require_signed_in_account();
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;
  perform private.member_branch(v_booking.branch_id);

  if v_booking.status = 'waiting' then
    v_staff_id := coalesce(p_staff_id, v_booking.staff_id);
    select sum(bs.duration_minutes) + max(bs.buffer_minutes) into v_length_minutes
    from public.booking_services bs
    where bs.booking_id = p_booking_id;

    perform private.lock_staff_schedule(v_staff_id);
    perform private.expire_holds(v_staff_id);
    begin
      update public.bookings
      set status = 'in_service',
        staff_id = v_staff_id,
        start_at = now(),
        end_at = now() + make_interval(mins => v_length_minutes),
        started_at = now()
      where id = p_booking_id;
    exception
      when exclusion_violation then
        raise exception using errcode = 'GBF01', message = 'staff_busy';
    end;
  elsif v_booking.status = 'checked_in' then
    update public.bookings set status = 'in_service', started_at = now() where id = p_booking_id;
  else
    raise exception using errcode = 'GBF02', message = 'visit_status_changed';
  end if;

  perform private.log_activity(
    v_booking.organization_id, 'booking.service_started', 'booking', p_booking_id,
    jsonb_build_object('from_status', v_booking.status, 'source', v_booking.source)
  );
end;
$$;

-- The client of a confirmed appointment did not come. The deposit and its fee stay as they are.
create function public.mark_no_show(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  perform private.require_signed_in_account();
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;
  perform private.member_branch(v_booking.branch_id);

  if v_booking.status <> 'confirmed' then
    raise exception using errcode = 'GBF02', message = 'visit_status_changed';
  end if;

  update public.bookings set status = 'no_show' where id = p_booking_id;
  perform private.log_activity(v_booking.organization_id, 'booking.no_show', 'booking', p_booking_id, '{}'::jsonb);
end;
$$;

-- Folds a duplicate client record into the one kept: its bookings move over, its notes are added
-- to the kept notes, and its account link and mobile number fill the kept record's gaps. Two
-- records linked to different accounts cannot be merged. For the owner and managers.
create function public.merge_clients(p_keep_client_id uuid, p_duplicate_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.clients;
  v_duplicate public.clients;
  v_moved_count integer;
begin
  perform private.require_signed_in_account();

  -- Locked in id order, so two merges of the same pair cannot deadlock.
  perform 1 from public.clients where id in (p_keep_client_id, p_duplicate_client_id) order by id for update;
  select * into v_keep from public.clients where id = p_keep_client_id;
  select * into v_duplicate from public.clients where id = p_duplicate_client_id;

  if v_keep.id is null or v_duplicate.id is null
    or v_keep.organization_id <> v_duplicate.organization_id
    or v_keep.organization_id not in (select private.managed_organization_ids())
  then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  if v_keep.user_id is not null and v_duplicate.user_id is not null and v_keep.user_id <> v_duplicate.user_id then
    raise exception using errcode = 'GBC01', message = 'clients_linked_to_different_accounts';
  end if;

  update public.bookings set client_id = p_keep_client_id where client_id = p_duplicate_client_id;
  get diagnostics v_moved_count = row_count;

  delete from public.clients where id = p_duplicate_client_id;

  update public.clients
  set user_id = coalesce(v_keep.user_id, v_duplicate.user_id),
    mobile_number = coalesce(v_keep.mobile_number, v_duplicate.mobile_number),
    notes = nullif(concat_ws(E'\n\n', nullif(trim(v_keep.notes), ''), nullif(trim(v_duplicate.notes), '')), '')
  where id = p_keep_client_id;

  perform private.log_activity(
    v_keep.organization_id, 'client.merged', 'client', p_keep_client_id,
    jsonb_build_object('duplicate_client_id', p_duplicate_client_id, 'moved_booking_count', v_moved_count)
  );
end;
$$;

-- Phase 3's create_online_booking, now taking the staff schedule lock before it writes: the
-- concurrency test showed simultaneous "any available" bookings could deadlock on the overlap index.
create or replace function public.create_online_booking(
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

      perform private.lock_staff_schedule(v_staff_id);
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

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function
  private.lock_staff_schedule(uuid),
  private.branch_service_lines(uuid, uuid[]),
  private.resolve_visit_client(uuid, uuid, text, text),
  private.insert_booking_services(uuid, uuid, uuid, uuid[]),
  private.member_branch(uuid)
from public, anon, authenticated;

revoke all on function
  public.search_clients(uuid, text, integer, integer),
  public.get_client_notes(uuid),
  public.add_walk_in(uuid, uuid[], uuid, text, text, uuid, text),
  public.create_staff_booking(uuid, uuid[], timestamptz, uuid, uuid, text, text, text),
  public.reschedule_booking(uuid, timestamptz, uuid),
  public.check_in_booking(uuid),
  public.start_service(uuid, uuid),
  public.mark_no_show(uuid),
  public.merge_clients(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.search_clients(uuid, text, integer, integer),
  public.get_client_notes(uuid),
  public.add_walk_in(uuid, uuid[], uuid, text, text, uuid, text),
  public.create_staff_booking(uuid, uuid[], timestamptz, uuid, uuid, text, text, text),
  public.reschedule_booking(uuid, timestamptz, uuid),
  public.check_in_booking(uuid),
  public.start_service(uuid, uuid),
  public.mark_no_show(uuid),
  public.merge_clients(uuid, uuid)
to authenticated;
