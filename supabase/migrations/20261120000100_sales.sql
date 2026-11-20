create type public.payment_method as enum ('cash', 'transfer', 'card');

create table public.operating_days (
  organization_id uuid not null references public.organizations,
  day date not null,
  closed_at timestamptz,
  primary key (organization_id, day)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  day date not null,
  currency text not null,
  scale smallint not null,
  total_minor bigint not null check (total_minor > 0),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (organization_id, id),
  foreign key (organization_id, day) references public.operating_days,
  foreign key (organization_id, currency, scale) references public.organizations (id, currency, scale)
);
create index sales_by_org_date on public.sales (organization_id, created_at desc, id);

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  product_id uuid not null,
  price_id uuid not null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 1000),
  unit_minor bigint not null check (unit_minor > 0),
  unique (organization_id, sale_id, product_id),
  foreign key (organization_id, sale_id) references public.sales (organization_id, id),
  foreign key (organization_id, product_id, price_id) references public.product_prices (organization_id, product_id, id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  day date not null,
  method public.payment_method not null,
  amount_minor bigint not null check (amount_minor > 0),
  actor_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, day) references public.operating_days,
  foreign key (organization_id, sale_id) references public.sales (organization_id, id)
);
create index payments_by_sale on public.payments (organization_id, sale_id);

create table public.sale_requests (
  organization_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  payload jsonb not null,
  sale_id uuid not null,
  primary key (organization_id, actor_id, request_id),
  foreign key (organization_id, sale_id) references public.sales (organization_id, id)
);

alter table public.operating_days enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
alter table public.payments enable row level security;
alter table public.sale_requests enable row level security;
revoke all on public.operating_days, public.sales, public.sale_lines, public.payments, public.sale_requests from public, anon, authenticated;
grant select on public.operating_days, public.sales, public.sale_lines, public.payments to authenticated;

create policy days_read on public.operating_days for select to authenticated using (public.organization_role(organization_id) is not null);
create policy sales_read on public.sales for select to authenticated using (public.organization_role(organization_id) is not null);
create policy lines_read on public.sale_lines for select to authenticated using (public.organization_role(organization_id) is not null);
create policy payments_read on public.payments for select to authenticated using (public.organization_role(organization_id) is not null);

create view public.sales_overview with (security_invoker = true) as
select s.id, s.organization_id, s.day, s.created_at, s.currency, s.scale, s.total_minor::text as total_minor,
       p.paid::text as paid_minor, (s.total_minor - p.paid)::text as balance_minor
from public.sales s
cross join lateral (
  select coalesce(sum(amount_minor), 0) as paid from public.payments where (organization_id, sale_id) = (s.organization_id, s.id)
) p;
create view public.sale_line_details with (security_invoker = true) as
select id, organization_id, sale_id, product_name, quantity, unit_minor::text as unit_minor from public.sale_lines;
create view public.payment_details with (security_invoker = true) as
select id, organization_id, sale_id, day, method, amount_minor::text as amount_minor from public.payments;

revoke all on public.sales_overview, public.sale_line_details, public.payment_details from public, anon, authenticated;
grant select on public.sales_overview, public.sale_line_details, public.payment_details to authenticated;

create function public.dashboard_summary(p_org uuid) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('sale_count', count(*)::text, 'total_minor', coalesce(sum(total_minor::numeric), 0)::text,
    'paid_minor', coalesce(sum(paid_minor::numeric), 0)::text, 'balance_minor', coalesce(sum(balance_minor::numeric), 0)::text)
  from public.sales_overview where organization_id = p_org
  having public.organization_role(p_org) in ('admin', 'manager');
$$;

