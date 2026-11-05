-- Simultaneous bookings for one slot: exactly one succeeds.
--
-- pgTAP runs in one session, so the competing bookings come from separate connections opened with
-- dblink and sent at once with dblink_send_query. They commit for real (the overlap guard only
-- decides between committed or in-flight rows), so the test removes its own rows at the end.
--
-- Ways this could fail, each covered below:
--  1. Two callers both see the slot free and both insert: the overlap guard must refuse all but one.
--  2. A losing caller gets a raw constraint error instead of the coded slot_unavailable.
--  3. With "any available", a caller who loses one staff member is refused although another
--     qualifying staff member is still free, or two callers land on the same staff member.

begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(6);

-- dblink refuses password-less connections for non-superusers, and loopback connections are
-- trusted, so the racers connect to the address `supabase test db` itself reached the server on.
create function pg_temp.connection_string() returns text language sql stable as $$
  select format('host=%s port=5432 dbname=postgres user=postgres password=postgres', host(inet_server_addr()));
$$;

create temporary table racer (id uuid primary key, connection_name text not null);
insert into racer (id, connection_name)
select gen_random_uuid(), 'racer_' || n from generate_series(1, 6) as n;

-- A Makati business date on which Jenny and Carlo are both free for a haircut at 11:00 AM and
-- Carlo at 12:00 PM.
create temporary table race_slot as
select day::date as business_date,
  (day::date + time '11:00') at time zone 'Asia/Manila' as any_start_at,
  (day::date + time '12:00') at time zone 'Asia/Manila' as carlo_start_at
from generate_series(
  private.business_date(now(), 'Asia/Manila', '05:00') + 3,
  private.business_date(now(), 'Asia/Manila', '05:00') + 20,
  interval '1 day'
) as day
where (
    select count(*)
    from (values ('70000000-0000-0000-0000-000000000001'::uuid), ('70000000-0000-0000-0000-000000000002'::uuid)) as candidate (staff_id)
    cross join lateral public.get_available_slots('30000000-0000-0000-0000-000000000001', day::date,
      array['60000000-0000-0000-0000-000000000003'::uuid], candidate.staff_id) s
    where s.start_at in ((day::date + time '11:00') at time zone 'Asia/Manila', (day::date + time '12:00') at time zone 'Asia/Manila')
  ) = 4
order by day
limit 1;

-- Removes everything racers committed, including any left by an earlier run that stopped midway.
create function pg_temp.remove_racers() returns void language sql as $$
  select extensions.dblink_exec(
    'setup',
    $cleanup$
      create temporary table leftover_racer on commit drop as
        select id from auth.users where raw_user_meta_data ->> 'concurrency_test' = 'true';
      delete from public.notifications where entity_id in (
        select b.id from public.bookings b join leftover_racer r on r.id = b.booked_by);
      delete from public.activity_logs where entity_id in (
        select b.id from public.bookings b join leftover_racer r on r.id = b.booked_by);
      delete from public.booking_services where booking_id in (
        select b.id from public.bookings b join leftover_racer r on r.id = b.booked_by);
      delete from public.bookings where booked_by in (select id from leftover_racer);
      delete from public.clients where user_id in (select id from leftover_racer);
      delete from auth.users where id in (select id from leftover_racer);
    $cleanup$
  );
$$;

-- The setup and cleanup connection commits the racers' accounts, which the other connections must see.
select extensions.dblink_connect('setup', pg_temp.connection_string());
select pg_temp.remove_racers();
select extensions.dblink_exec(
  'setup',
  format(
    'insert into auth.users (id, is_anonymous, raw_user_meta_data) select unnest(%L::uuid[]), true, ''{"concurrency_test": true}''',
    (select array_agg(id) from racer)
  )
);

create function pg_temp.race(p_staff_id uuid, p_start_at timestamptz)
returns table (successes integer, coded_refusals integer)
language plpgsql as $$
declare
  v_racer record;
  v_successes integer := 0;
  v_coded_refusals integer := 0;
  v_rows integer;
begin
  for v_racer in select id, connection_name from racer order by connection_name loop
    perform extensions.dblink_connect(v_racer.connection_name, pg_temp.connection_string());
    perform extensions.dblink_exec(v_racer.connection_name, 'set role authenticated');
    perform extensions.dblink_exec(
      v_racer.connection_name,
      format(
        'set request.jwt.claims to %L',
        json_build_object('sub', v_racer.id, 'role', 'authenticated', 'is_anonymous', true)::text
      )
    );
  end loop;

  -- Every racer is connected and ready; now send all six at once.
  for v_racer in select connection_name from racer order by connection_name loop
    perform extensions.dblink_send_query(
      v_racer.connection_name,
      format(
        'select booking_id from public.create_online_booking(%L, %L, %L, %L, %L, %L, %L)',
        '30000000-0000-0000-0000-000000000001', '{60000000-0000-0000-0000-000000000003}', p_start_at, 'Racer',
        '0917 000 0000', '2026-11-05', p_staff_id
      )
    );
  end loop;

  for v_racer in select connection_name from racer order by connection_name loop
    select count(*) into v_rows
    from extensions.dblink_get_result(v_racer.connection_name, false) as result (booking_id uuid);
    if v_rows = 1 then
      v_successes := v_successes + 1;
    elsif extensions.dblink_error_message(v_racer.connection_name) like '%slot_unavailable%' then
      v_coded_refusals := v_coded_refusals + 1;
    end if;
    perform extensions.dblink_disconnect(v_racer.connection_name);
  end loop;

  return query select v_successes, v_coded_refusals;
end;
$$;

select isnt((select business_date from race_slot), null, 'a free slot was found to race for');

-- 1–2. Six callers for Carlo at 12:00 PM
create temporary table carlo_race as select * from pg_temp.race('70000000-0000-0000-0000-000000000002', (select carlo_start_at from race_slot));
select is((select successes from carlo_race), 1, 'exactly one of six simultaneous bookings for one staff member and time succeeds');
select is((select coded_refusals from carlo_race), 5, 'the other five are refused with slot_unavailable');

-- 3. Six callers for "any available" at 11:00 AM, when Jenny and Carlo both qualify
create temporary table any_race as select * from pg_temp.race(null, (select any_start_at from race_slot));
select is((select successes from any_race), 2, 'with "any available", one booking succeeds per qualifying staff member');
select is((select coded_refusals from any_race), 4, 'the rest are refused with slot_unavailable');
select is(
  (select count(distinct staff_id)::integer from public.bookings where booked_by in (select id from racer)
     and start_at = (select any_start_at from race_slot)),
  2,
  'the two "any available" bookings went to different staff members'
);

select pg_temp.remove_racers();
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
