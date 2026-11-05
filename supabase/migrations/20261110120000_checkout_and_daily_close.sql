-- Phase 6: checkout and the daily close. Sales with their items, tips, and payments, written by
-- complete_checkout (discount split, commission, tips per staff member, deposit deduction); the
-- daily close with its staff breakdown, written by close_day and reopened by reopen_day; and the
-- summary the close screen reads.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  branch_id uuid not null,
  booking_id uuid not null unique,
  client_id uuid not null,
  business_date date not null,
  subtotal numeric(20,2) not null,
  discount_amount numeric(20,2) not null default 0,
  tip_amount numeric(20,2) not null default 0,
  deposit_applied numeric(20,2) not null default 0,
  balance_collected numeric(20,2) not null,
  completed_by uuid not null references public.profiles (id),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id),
  foreign key (booking_id, organization_id) references public.bookings (id, organization_id),
  foreign key (client_id, organization_id) references public.clients (id, organization_id),
  constraint sales_amounts_check check (
    subtotal >= 0 and discount_amount >= 0 and discount_amount <= subtotal and tip_amount >= 0 and deposit_applied >= 0
    and balance_collected >= 0
    and balance_collected = subtotal - discount_amount + tip_amount - deposit_applied
  )
);

create index sales_branch_business_date_idx on public.sales (branch_id, business_date);
create index sales_organization_client_idx on public.sales (organization_id, client_id);
create index sales_completed_by_idx on public.sales (completed_by);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  service_id uuid,
  description text not null,
  staff_id uuid not null,
  amount numeric(20,2) not null check (amount >= 0),
  discount_share numeric(20,2) not null default 0 check (discount_share >= 0),
  commission_percent numeric(5,2) not null,
  commission_amount numeric(20,2) not null,
  sort_order smallint not null,
  foreign key (sale_id, organization_id) references public.sales (id, organization_id),
  foreign key (service_id, organization_id) references public.services (id, organization_id),
  foreign key (staff_id, organization_id) references public.staff (id, organization_id)
);

create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_staff_id_idx on public.sale_items (staff_id);
create index sale_items_service_id_idx on public.sale_items (service_id);
create index sale_items_organization_id_idx on public.sale_items (organization_id);

-- Tips go fully to the staff member who performed the service; one row per staff member tipped.
create table public.sale_tips (
  sale_id uuid not null,
  staff_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  amount numeric(20,2) not null check (amount > 0),
  primary key (sale_id, staff_id),
  foreign key (sale_id, organization_id) references public.sales (id, organization_id),
  foreign key (staff_id, organization_id) references public.staff (id, organization_id)
);

create index sale_tips_staff_id_idx on public.sale_tips (staff_id);
create index sale_tips_organization_id_idx on public.sale_tips (organization_id);

-- What was applied to the balance by each method, not the cash handed over.
create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  method public.payment_method not null,
  amount numeric(20,2) not null check (amount > 0),
  reference text,
  foreign key (sale_id, organization_id) references public.sales (id, organization_id)
);

create index sale_payments_sale_id_idx on public.sale_payments (sale_id);
create index sale_payments_organization_id_idx on public.sale_payments (organization_id);

-- A branch's close for one business date. The day is closed while reopened_at is null; closing
-- again after a reopen recalculates the same row.
create table public.daily_closes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  branch_id uuid not null,
  business_date date not null,
  gross_sales numeric(20,2) not null,
  discounts numeric(20,2) not null,
  tips numeric(20,2) not null,
  deposits_applied numeric(20,2) not null,
  deposits_received numeric(20,2) not null,
  fees_collected numeric(20,2) not null,
  totals_by_method jsonb not null,
  cash_float numeric(20,2) not null default 0,
  cash_expected numeric(20,2) not null,
  cash_counted numeric(20,2) not null,
  cash_variance numeric(20,2) not null,
  closed_by uuid not null references public.profiles (id),
  closed_at timestamptz not null,
  reopened_by uuid references public.profiles (id),
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (branch_id, business_date),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id)
);

create index daily_closes_organization_id_idx on public.daily_closes (organization_id);

create table public.daily_close_staff (
  daily_close_id uuid not null,
  staff_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  service_revenue numeric(20,2) not null,
  commission_amount numeric(20,2) not null,
  tip_amount numeric(20,2) not null,
  visit_count integer not null,
  primary key (daily_close_id, staff_id),
  foreign key (daily_close_id, organization_id) references public.daily_closes (id, organization_id) on delete cascade,
  foreign key (staff_id, organization_id) references public.staff (id, organization_id)
);

