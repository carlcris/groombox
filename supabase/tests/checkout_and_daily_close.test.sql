-- Checkout and the daily close: a day of mixed visits closed with totals that match a hand
-- calculation, at a late-night branch whose checkouts happen after midnight.
--
-- The fixture branch's time zone is chosen so that it is between 12:30 and 4:30 AM there now: the
-- branch is open 2:00 PM to 5:00 AM, so every checkout in this test happens after midnight and must
-- belong to the previous business date.
--
-- Ways these could fail, each covered below:
--  1. A sale after midnight lands on the calendar date instead of the business date.
--  2. The discount split loses or gains a centavo, or its remainder goes to the wrong item.
--  3. Commission ignores the per-service override, is taken before the discount, or rounds half
--     towards even instead of away from zero.
--  4. A deposit larger than the bill is applied in full, or leaves a balance.
--  5. A checkout runs on a visit that is not in service, by a non-member, or on a closed day; or a
--     failure after the sale was written leaves rows behind.
--  6. The close counts the wrong sales, cash, deposits, or fees; closes with unfinished visits; or
--     is blocked by bookings still waiting on a deposit decision.
--  7. Someone other than the owner reopens a day; closing again does not recalculate.
--  8. Staff read sales they did not complete, or the close; merging clients leaves sales behind.

begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create temporary table fixture (key text primary key, id uuid not null);
grant select on fixture to authenticated;

create function pg_temp.fixture_id(p_key text) returns uuid language sql stable as $$
  select id from fixture where key = p_key;
$$;
grant execute on function pg_temp.fixture_id(text) to authenticated;

create function pg_temp.act_as(p_key text) returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', pg_temp.fixture_id(p_key), 'role', 'authenticated', 'is_anonymous', false)::text,
    true
  );
$$;

create temporary table late_night (timezone text not null);
insert into late_night
select name
from pg_timezone_names
where (now() at time zone name)::time between '00:30' and '04:30'
  and name not like 'posix/%' and name not like 'Etc/%'
order by name
limit 1;
grant select on late_night to authenticated;

create function pg_temp.business_date() returns date language sql stable as $$
  select private.business_date(now(), (select timezone from late_night), '05:00');
$$;
grant execute on function pg_temp.business_date() to authenticated;

insert into fixture (key, id)
select key, gen_random_uuid()
from unnest(array[
  'owner', 'manager', 'stylist_login', 'org', 'branch', 'category', 'cut', 'trim', 'color', 'nina', 'omar',
  'owner_member', 'manager_member', 'stylist_member', 'client_a', 'client_b',
  'v1', 'v2', 'v3', 'v4', 'unfinished', 'held'
]) as key;

insert into auth.users (id, email)
select pg_temp.fixture_id(key), key || '@checkout.test' from unnest(array['owner', 'manager', 'stylist_login']) as key;

insert into public.organizations (id, name, slug, category, deposit_type, deposit_fixed_amount)
values (pg_temp.fixture_id('org'), 'Midnight Spa', 'midnight-spa-test', 'spa', 'fixed', 100);
insert into public.branches (id, organization_id, name, slug, timezone, business_day_start, is_published)
values (pg_temp.fixture_id('branch'), pg_temp.fixture_id('org'), 'Night', 'midnight-spa-night', (select timezone from late_night), '05:00', true);
insert into public.branch_hours (branch_id, organization_id, day_of_week, opens_at, closes_at, closes_next_day, is_closed)
select pg_temp.fixture_id('branch'), pg_temp.fixture_id('org'), day, '14:00', '05:00', true, false from generate_series(0, 6) as day;

insert into public.organization_members (id, organization_id, user_id, role)
values
  (pg_temp.fixture_id('owner_member'), pg_temp.fixture_id('org'), pg_temp.fixture_id('owner'), 'owner'),
  (pg_temp.fixture_id('manager_member'), pg_temp.fixture_id('org'), pg_temp.fixture_id('manager'), 'manager'),
  (pg_temp.fixture_id('stylist_member'), pg_temp.fixture_id('org'), pg_temp.fixture_id('stylist_login'), 'staff');
