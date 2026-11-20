alter table public.payments add constraint payments_org_sale_payment_key
  unique (organization_id, sale_id, id);

create table public.collection_requests (
  organization_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  sale_id uuid not null,
  payment_id uuid not null unique,
  balance_after bigint not null check (balance_after >= 0),
  primary key (organization_id, actor_id, request_id),
  foreign key (organization_id, sale_id, payment_id)
    references public.payments (organization_id, sale_id, id)
);

alter table public.collection_requests enable row level security;
revoke all on public.collection_requests from public, anon, authenticated;

create or replace view public.payment_details with (security_invoker = true) as
select id, organization_id, sale_id, day, method, amount_minor::text as amount_minor,
       occurred_at, created_at
from public.payments;

create function public.collect_payment(
  p_org uuid, p_sale uuid, p_request uuid, p_currency text, p_method public.payment_method, p_amount_minor text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  zone text;
  sale public.sales%rowtype;
  payment public.payments%rowtype;
  request public.collection_requests%rowtype;
  minor bigint;
  remaining numeric;
  recorded_at timestamptz;
  collection_day date;
  replayed boolean;
begin
  if actor is null or coalesce(public.organization_role(p_org) in ('admin', 'manager'), false) = false then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  -- Match the organization-first locking protocol used by sales and membership changes.
  select timezone into zone from public.organizations where id = p_org for update;
  if coalesce(public.organization_role(p_org) in ('admin', 'manager'), false) = false then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_sale is null or p_request is null or p_method is null or p_currency is null
     or p_amount_minor is null or p_amount_minor !~ '^[0-9]{1,19}$' then
    raise exception using errcode = '22023', message = 'invalid_collection';
  end if;
  if p_amount_minor::numeric not between 1 and 9223372036854775807 then
    raise exception using errcode = '22023', message = 'invalid_collection';
  end if;
  minor := p_amount_minor::bigint;

  select * into request from public.collection_requests
    where organization_id = p_org and actor_id = actor and request_id = p_request;
  replayed := found;

  if replayed then
    select * into strict payment from public.payments
      where organization_id = p_org and sale_id = request.sale_id and id = request.payment_id;
    select * into strict sale from public.sales where organization_id = p_org and id = request.sale_id;
    if payment.sale_id <> p_sale or sale.currency <> p_currency
       or payment.method <> p_method or payment.amount_minor <> minor then
      raise exception using errcode = '23505', message = 'collection_conflict';
    end if;
    remaining := request.balance_after;
  else
    -- Currently every persisted sale is confirmed. A closed origin day remains collectible.
    select * into sale from public.sales where organization_id = p_org and id = p_sale for update;
    if not found then raise exception using errcode = '22023', message = 'sale_unavailable'; end if;
    if sale.currency <> p_currency then
      raise exception using errcode = '22023', message = 'currency_mismatch';
    end if;

    select sale.total_minor - coalesce(sum(amount_minor), 0) into remaining
      from public.payments where organization_id = p_org and sale_id = p_sale;
    if minor > remaining then
      raise exception using errcode = '22023', message = 'insufficient_balance';
    end if;

    recorded_at := clock_timestamp();
    collection_day := (recorded_at at time zone zone)::date;
    if collection_day < sale.day then
      raise exception using errcode = '22023', message = 'invalid_collection_day';
    end if;
    insert into public.operating_days (organization_id, day) values (p_org, collection_day) on conflict do nothing;
    perform 1 from public.operating_days
      where organization_id = p_org and day = collection_day and closed_at is null for update;
    if not found then raise exception using errcode = '22023', message = 'collection_day_closed'; end if;

    insert into public.payments (organization_id, sale_id, day, method, amount_minor, actor_id, occurred_at, created_at)
      values (p_org, p_sale, collection_day, p_method, minor, actor, recorded_at, recorded_at)
      returning * into payment;

    remaining := remaining - minor;
    insert into public.collection_requests (organization_id, actor_id, request_id, sale_id, payment_id, balance_after)
      values (p_org, actor, p_request, p_sale, payment.id, remaining::bigint);

    insert into public.audit_events (organization_id, actor_id, action, entity_id, details)
      values (p_org, actor, 'payment_collected', payment.id,
              jsonb_build_object('sale_id', p_sale, 'request_id', p_request, 'day', collection_day,
                'method', p_method, 'amount_minor', minor::text, 'currency', sale.currency,
                'balance_minor', remaining::text));
  end if;

  return jsonb_build_object('payment_id', payment.id, 'sale_id', sale.id, 'day', payment.day,
    'amount_minor', payment.amount_minor::text, 'balance_minor', remaining::text, 'replayed', replayed);
end;
$$;

revoke all on function public.collect_payment(uuid, uuid, uuid, text, public.payment_method, text) from public, anon, authenticated;
grant execute on function public.collect_payment(uuid, uuid, uuid, text, public.payment_method, text) to authenticated;