create index daily_close_staff_staff_id_idx on public.daily_close_staff (staff_id);
create index daily_close_staff_organization_id_idx on public.daily_close_staff (organization_id);

create trigger set_updated_at before update on public.daily_closes
  for each row execute function private.set_updated_at();

-- A walk-in that leaves before it starts is cancelled with no staff member or time range, which
-- phase 3's check refused.
alter table public.bookings drop constraint bookings_scheduled_check;
alter table public.bookings add constraint bookings_scheduled_check
  check (status in ('waiting', 'cancelled') or (staff_id is not null and start_at is not null));

-- ---------------------------------------------------------------------------
-- Access helper
-- ---------------------------------------------------------------------------

-- The staff profiles linked to the caller's active memberships in accessible organizations, for
-- staff reading their own sale items and tips.
create function private.own_staff_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.staff s
  join public.organization_members m on m.id = s.member_id
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and o.access_status = 'active';
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_tips enable row level security;
alter table public.sale_payments enable row level security;
alter table public.daily_closes enable row level security;
alter table public.daily_close_staff enable row level security;

-- Owners and managers read their branches' sales; staff read the sales they completed.
create policy sales_select on public.sales
  for select to authenticated
  using (
    branch_id in (select private.branch_ids_with_role('{owner,manager}'))
    or (completed_by = (select auth.uid()) and organization_id in (select private.accessible_organization_ids()))
  );

-- Items and tips follow their sale, and staff also read the rows for their own staff profile.
create policy sale_items_select on public.sale_items
  for select to authenticated
  using (sale_id in (select s.id from public.sales s) or staff_id in (select private.own_staff_ids()));
create policy sale_tips_select on public.sale_tips
  for select to authenticated
  using (sale_id in (select s.id from public.sales s) or staff_id in (select private.own_staff_ids()));
create policy sale_payments_select on public.sale_payments
  for select to authenticated
  using (sale_id in (select s.id from public.sales s));

create policy daily_closes_select on public.daily_closes
  for select to authenticated
  using (branch_id in (select private.branch_ids_with_role('{owner,manager}')));
create policy daily_close_staff_select on public.daily_close_staff
  for select to authenticated
  using (daily_close_id in (select c.id from public.daily_closes c));

-- ---------------------------------------------------------------------------
-- Internals
-- ---------------------------------------------------------------------------

-- Refuses a sale on a business date the branch has closed and not reopened.
create function private.require_open_business_date(p_branch_id uuid, p_business_date date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.daily_closes c
    where c.branch_id = p_branch_id
      and c.business_date = p_business_date
      and c.reopened_at is null
  ) then
    raise exception using errcode = 'GBD01', message = 'business_day_closed';
  end if;
end;
$$;

