-- Phase 4: deposits. Payment proofs and their review, fee entries on acceptance, refund outcomes,
-- the payment-proofs bucket, the expire_reviews and remind_pending_reviews jobs, proof withdrawal
-- on cancelling, and realtime for the deposit badge and the booking page.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.proof_status as enum ('submitted', 'accepted', 'rejected', 'resubmission_requested', 'withdrawn');
create type public.payment_method as enum ('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'other');
create type public.fee_entry_kind as enum ('booking_fee', 'adjustment');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

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

create index bookings_review_reminder_idx on public.bookings (review_expires_at)
  where status = 'payment_submitted' and review_reminder_sent_at is null;

create trigger set_updated_at before update on public.payment_proofs
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

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
-- Internal helpers
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Functions called through PostgREST
-- ---------------------------------------------------------------------------

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

-- Phase 4 adds withdrawing a submitted proof to cancelling.
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
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

-- Phase 4 adds the organization id (for screenshot paths) and the latest proof: its status and the
-- shop's review note for anyone holding the code; its reference number, amount, and method for the
-- creator and the branch's members only.
drop function public.get_booking_by_code(text);

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

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------

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
  public.record_refund_outcome(uuid, boolean, numeric, text),
  public.get_booking_by_code(text)
from public, anon, authenticated;
grant execute on function
  public.submit_payment_proof(uuid, text, numeric, public.payment_method, text, text),
  public.review_payment_proof(uuid, public.proof_status, text),
  public.record_refund_outcome(uuid, boolean, numeric, text)
to authenticated;
grant execute on function public.get_booking_by_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
-- Path: payment-proofs {organization_id}/{booking_id}/{file}. Private: read through short-lived
-- signed URLs by the uploader and the branch's deposit reviewers. 5 MB, images only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

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
-- Realtime and scheduled jobs
-- ---------------------------------------------------------------------------

-- The deposit badge and list follow payment proofs; the booking page and the list follow bookings.
-- Realtime applies each table's row-level security to its subscribers.
alter publication supabase_realtime add table public.payment_proofs, public.bookings;

select cron.schedule('expire_reviews', '*/5 * * * *', 'select private.expire_reviews()');
select cron.schedule('remind_pending_reviews', '*/5 * * * *', 'select private.remind_pending_reviews()');
