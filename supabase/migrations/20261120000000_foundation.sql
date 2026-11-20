create type public.member_role as enum ('admin', 'manager', 'operator');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  scale smallint not null check (scale between 0 and 6),
  timezone text not null,
  unique (id, currency, scale)
);

create table public.memberships (
  organization_id uuid not null references public.organizations,
  user_id uuid not null references auth.users on delete cascade,
  role public.member_role not null,
  active boolean not null default true,
  primary key (organization_id, user_id)
);
create index memberships_by_user on public.memberships (user_id, organization_id) where active;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations,
  name text not null check (length(btrim(name)) between 1 and 100),
  active boolean not null default true,
  unique (organization_id, id)
);
create index products_by_org on public.products (organization_id, name);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_id uuid not null,
  currency text not null,
  scale smallint not null,
  amount_minor bigint not null check (amount_minor > 0),
  effective_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz check (ended_at >= effective_at),
  unique (organization_id, product_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  foreign key (organization_id, currency, scale) references public.organizations (id, currency, scale)
);
create unique index product_current_price on public.product_prices (organization_id, product_id) where ended_at is null;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations,
  actor_id uuid not null,
  action text not null,
  entity_id uuid not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create index audit_by_org on public.audit_events (organization_id, created_at);

create function public.organization_role(p_org uuid) returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select role from public.memberships
  where organization_id = p_org and user_id = (select auth.uid()) and active;
$$;

revoke all on function public.organization_role(uuid) from public, anon, authenticated;
grant execute on function public.organization_role(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.organizations, public.memberships, public.products, public.product_prices, public.audit_events from public, anon, authenticated;
grant select on public.organizations, public.memberships, public.products, public.product_prices, public.audit_events to authenticated;

create policy organizations_read on public.organizations for select to authenticated
  using (public.organization_role(id) is not null);
create policy memberships_read on public.memberships for select to authenticated
  using (public.organization_role(organization_id) = 'admin' or (active and user_id = (select auth.uid())));
create policy products_read on public.products for select to authenticated
  using (public.organization_role(organization_id) is not null);
create policy prices_read on public.product_prices for select to authenticated
  using (public.organization_role(organization_id) is not null);
create policy audit_read on public.audit_events for select to authenticated
  using (public.organization_role(organization_id) in ('admin', 'manager'));

create view public.catalog with (security_invoker = true) as
select p.id, p.organization_id, p.name, p.active, pp.id as price_id, pp.amount_minor::text as amount_minor
from public.products p join public.product_prices pp
  on (p.organization_id, p.id) = (pp.organization_id, pp.product_id)
where pp.ended_at is null;
revoke all on public.catalog from public, anon, authenticated;
grant select on public.catalog to authenticated;

create view public.catalog_price_history with (security_invoker = true) as
select id, organization_id, product_id, currency, scale, amount_minor::text as amount_minor, effective_at, ended_at
from public.product_prices;
revoke all on public.catalog_price_history from public, anon, authenticated;
grant select on public.catalog_price_history to authenticated;

create function public.save_product(p_org uuid, p_id uuid, p_name text, p_amount text, p_active boolean) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  org public.organizations%rowtype;
  current_price bigint;
  at_time timestamptz;
begin
  if public.organization_role(p_org) is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into org from public.organizations where id = p_org for update;
  if public.organization_role(p_org) is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 100
     or p_amount is null or p_amount !~ '^[1-9][0-9]{0,18}$' or p_active is null then
    raise exception using errcode = '22023', message = 'invalid_product';
  end if;
  if p_id is null then
    insert into public.products (organization_id, name, active) values (p_org, btrim(p_name), p_active) returning id into p_id;
  else
    update public.products set name = btrim(p_name), active = p_active where organization_id = p_org and id = p_id;
    if not found then raise exception using errcode = '22023', message = 'invalid_product'; end if;
  end if;
  select amount_minor into current_price from public.product_prices
    where organization_id = p_org and product_id = p_id and ended_at is null;
  if current_price is distinct from p_amount::bigint then
    at_time := clock_timestamp();
    update public.product_prices set ended_at = at_time where organization_id = p_org and product_id = p_id and ended_at is null;
    insert into public.product_prices (organization_id, product_id, currency, scale, amount_minor, effective_at)
      values (p_org, p_id, org.currency, org.scale, p_amount::bigint, at_time);
  end if;
  insert into public.audit_events (organization_id, actor_id, action, entity_id, details)
    values (p_org, auth.uid(), 'product_saved', p_id, jsonb_build_object('name', btrim(p_name), 'price_minor', p_amount, 'active', p_active));
  return p_id;
end;
$$;

create function public.update_organization(p_org uuid, p_name text, p_timezone text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.organization_role(p_org) is distinct from 'admin' then raise exception using errcode = '42501', message = 'forbidden'; end if;
  perform 1 from public.organizations where id = p_org for update;
  if public.organization_role(p_org) is distinct from 'admin' then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 100
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception using errcode = '22023', message = 'invalid_organization';
  end if;
  update public.organizations set name = btrim(p_name), timezone = p_timezone where id = p_org;
  insert into public.audit_events (organization_id, actor_id, action, entity_id, details)
    values (p_org, auth.uid(), 'organization_updated', p_org, jsonb_build_object('name', btrim(p_name), 'timezone', p_timezone));
end;
$$;

create function public.set_membership(p_org uuid, p_user uuid, p_role public.member_role, p_active boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.organization_role(p_org) is distinct from 'admin' then raise exception using errcode = '42501', message = 'forbidden'; end if;
  perform 1 from public.organizations where id = p_org for update;
  if public.organization_role(p_org) is distinct from 'admin' then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception using errcode = '22023', message = 'invalid_member';
  end if;
  if (p_role <> 'admin' or not p_active) and not exists (
    select 1 from public.memberships where organization_id = p_org and user_id <> p_user and active and role = 'admin'
  ) and exists (
    select 1 from public.memberships where organization_id = p_org and user_id = p_user and active and role = 'admin'
  ) then
    raise exception using errcode = '22023', message = 'last_admin';
  end if;
  insert into public.memberships (organization_id, user_id, role, active)
    values (p_org, p_user, p_role, p_active)
    on conflict (organization_id, user_id) do update set role = excluded.role, active = excluded.active;
  insert into public.audit_events (organization_id, actor_id, action, entity_id, details)
    values (p_org, auth.uid(), 'membership_updated', p_user, jsonb_build_object('role', p_role, 'active', p_active));
end;
$$;

revoke all on function public.save_product(uuid, uuid, text, text, boolean), public.update_organization(uuid, text, text),
  public.set_membership(uuid, uuid, public.member_role, boolean) from public, anon, authenticated;
grant execute on function public.save_product(uuid, uuid, text, text, boolean), public.update_organization(uuid, text, text),
  public.set_membership(uuid, uuid, public.member_role, boolean) to authenticated;