-- A branch's totals for one business date, as the close screen shows them and close_day stores
-- them. Deposits received and fees collected are the deposits accepted that business date and
-- their fee entries; the fees are owed to GroomBox and are not cash in the drawer.
create function private.daily_close_totals(p_branch_id uuid, p_business_date date)
returns table (
  gross_sales numeric(20,2),
  discounts numeric(20,2),
  tips numeric(20,2),
  deposits_applied numeric(20,2),
  deposits_received numeric(20,2),
  fees_collected numeric(20,2),
  cash_sales numeric(20,2),
  totals_by_method jsonb,
  staff jsonb,
  sale_count integer,
  unfinished_visit_count integer
)
language sql
stable
set search_path = ''
as $$
  with branch as (
    select b.id, b.timezone, b.business_day_start from public.branches b where b.id = p_branch_id
  ),
  day_sales as (
    select s.* from public.sales s where s.branch_id = p_branch_id and s.business_date = p_business_date
  ),
  accepted_fees as (
    select f.amount, bk.deposit_amount
    from public.fee_entries f
    join public.bookings bk on bk.id = f.booking_id
    cross join branch
    where f.branch_id = p_branch_id
      and f.kind = 'booking_fee'
      and private.business_date(f.accrued_at, branch.timezone, branch.business_day_start) = p_business_date
  ),
  payments as (
    select p.method, sum(p.amount) as amount
    from public.sale_payments p
    join day_sales s on s.id = p.sale_id
    group by p.method
  ),
  staff_totals as (
    select
      st.id as staff_id,
      st.display_name,
      coalesce(items.service_revenue, 0) as service_revenue,
      coalesce(items.commission_amount, 0) as commission_amount,
      coalesce(tip.tip_amount, 0) as tip_amount,
      coalesce(items.visit_count, 0) as visit_count
    from public.staff st
    left join (
      select i.staff_id, sum(i.amount - i.discount_share) as service_revenue, sum(i.commission_amount) as commission_amount,
        count(distinct i.sale_id)::integer as visit_count
      from public.sale_items i
      join day_sales s on s.id = i.sale_id
      group by i.staff_id
    ) as items on items.staff_id = st.id
    left join (
      select t.staff_id, sum(t.amount) as tip_amount
      from public.sale_tips t
      join day_sales s on s.id = t.sale_id
      group by t.staff_id
    ) as tip on tip.staff_id = st.id
    where items.staff_id is not null or tip.staff_id is not null
  )
  select
    coalesce((select sum(s.subtotal) from day_sales s), 0),
    coalesce((select sum(s.discount_amount) from day_sales s), 0),
    coalesce((select sum(s.tip_amount) from day_sales s), 0),
    coalesce((select sum(s.deposit_applied) from day_sales s), 0),
    coalesce((select sum(a.deposit_amount) from accepted_fees a), 0),
    coalesce((select sum(a.amount) from accepted_fees a), 0),
    coalesce((select p.amount from payments p where p.method = 'cash'), 0),
    coalesce((select jsonb_object_agg(p.method, p.amount order by p.method) from payments p), '{}'::jsonb),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'staff_id', t.staff_id, 'display_name', t.display_name, 'service_revenue', t.service_revenue,
            'commission_amount', t.commission_amount, 'tip_amount', t.tip_amount, 'visit_count', t.visit_count
          )
          order by t.display_name
        )
        from staff_totals t
      ),
      '[]'::jsonb
    ),
    (select count(*)::integer from day_sales),
    (
      select count(*)::integer
      from public.bookings bk
      where bk.branch_id = p_branch_id
        and bk.business_date = p_business_date
        and bk.status in ('waiting', 'confirmed', 'checked_in', 'in_service')
    );
$$;

-- ---------------------------------------------------------------------------
-- Functions called through PostgREST
-- ---------------------------------------------------------------------------