insert into public.member_branches (member_id, branch_id, organization_id)
select pg_temp.fixture_id(key), pg_temp.fixture_id('branch'), pg_temp.fixture_id('org')
from unnest(array['manager_member', 'stylist_member']) as key;

insert into public.service_categories (id, organization_id, name) values (pg_temp.fixture_id('category'), pg_temp.fixture_id('org'), 'Spa');
insert into public.services (id, organization_id, category_id, name, duration_minutes, price)
values
  (pg_temp.fixture_id('cut'), pg_temp.fixture_id('org'), pg_temp.fixture_id('category'), 'Cut', 30, 100),
  (pg_temp.fixture_id('trim'), pg_temp.fixture_id('org'), pg_temp.fixture_id('category'), 'Trim', 30, 100.01),
  (pg_temp.fixture_id('color'), pg_temp.fixture_id('org'), pg_temp.fixture_id('category'), 'Color', 30, 1000);

-- Nina (linked to the stylist's login) earns 40% by default and 50% on color; Omar earns 25%.
insert into public.staff (id, organization_id, member_id, display_name, commission_percent)
values
  (pg_temp.fixture_id('nina'), pg_temp.fixture_id('org'), pg_temp.fixture_id('stylist_member'), 'Nina', 40),
  (pg_temp.fixture_id('omar'), pg_temp.fixture_id('org'), null, 'Omar', 25);
insert into public.staff_services (staff_id, service_id, organization_id, commission_percent_override)
values (pg_temp.fixture_id('nina'), pg_temp.fixture_id('color'), pg_temp.fixture_id('org'), 50);

insert into public.clients (id, organization_id, full_name)
values (pg_temp.fixture_id('client_a'), pg_temp.fixture_id('org'), 'Alma'), (pg_temp.fixture_id('client_b'), pg_temp.fixture_id('org'), 'Alma A.');

-- Four visits in service, a walk-in still waiting, and an online hold awaiting payment, all on the
-- business date that began yesterday evening. Online deposits of ₱500 (v2) and ₱100 (v3) were
-- accepted tonight, with fees of ₱10.00 and ₱30.30.
insert into public.bookings (
  id, organization_id, branch_id, client_id, booked_by, staff_id, source, status, start_at, end_at, business_date,
  service_total, deposit_amount, convenience_fee, amount_due, hold_expires_at
)
select pg_temp.fixture_id(visit.key), pg_temp.fixture_id('org'), pg_temp.fixture_id('branch'), pg_temp.fixture_id('client_a'),
  pg_temp.fixture_id('owner'), visit.staff_id, visit.source::public.booking_source, visit.status::public.booking_status,
  visit.start_at, visit.start_at + interval '30 minutes', pg_temp.business_date(), 0, visit.deposit, visit.fee,
  visit.deposit + visit.fee, visit.hold_expires_at
from (values
  ('v1', pg_temp.fixture_id('nina'), 'walk_in', 'in_service', now() - interval '3 hours', 0.00, 0.00, null::timestamptz),
  ('v2', pg_temp.fixture_id('nina'), 'online', 'in_service', now() - interval '2 hours', 500.00, 10.00, null),
  ('v3', pg_temp.fixture_id('omar'), 'online', 'in_service', now() - interval '1 hour', 100.00, 30.30, null),
  ('v4', pg_temp.fixture_id('omar'), 'walk_in', 'in_service', now() - interval '20 minutes', 0.00, 0.00, null),
  ('unfinished', null, 'walk_in', 'waiting', null, 0.00, 0.00, null),
  ('held', pg_temp.fixture_id('nina'), 'online', 'held', now() + interval '1 hour', 100.00, 10.00, now() + interval '10 minutes')
) as visit (key, staff_id, source, status, start_at, deposit, fee, hold_expires_at);
insert into public.fee_entries (organization_id, branch_id, kind, booking_id, amount, accrued_at)
values
  (pg_temp.fixture_id('org'), pg_temp.fixture_id('branch'), 'booking_fee', pg_temp.fixture_id('v2'), 10.00, now() - interval '30 minutes'),
  (pg_temp.fixture_id('org'), pg_temp.fixture_id('branch'), 'booking_fee', pg_temp.fixture_id('v3'), 30.30, now() - interval '25 minutes');

create function pg_temp.item(p_service text, p_description text, p_staff text, p_amount numeric) returns jsonb language sql stable as $$
  select jsonb_build_object('service_id', pg_temp.fixture_id(p_service), 'description', p_description,
    'staff_id', pg_temp.fixture_id(p_staff), 'amount', p_amount);
$$;
grant execute on function pg_temp.item(text, text, text, numeric) to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 5. Who checks out, and when
-- ---------------------------------------------------------------------------

select pg_temp.act_as('stylist_login');
select throws_ok(
  $$ select public.complete_checkout(pg_temp.fixture_id('unfinished'), '[]', 0, '[]', '[]') $$,
  'GBF02', 'visit_status_changed',
  'a visit that has not started cannot be checked out'
);

-- A failure after the sale was written leaves nothing behind.
reset role;
create function pg_temp.fail_payments() returns trigger language plpgsql as $$
begin
  raise exception 'forced failure';
end;
$$;
create trigger forced_failure before insert on public.sale_payments for each row execute function pg_temp.fail_payments();
set local role authenticated;
select pg_temp.act_as('stylist_login');
select throws_ok(
  format($$ select public.complete_checkout(pg_temp.fixture_id('v4'), jsonb_build_array(%L::jsonb), 0, '[]',
       '[{"method": "cash", "amount": 50}]') $$, pg_temp.item('cut', 'Cut', 'omar', 50)),
  'P0001', 'forced failure',
  'a failure while saving the payments fails the checkout'
);
reset role;
select results_eq(
  $$ select (select count(*)::integer from public.sales where booking_id = pg_temp.fixture_id('v4')),
       (select count(*)::integer from public.sale_items i join public.sales s on s.id = i.sale_id where s.booking_id = pg_temp.fixture_id('v4')),
       (select status::text from public.bookings where id = pg_temp.fixture_id('v4')),
       (select count(*)::integer from public.activity_logs where action = 'sale.completed' and metadata ->> 'booking_id' = pg_temp.fixture_id('v4')::text) $$,
  $$ values (0, 0, 'in_service', 0) $$,
  'no sale, items, completion, or activity row remain from the failed checkout'
);
drop trigger forced_failure on public.sale_payments;

-- ---------------------------------------------------------------------------
-- 1–4. Three checkouts after midnight
-- ---------------------------------------------------------------------------

-- v1: three items with a ₱10 discount (₱3.33, ₱3.33, and the remainder ₱3.34 on the ₱100.01 trim),
-- tips of ₱20 and ₱10.50, paid ₱200 cash and ₱120.51 GCash.
set local role authenticated;
select pg_temp.act_as('stylist_login');
select lives_ok(
  format($$ select public.complete_checkout(pg_temp.fixture_id('v1'), jsonb_build_array(%L::jsonb, %L::jsonb, %L::jsonb), 10.00,
       jsonb_build_array(jsonb_build_object('staff_id', pg_temp.fixture_id('nina'), 'amount', 20),
         jsonb_build_object('staff_id', pg_temp.fixture_id('omar'), 'amount', 10.50)),
       '[{"method": "cash", "amount": 200}, {"method": "gcash", "amount": 120.51, "reference": "GC-1"}]') $$,
    pg_temp.item('cut', 'Cut', 'nina', 100.00), pg_temp.item('cut', 'Cut', 'omar', 100.00), pg_temp.item('trim', 'Trim', 'nina', 100.01)),
  'staff check out a walk-in with three items, a discount, two tips, and two payments'
);
-- v2: a ₱300 color with Nina; the ₱500 deposit covers it, so nothing is collected.
select pg_temp.act_as('owner');
select lives_ok(
  format($$ select public.complete_checkout(pg_temp.fixture_id('v2'), jsonb_build_array(%L::jsonb), 0, '[]', '[]') $$,
    pg_temp.item('color', 'Color', 'nina', 300.00)),
  'the owner checks out a visit whose deposit is larger than the bill'
);
-- v3: a ₱1,000 color and a ₱10.10 add-on with no service, both Omar's; ₱100 deposit; ₱910.10 cash.
select lives_ok(
  format($$ select public.complete_checkout(pg_temp.fixture_id('v3'), jsonb_build_array(%L::jsonb,
       jsonb_build_object('service_id', null, 'description', 'Add-on', 'staff_id', pg_temp.fixture_id('omar'), 'amount', 10.10)),
       0, '[]', '[{"method": "cash", "amount": 910.10}]') $$,
    pg_temp.item('color', 'Color', 'omar', 1000.00)),
  'the owner checks out a visit with an added item'
);
reset role;

select is(
  (select array_agg(distinct business_date) from public.sales where branch_id = pg_temp.fixture_id('branch')),
  array[pg_temp.business_date()],
  'sales after midnight belong to the business date that began the evening before'
);
select is(
  (now() at time zone (select timezone from late_night))::date,
  pg_temp.business_date() + 1,
  'which is the calendar date before the local one'
);

select results_eq(
  $$ select i.description, i.amount, i.discount_share, i.commission_percent, i.commission_amount
     from public.sale_items i join public.sales s on s.id = i.sale_id
     where s.booking_id = pg_temp.fixture_id('v1') order by i.sort_order $$,
  $$ values ('Cut', 100.00::numeric(20,2), 3.33::numeric(20,2), 40.00::numeric(5,2), 38.67::numeric(20,2)),
            ('Cut', 100.00, 3.33, 25.00, 24.17),
            ('Trim', 100.01, 3.34, 40.00, 38.67) $$,
  'the discount splits in proportion with the remainder on the largest item, and commission is on each amount after its share'
);
select results_eq(
  $$ select s.subtotal, s.discount_amount, s.tip_amount, s.deposit_applied, s.balance_collected,
       (select sum(amount) from public.sale_payments p where p.sale_id = s.id)
     from public.sales s where s.booking_id = pg_temp.fixture_id('v1') $$,
  $$ values (300.01::numeric(20,2), 10.00::numeric(20,2), 30.50::numeric(20,2), 0.00::numeric(20,2), 320.51::numeric(20,2), 320.51::numeric) $$,
  'the walk-in''s totals: ₱300.01 less ₱10.00 plus ₱30.50 in tips, all collected'
);
select results_eq(
  $$ select t.amount from public.sale_tips t join public.sales s on s.id = t.sale_id
     where s.booking_id = pg_temp.fixture_id('v1') order by t.amount $$,
  $$ values (10.50::numeric(20,2)), (20.00::numeric(20,2)) $$,
  'each staff member''s tip is stored'
);
select results_eq(
  $$ select s.deposit_applied, s.balance_collected, i.commission_percent, i.commission_amount,
       (select deposit_amount from public.bookings where id = s.booking_id) - s.deposit_applied
     from public.sales s join public.sale_items i on i.sale_id = s.id where s.booking_id = pg_temp.fixture_id('v2') $$,
  $$ values (300.00::numeric(20,2), 0.00::numeric(20,2), 50.00::numeric(5,2), 150.00::numeric(20,2), 200.00::numeric) $$,
  'a deposit larger than the bill is applied up to the bill, leaving no balance and ₱200 to refund; the color override earns 50%'
);
select results_eq(
  $$ select i.description, i.service_id, i.commission_percent, i.commission_amount
     from public.sale_items i join public.sales s on s.id = i.sale_id
     where s.booking_id = pg_temp.fixture_id('v3') order by i.sort_order $$,
  $$ values ('Color', pg_temp.fixture_id('color'), 25.00::numeric(5,2), 250.00::numeric(20,2)),
            ('Add-on', null::uuid, 25.00, 2.53) $$,
  'without an override the default rate applies, and 25% of ₱10.10 rounds half away from zero to ₱2.53'
);
select results_eq(
  $$ select status::text, completed_at is not null from public.bookings where id in (pg_temp.fixture_id('v1'), pg_temp.fixture_id('v2'), pg_temp.fixture_id('v3')) $$,
  $$ values ('completed', true), ('completed', true), ('completed', true) $$,
  'checked-out visits are completed'
);

-- ---------------------------------------------------------------------------
-- 6. Closing the day
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('manager');
select throws_ok(
  $$ select public.close_day(pg_temp.fixture_id('branch'), pg_temp.business_date(), 500, 1600.10) $$,
  'GBD02', 'unfinished_visits',
  'the day cannot close while a walk-in waits and a visit is in service'
);
select results_eq(
  $$ select unfinished_visit_count, is_closed from public.get_daily_close_summary(pg_temp.fixture_id('branch'), pg_temp.business_date()) $$,
  $$ values (2, false) $$,
  'the summary counts the unfinished visits; the hold awaiting payment is not one of them'
);
select pg_temp.act_as('owner');
select lives_ok($$ select public.cancel_booking(pg_temp.fixture_id('unfinished'), 'Left') $$, 'the waiting walk-in leaves');
reset role;
-- v4 is set aside for now and comes back for the closed-day check below.
update public.bookings set status = 'cancelled' where id = pg_temp.fixture_id('v4');
set local role authenticated;
select pg_temp.act_as('manager');
select lives_ok(
  $$ select public.close_day(pg_temp.fixture_id('branch'), pg_temp.business_date(), 500, 1600.10) $$,
  'a manager closes the day with a ₱500 float and ₱1,600.10 counted, while a hold still awaits payment'
);
reset role;

-- By hand: gross 300.01 + 300.00 + 1,010.10 = 1,610.11; discounts 10.00; tips 30.50; deposits
-- applied 0 + 300 + 100 = 400; deposits received tonight 500 + 100 = 600 with fees 10.00 + 30.30 =
-- 40.30; cash 200 + 910.10 = 1,110.10 and GCash 120.51; expected cash 500 + 1,110.10 = 1,610.10, so
-- the count is ₱10 short.
select results_eq(
  $$ select gross_sales, discounts, tips, deposits_applied, deposits_received, fees_collected, totals_by_method,
       cash_float, cash_expected, cash_counted, cash_variance
     from public.daily_closes where branch_id = pg_temp.fixture_id('branch') and business_date = pg_temp.business_date() $$,
  $$ values (1610.11::numeric(20,2), 10.00::numeric(20,2), 30.50::numeric(20,2), 400.00::numeric(20,2), 600.00::numeric(20,2),
       40.30::numeric(20,2), '{"cash": 1110.10, "gcash": 120.51}'::jsonb, 500.00::numeric(20,2), 1610.10::numeric(20,2),
       1600.10::numeric(20,2), -10.00::numeric(20,2)) $$,
  'the close matches the hand calculation, with fees shown apart from cash'
);
-- Nina: revenue 96.67 + 96.67 + 300 = 493.34, commission 38.67 + 38.67 + 150 = 227.34, ₱20 in tips,
-- two visits. Omar: revenue 96.67 + 1,000 + 10.10 = 1,106.77, commission 24.17 + 250 + 2.53 = 276.70,
-- ₱10.50 in tips, two visits.
select results_eq(
  $$ select st.display_name, cs.service_revenue, cs.commission_amount, cs.tip_amount, cs.visit_count
     from public.daily_close_staff cs join public.staff st on st.id = cs.staff_id
     join public.daily_closes c on c.id = cs.daily_close_id
     where c.branch_id = pg_temp.fixture_id('branch') order by st.display_name $$,
  $$ values ('Nina', 493.34::numeric(20,2), 227.34::numeric(20,2), 20.00::numeric(20,2), 2),
            ('Omar', 1106.77, 276.70, 10.50, 2) $$,
  'commission and tips per staff member match the hand calculation'
);
select ok(
  exists (select 1 from public.activity_logs where action = 'daily_close.closed' and entity_type = 'daily_close'),
  'closing writes its activity row'
);

-- A closed day takes no new sales until the owner reopens it.
update public.bookings set status = 'in_service' where id = pg_temp.fixture_id('v4');
set local role authenticated;
select pg_temp.act_as('stylist_login');
select throws_ok(
  format($$ select public.complete_checkout(pg_temp.fixture_id('v4'), jsonb_build_array(%L::jsonb), 0, '[]',
       '[{"method": "cash", "amount": 50}]') $$, pg_temp.item('cut', 'Cut', 'omar', 50)),
  'GBD01', 'business_day_closed',
  'a closed day rejects a new sale'
);

-- ---------------------------------------------------------------------------
-- 7. Reopening
-- ---------------------------------------------------------------------------

select pg_temp.act_as('manager');
select throws_ok(
  $$ select public.reopen_day(pg_temp.fixture_id('branch'), pg_temp.business_date()) $$,
  'GBA02', 'not_permitted',
  'a manager cannot reopen a day'
);
select pg_temp.act_as('owner');
select lives_ok($$ select public.reopen_day(pg_temp.fixture_id('branch'), pg_temp.business_date()) $$, 'the owner reopens the day');
select pg_temp.act_as('stylist_login');
select lives_ok(
  format($$ select public.complete_checkout(pg_temp.fixture_id('v4'), jsonb_build_array(%L::jsonb), 0, '[]',
       '[{"method": "cash", "amount": 50}]') $$, pg_temp.item('cut', 'Cut', 'omar', 50)),
  'the reopened day takes the sale'
);
select pg_temp.act_as('owner');
select lives_ok(
  $$ select public.close_day(pg_temp.fixture_id('branch'), pg_temp.business_date(), 500, 1660.10) $$,
  'the owner closes it again'
);
select results_eq(
  $$ select gross_sales, cash_expected, cash_variance, reopened_at from public.daily_closes
     where branch_id = pg_temp.fixture_id('branch') and business_date = pg_temp.business_date() $$,
  $$ values (1660.11::numeric(20,2), 1660.10::numeric(20,2), 0.00::numeric(20,2), null::timestamptz) $$,
  'closing again recalculates the totals and clears the reopening'
);

-- ---------------------------------------------------------------------------
-- 8. Who reads sales and closes; merging moves sales
-- ---------------------------------------------------------------------------

select pg_temp.act_as('stylist_login');
select results_eq(
  $$ select booking_id from public.sales order by booking_id $$,
  $$ select id from fixture where key in ('v1', 'v4') order by id $$,
  'staff read the sales they completed, and only those'
);
select is(
  (select count(*)::integer from public.sale_items i join public.staff st on st.id = i.staff_id where st.display_name = 'Nina'),
  3,
  'staff read their own items on others'' sales too'
);
select is((select count(*)::integer from public.daily_closes), 0, 'staff do not read the daily close');
select throws_ok(
  $$ select * from public.get_daily_close_summary(pg_temp.fixture_id('branch'), pg_temp.business_date()) $$,
  'GBA02', 'not_permitted',
  'staff cannot open the close summary'
);
select pg_temp.act_as('manager');
select is((select count(*)::integer from public.sales where branch_id = pg_temp.fixture_id('branch')), 4, 'a manager reads every sale of the branch');

reset role;
update public.sales set client_id = pg_temp.fixture_id('client_b') where booking_id = pg_temp.fixture_id('v4');
set local role authenticated;
select pg_temp.act_as('owner');
select public.merge_clients(pg_temp.fixture_id('client_a'), pg_temp.fixture_id('client_b'));
reset role;
select is(
  (select client_id from public.sales where booking_id = pg_temp.fixture_id('v4')),
  pg_temp.fixture_id('client_a'),
  'merging clients moves the duplicate''s sales to the kept record'
);

select * from finish();
rollback;
