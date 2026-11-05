-- Phase 2: shop setup. Branch closures and photos, the service catalogue and branch offerings,
-- staff profiles with branches, services, shifts, and time off, invites linked to a staff
-- profile, branch creation, terms acceptance, the publishing checklist view, and storage.

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

-- An invite can carry the staff profile the invitee will be linked to.
alter table public.organization_invites add column staff_id uuid;
alter table public.organization_invites
  add foreign key (staff_id, organization_id) references public.staff (id, organization_id);

-- ---------------------------------------------------------------------------
-- Triggers
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
-- Row-level security
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
-- Functions
-- ---------------------------------------------------------------------------

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

create or replace function public.create_organization(
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

drop function public.create_invite(uuid, public.member_role, uuid[]);

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

create or replace function public.accept_invite(p_code text)
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

-- ---------------------------------------------------------------------------
-- Privileges
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
  public.create_invite(uuid, public.member_role, uuid[], uuid),
  public.save_staff_profile(uuid, text, numeric, boolean, boolean, uuid[], jsonb, uuid, text, text, uuid),
  public.set_branch_hours(uuid, jsonb)
from public, anon, authenticated;
grant execute on function
  public.create_branch(uuid, text, text, text, text, jsonb),
  public.accept_terms(uuid),
  public.create_invite(uuid, public.member_role, uuid[], uuid),
  public.save_staff_profile(uuid, text, numeric, boolean, boolean, uuid[], jsonb, uuid, text, text, uuid),
  public.set_branch_hours(uuid, jsonb)
to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
-- Paths: shop-media {organization_id}/logo/{file}, {organization_id}/branches/{branch_id}/{file},
-- {organization_id}/staff/{staff_id}/{file}; payment-qr {organization_id}/{branch_id}/{file}.
-- Both buckets are public to read. 5 MB, images only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('shop-media', 'shop-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-qr', 'payment-qr', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

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