-- Checks out a visit in service: the sale with its items, tips, and payments, in one step.
--   p_items: [{"service_id": uuid or null, "description": text, "staff_id": uuid, "amount": number}]
--   p_tips: [{"staff_id": uuid, "amount": number}]
--   p_payments: [{"method": payment_method, "amount": number, "reference": text or null}]
-- The discount is split across items in proportion to their amounts, rounded to the centavo, with
-- the remainder on the largest item. Commission is the staff member's rate for the service (the
-- per-service override, else their default) on each item's amount after its discount share. The
-- booking's deposit is applied up to the bill; any excess is refunded outside GroomBox and
-- recorded with record_refund_outcome. The sale belongs to the current business date, which must
-- not be closed. The checkout screen makes the payments add up to the balance.
create function public.complete_checkout(
  p_booking_id uuid,
  p_items jsonb,
  p_discount_amount numeric,
  p_tips jsonb,
  p_payments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
  v_booking public.bookings;
  v_branch record;
  v_business_date date;
  v_subtotal numeric(20,2);
  v_tip_amount numeric(20,2);
  v_deposit_applied numeric(20,2);
  v_sale_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;
  perform private.member_branch(v_booking.branch_id);

  if v_booking.status <> 'in_service' then
    raise exception using errcode = 'GBF02', message = 'visit_status_changed';
  end if;

  -- A share lock on the branch keeps close_day, which locks it for update, from closing the day
  -- while this sale is being written; checkouts still run side by side.
  select b.timezone, b.business_day_start into v_branch from public.branches b where b.id = v_booking.branch_id for share;
  v_business_date := private.business_date(now(), v_branch.timezone, v_branch.business_day_start);
  perform private.require_open_business_date(v_booking.branch_id, v_business_date);

  -- The discount split: each item's proportional share rounded to the centavo, then the rounding
  -- remainder on the largest item (the first of equals), so the shares add up to the discount.
  create temporary table checkout_item on commit drop as
  with item as (
    select
      entry.ordinality::smallint as sort_order,
      entry.value ->> 'service_id' as service_id_text,
      entry.value ->> 'description' as description,
      (entry.value ->> 'staff_id')::uuid as staff_id,
      round((entry.value ->> 'amount')::numeric, 2) as amount
    from jsonb_array_elements(p_items) with ordinality as entry (value, ordinality)
  ),
  discount as (
    select case when p_discount_amount > 0 and sum(item.amount) > 0 then p_discount_amount else 0 end as amount,
      sum(item.amount) as subtotal
    from item
  ),
  shared as (
    select item.*,
      case when discount.amount > 0 then round(discount.amount * item.amount / discount.subtotal, 2) else 0 end as base_share,
      row_number() over (order by item.amount desc, item.sort_order) as size_rank,
      discount.amount as discount_amount
    from item
    cross join discount
  )
  select sort_order, service_id_text, description, staff_id, amount,
    (base_share + case when size_rank = 1 then discount_amount - sum(base_share) over () else 0 end)::numeric(20,2) as discount_share
  from shared;

  select coalesce(sum(amount), 0) into v_subtotal from checkout_item;

  select coalesce(sum(round((tip.value ->> 'amount')::numeric, 2)), 0) into v_tip_amount
  from jsonb_array_elements(p_tips) as tip (value);

  v_deposit_applied := least(v_booking.deposit_amount, v_subtotal - p_discount_amount + v_tip_amount);

  insert into public.sales (
    organization_id, branch_id, booking_id, client_id, business_date, subtotal, discount_amount, tip_amount,
    deposit_applied, balance_collected, completed_by
  )
  values (
    v_booking.organization_id, v_booking.branch_id, p_booking_id, v_booking.client_id, v_business_date, v_subtotal,
    p_discount_amount, v_tip_amount, v_deposit_applied, v_subtotal - p_discount_amount + v_tip_amount - v_deposit_applied,
    v_user_id
  )
  returning id into v_sale_id;

  insert into public.sale_items (
    sale_id, organization_id, service_id, description, staff_id, amount, discount_share, commission_percent,
    commission_amount, sort_order
  )
  select
    v_sale_id, v_booking.organization_id, nullif(i.service_id_text, '')::uuid, i.description, i.staff_id, i.amount,
    i.discount_share, rate.percent, round((i.amount - i.discount_share) * rate.percent / 100, 2), i.sort_order
  from checkout_item i
  join public.staff st on st.id = i.staff_id
  left join public.staff_services ss on ss.staff_id = i.staff_id and ss.service_id = nullif(i.service_id_text, '')::uuid
  cross join lateral (select coalesce(ss.commission_percent_override, st.commission_percent) as percent) as rate;

  insert into public.sale_tips (sale_id, staff_id, organization_id, amount)
  select v_sale_id, (tip.value ->> 'staff_id')::uuid, v_booking.organization_id, round((tip.value ->> 'amount')::numeric, 2)
  from jsonb_array_elements(p_tips) as tip (value);

  insert into public.sale_payments (sale_id, organization_id, method, amount, reference)
  select v_sale_id, v_booking.organization_id, (payment.value ->> 'method')::public.payment_method,
    round((payment.value ->> 'amount')::numeric, 2), nullif(payment.value ->> 'reference', '')
  from jsonb_array_elements(p_payments) as payment (value);

  update public.bookings set status = 'completed', completed_at = now() where id = p_booking_id;

  perform private.log_activity(
    v_booking.organization_id, 'sale.completed', 'sale', v_sale_id,
    jsonb_build_object(
      'booking_id', p_booking_id,
      'subtotal', v_subtotal,
      'discount_amount', p_discount_amount,
      'tip_amount', v_tip_amount,
      'deposit_applied', v_deposit_applied,
      'item_count', jsonb_array_length(p_items),
      'payment_count', jsonb_array_length(p_payments)
    )
  );

  drop table checkout_item;
  return v_sale_id;
end;
$$;

-- The close screen's summary for a branch and business date, for the owner and managers: the
-- stored close when the day is closed, or the running totals, with the visits still unfinished.
create function public.get_daily_close_summary(p_branch_id uuid, p_business_date date)
returns table (
  gross_sales numeric(20,2),
  discounts numeric(20,2),
  tips numeric(20,2),
  deposits_applied numeric(20,2),
  deposits_received numeric(20,2),
  fees_collected numeric(20,2),
  cash_sales numeric(20,2),
  totals_by_method jsonb,
  staff jsonb,
  sale_count integer,
  unfinished_visit_count integer,
  is_closed boolean,
  cash_float numeric(20,2),
  cash_expected numeric(20,2),
  cash_counted numeric(20,2),
  cash_variance numeric(20,2),
  closed_at timestamptz,
  reopened_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_signed_in_account();
  if p_branch_id not in (select private.branch_ids_with_role('{owner,manager}')) then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  return query
  select
    coalesce(c.gross_sales, t.gross_sales),
    coalesce(c.discounts, t.discounts),
    coalesce(c.tips, t.tips),
    coalesce(c.deposits_applied, t.deposits_applied),
    coalesce(c.deposits_received, t.deposits_received),
    coalesce(c.fees_collected, t.fees_collected),
    case when c.id is not null and c.reopened_at is null then coalesce((c.totals_by_method ->> 'cash')::numeric, 0) else t.cash_sales end,
    case when c.id is not null and c.reopened_at is null then c.totals_by_method else t.totals_by_method end,
    case
      when c.id is not null and c.reopened_at is null then (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'staff_id', cs.staff_id, 'display_name', st.display_name, 'service_revenue', cs.service_revenue,
              'commission_amount', cs.commission_amount, 'tip_amount', cs.tip_amount, 'visit_count', cs.visit_count
            )
            order by st.display_name
          ),
          '[]'::jsonb
        )
        from public.daily_close_staff cs
        join public.staff st on st.id = cs.staff_id
        where cs.daily_close_id = c.id
      )
      else t.staff
    end,
    t.sale_count,
    t.unfinished_visit_count,
    c.id is not null and c.reopened_at is null,
    c.cash_float,
    c.cash_expected,
    c.cash_counted,
    c.cash_variance,
    c.closed_at,
    c.reopened_at
  from private.daily_close_totals(p_branch_id, p_business_date) t
  left join public.daily_closes c
    on c.branch_id = p_branch_id and c.business_date = p_business_date and c.reopened_at is null;