create function public.confirm_sale(p_org uuid, p_request uuid, p_lines jsonb, p_payments jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  org public.organizations%rowtype;
  existing public.sale_requests%rowtype;
  payload jsonb;
  item jsonb;
  day_of_sale date;
  recorded_at timestamptz;
  sale_id uuid;
  total numeric := 0;
  paid numeric := 0;
  unit_price bigint;
begin
  if public.organization_role(p_org) is null then raise exception using errcode = '42501', message = 'forbidden'; end if;
  -- Serialize organizational writes at demo volume. A follow-up can narrow locks to the relevant day and sale.
  select * into org from public.organizations where id = p_org for update;
  if public.organization_role(p_org) is null then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_request is null or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_typeof(p_payments) is distinct from 'array'
    or octet_length(p_lines::text) + octet_length(p_payments::text) > 20000 then
    raise exception using errcode = '22023', message = 'invalid_sale';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 50 or jsonb_array_length(p_payments) > 10 then
    raise exception using errcode = '22023', message = 'invalid_sale';
  end if;

  payload := jsonb_build_object('lines', p_lines, 'payments', p_payments);
  select * into existing from public.sale_requests
    where organization_id = p_org and actor_id = actor and request_id = p_request;
  if found then
    if existing.payload is distinct from payload then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return existing.sale_id;
  end if;

  if (select count(distinct value->>'product_id') from jsonb_array_elements(p_lines)) <> jsonb_array_length(p_lines) then
    raise exception using errcode = '22023', message = 'invalid_sale';
  end if;
  for item in select value from jsonb_array_elements(p_lines) loop
    if coalesce(item->>'quantity', '') !~ '^[1-9][0-9]{0,3}$'
      or (item->>'quantity')::integer > 1000
      or item->>'price_id' is null then
      raise exception using errcode = '22023', message = 'invalid_sale';
    end if;
    select price.amount_minor into unit_price from public.products product
      join public.product_prices price on (price.organization_id, price.product_id) = (product.organization_id, product.id)
      where product.organization_id = p_org and product.id = (item->>'product_id')::uuid
        and product.active and price.ended_at is null and price.id = (item->>'price_id')::uuid;
    if not found then raise exception using errcode = '22023', message = 'catalog_changed'; end if;
    total := total + unit_price::numeric * (item->>'quantity')::integer;
  end loop;

  for item in select value from jsonb_array_elements(p_payments) loop
    if coalesce(item->>'amount_minor', '') !~ '^[1-9][0-9]{0,18}$'
      or coalesce(item->>'method', '') not in ('cash', 'transfer', 'card') then
      raise exception using errcode = '22023', message = 'invalid_payment';
    end if;
    paid := paid + (item->>'amount_minor')::numeric;
  end loop;
  if total > 9223372036854775807 then raise exception using errcode = '22003', message = 'invalid_total'; end if;
  if paid > total then raise exception using errcode = '22023', message = 'overpayment'; end if;

  recorded_at := clock_timestamp();
  day_of_sale := (recorded_at at time zone org.timezone)::date;
  insert into public.operating_days (organization_id, day) values (p_org, day_of_sale) on conflict do nothing;
  perform 1 from public.operating_days where organization_id = p_org and day = day_of_sale and closed_at is null for update;
  if not found then raise exception using errcode = '22023', message = 'day_closed'; end if;

  insert into public.sales (organization_id, day, currency, scale, total_minor, actor_id, created_at)
    values (p_org, day_of_sale, org.currency, org.scale, total::bigint, actor, recorded_at) returning id into sale_id;
  insert into public.sale_lines (organization_id, sale_id, product_id, price_id, product_name, quantity, unit_minor)
    select p_org, sale_id, p.id, price.id, p.name, (line.value->>'quantity')::integer, price.amount_minor
    from jsonb_array_elements(p_lines) as line(value)
    join public.products p on p.organization_id = p_org and p.id = (line.value->>'product_id')::uuid
    join public.product_prices price on price.organization_id = p_org and price.id = (line.value->>'price_id')::uuid;
  insert into public.payments (organization_id, sale_id, day, method, amount_minor, actor_id, occurred_at, created_at)
    select p_org, sale_id, day_of_sale, (payment.value->>'method')::public.payment_method,
           (payment.value->>'amount_minor')::bigint, actor, recorded_at, recorded_at
    from jsonb_array_elements(p_payments) as payment(value);
  insert into public.sale_requests values (p_org, actor, p_request, payload, sale_id);
  insert into public.audit_events (organization_id, actor_id, action, entity_id, details)
    values (p_org, actor, 'sale_confirmed', sale_id,
            jsonb_build_object('total_minor', total::text, 'paid_minor', paid::text, 'request_id', p_request));
  return sale_id;
end;
$$;

revoke all on function public.confirm_sale(uuid, uuid, jsonb, jsonb), public.dashboard_summary(uuid) from public, anon, authenticated;
grant execute on function public.confirm_sale(uuid, uuid, jsonb, jsonb), public.dashboard_summary(uuid) to authenticated;