end;
$$;

-- Closes a branch's business date: every visit of the day must be completed, cancelled, or marked
-- no-show first (bookings waiting on a deposit decision do not block it). Stores the totals, the
-- opening float, the counted cash, expected cash (the float plus cash sale payments), the
-- variance, and the staff breakdown. Sales on the date are refused until the owner reopens it.
create function public.close_day(
  p_branch_id uuid,
  p_business_date date,
  p_cash_float numeric,
  p_cash_counted numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
  v_organization_id uuid;
  v_totals record;
  v_close_id uuid;
begin
  select b.organization_id into v_organization_id
  from public.branches b
  where b.id = p_branch_id
    and b.id in (select private.branch_ids_with_role('{owner,manager}'))
  for update;
  if not found then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  select * into v_totals from private.daily_close_totals(p_branch_id, p_business_date);
  if v_totals.unfinished_visit_count > 0 then
    raise exception using errcode = 'GBD02', message = 'unfinished_visits';
  end if;

  insert into public.daily_closes (
    organization_id, branch_id, business_date, gross_sales, discounts, tips, deposits_applied, deposits_received,
    fees_collected, totals_by_method, cash_float, cash_expected, cash_counted, cash_variance, closed_by, closed_at
  )
  values (
    v_organization_id, p_branch_id, p_business_date, v_totals.gross_sales, v_totals.discounts, v_totals.tips,
    v_totals.deposits_applied, v_totals.deposits_received, v_totals.fees_collected, v_totals.totals_by_method,
    p_cash_float, p_cash_float + v_totals.cash_sales, p_cash_counted, p_cash_counted - (p_cash_float + v_totals.cash_sales),
    v_user_id, now()
  )
  on conflict (branch_id, business_date) do update
    set gross_sales = excluded.gross_sales,
      discounts = excluded.discounts,
      tips = excluded.tips,
      deposits_applied = excluded.deposits_applied,
      deposits_received = excluded.deposits_received,
      fees_collected = excluded.fees_collected,
      totals_by_method = excluded.totals_by_method,
      cash_float = excluded.cash_float,
      cash_expected = excluded.cash_expected,
      cash_counted = excluded.cash_counted,
      cash_variance = excluded.cash_variance,
      closed_by = excluded.closed_by,
      closed_at = excluded.closed_at,
      reopened_by = null,
      reopened_at = null
  returning id into v_close_id;

  delete from public.daily_close_staff where daily_close_id = v_close_id;
  insert into public.daily_close_staff (
    daily_close_id, staff_id, organization_id, service_revenue, commission_amount, tip_amount, visit_count
  )
  select v_close_id, (s.value ->> 'staff_id')::uuid, v_organization_id, (s.value ->> 'service_revenue')::numeric,
    (s.value ->> 'commission_amount')::numeric, (s.value ->> 'tip_amount')::numeric, (s.value ->> 'visit_count')::integer
  from jsonb_array_elements(v_totals.staff) as s (value);

  perform private.log_activity(
    v_organization_id, 'daily_close.closed', 'daily_close', v_close_id,
    jsonb_build_object(
      'business_date', p_business_date,
      'gross_sales', v_totals.gross_sales,
      'cash_variance', p_cash_counted - (p_cash_float + v_totals.cash_sales),
      'sale_count', v_totals.sale_count
    )
  );

  return v_close_id;
end;
$$;

-- The owner reopens a closed business date so its sales can be added to; closing it again
-- recalculates the close.
create function public.reopen_day(p_branch_id uuid, p_business_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_signed_in_account();
  v_close public.daily_closes;
begin
  select * into v_close
  from public.daily_closes
  where branch_id = p_branch_id
    and business_date = p_business_date
  for update;

  if not found or p_branch_id not in (select private.branch_ids_with_role('{owner}')) then
    raise exception using errcode = 'GBA02', message = 'not_permitted';
  end if;

  update public.daily_closes set reopened_by = v_user_id, reopened_at = now() where id = v_close.id;

  perform private.log_activity(
    v_close.organization_id, 'daily_close.reopened', 'daily_close', v_close.id,
    jsonb_build_object('business_date', p_business_date)
  );
end;
$$;

-- Phase 4's cancel_booking, corrected: a member who entered a walk-in or appointment and then
-- cancels it does so as the shop. Only an online booking's creator cancels as the client.
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

  -- Only an online booking's creator cancels as the client; members who enter walk-ins and
  -- appointments are the shop, whoever created the booking.
  if v_booking.booked_by = v_user_id and v_booking.source = 'online' then
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

-- Phase 6 adds moving the duplicate's sales to merging clients.
create or replace function public.merge_clients(p_keep_client_id uuid, p_duplicate_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.clients;
  v_duplicate public.clients;
  v_moved_count integer;
  v_moved_sale_count integer;
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
  update public.sales set client_id = p_keep_client_id where client_id = p_duplicate_client_id;
  get diagnostics v_moved_sale_count = row_count;

  delete from public.clients where id = p_duplicate_client_id;

  update public.clients
  set user_id = coalesce(v_keep.user_id, v_duplicate.user_id),
    mobile_number = coalesce(v_keep.mobile_number, v_duplicate.mobile_number),
    notes = nullif(concat_ws(E'\n\n', nullif(trim(v_keep.notes), ''), nullif(trim(v_duplicate.notes), '')), '')
  where id = p_keep_client_id;

  perform private.log_activity(
    v_keep.organization_id, 'client.merged', 'client', p_keep_client_id,
    jsonb_build_object(
      'duplicate_client_id', p_duplicate_client_id,
      'moved_booking_count', v_moved_count,
      'moved_sale_count', v_moved_sale_count
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on table
  public.sales, public.sale_items, public.sale_tips, public.sale_payments, public.daily_closes, public.daily_close_staff
from anon, authenticated;
grant select on
  public.sales, public.sale_items, public.sale_tips, public.sale_payments, public.daily_closes, public.daily_close_staff
to authenticated;

revoke all on function
  private.own_staff_ids(),
  private.require_open_business_date(uuid, date),
  private.daily_close_totals(uuid, date)
from public, anon, authenticated;
grant execute on function private.own_staff_ids() to authenticated;

revoke all on function
  public.complete_checkout(uuid, jsonb, numeric, jsonb, jsonb),
  public.get_daily_close_summary(uuid, date),
  public.close_day(uuid, date, numeric, numeric),
  public.reopen_day(uuid, date)
from public, anon, authenticated;
grant execute on function
  public.complete_checkout(uuid, jsonb, numeric, jsonb, jsonb),
  public.get_daily_close_summary(uuid, date),
  public.close_day(uuid, date, numeric, numeric),
  public.reopen_day(uuid, date)
to authenticated;
