alter table public.operating_days add column closing_requested_at timestamptz;
create index sales_by_operating_day on public.sales (organization_id, day);
create index payments_by_operating_day on public.payments (organization_id, day);

create table public.day_closures (
  organization_id uuid not null,
  day date not null,
  id uuid not null default gen_random_uuid() unique,
  version integer not null default 1 check (version = 1),
  actor_id uuid not null,
  closed_at timestamptz not null,
  currency text not null,
  scale smallint not null,
  review_version text not null,
  metrics jsonb not null,
  cash_counted_minor bigint check (cash_counted_minor >= 0),
  cash_difference_minor bigint,
  primary key (organization_id, day),
  foreign key (organization_id, day) references public.operating_days,
  foreign key (organization_id, currency, scale) references public.organizations (id, currency, scale),
  check ((cash_counted_minor is null) = (cash_difference_minor is null))
);

alter table public.payments add constraint payments_org_id_key unique (organization_id, id);

create type public.evidence_status as enum ('pending', 'verified', 'discrepancy');
create table public.payment_evidence (
  organization_id uuid not null,
  payment_id uuid not null,
  kind text not null check (kind in ('transfer', 'card', 'receipt')),
  reference text not null check (length(btrim(reference)) between 1 and 120),
  amount_minor bigint not null check (amount_minor > 0),
  status public.evidence_status not null,
  reviewer_id uuid,
  reviewed_at timestamptz,
  notes text not null check (length(notes) <= 500),
  primary key (organization_id, payment_id),
  foreign key (organization_id, payment_id) references public.payments (organization_id, id),
  check ((status = 'pending') = (reviewer_id is null and reviewed_at is null)),
  check ((reviewer_id is null) = (reviewed_at is null)),
  check (status <> 'discrepancy' or length(btrim(notes)) > 0)
);

alter table public.day_closures enable row level security;
alter table public.payment_evidence enable row level security;
revoke all on public.day_closures, public.payment_evidence from public, anon, authenticated;
grant select on public.day_closures, public.payment_evidence to authenticated;

create policy closures_read on public.day_closures for select to authenticated
  using (public.organization_role(organization_id) in ('admin', 'manager'));
create policy payment_evidence_read on public.payment_evidence for select to authenticated
  using (public.organization_role(organization_id) in ('admin', 'manager'));

create function public.operations_metrics(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare metrics jsonb;
begin
  if not coalesce(public.organization_role(p_org) in ('admin', 'manager'), false) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
     or p_to < p_from then
    raise exception using errcode = '22023', message = 'invalid_period';
  end if;

  if p_to - p_from > 365 then
    raise exception using errcode = '22023', message = 'invalid_period';
  end if;

  with period_payments as (
    select p.amount_minor, p.method, p.day, s.day as sale_day, e.status
      from public.payments p
      join public.sales s on (p.organization_id, p.sale_id) = (s.organization_id, s.id)
      left join public.payment_evidence e on (p.organization_id, p.id) = (e.organization_id, e.payment_id)
      where p.organization_id = p_org and p.day between p_from and p_to
  ),
  sales_totals as (
    select count(*) as quantity, coalesce(sum(total_minor), 0) as total
      from public.sales where organization_id = p_org and day between p_from and p_to
  ),
  balances as (
    select
      (select coalesce(sum(total_minor), 0) from public.sales where organization_id = p_org and day <= p_to)
      - (select coalesce(sum(amount_minor), 0) from public.payments where organization_id = p_org and day <= p_to) as total
  ),
  day_counts as (
    select count(*) filter (where closed_at is null and closing_requested_at is null) as opened,
           count(*) filter (where closed_at is null and closing_requested_at is not null) as pending,
           count(*) filter (where closed_at is not null) as closed
      from public.operating_days where organization_id = p_org and day between p_from and p_to
  )
  select jsonb_build_object(
    'sale_count', (select quantity from sales_totals)::text,
    'sales_minor', (select total from sales_totals)::text,
    'payment_count', count(*)::text,
    'collected_minor', coalesce(sum(amount_minor), 0)::text,
    'prior_sales_minor', coalesce(sum(amount_minor) filter (where sale_day < day), 0)::text,
    'outstanding_minor', (select total from balances)::text,
    'cash_minor', coalesce(sum(amount_minor) filter (where method = 'cash'), 0)::text,
    'methods', coalesce((
      select jsonb_agg(jsonb_build_object('method', method, 'amount_minor', amount::text) order by method)
      from (select method, sum(amount_minor) as amount from period_payments group by method) totals
    ), '[]'::jsonb),
    'unverified_count', count(*) filter (where status is distinct from 'verified')::text,
    'discrepancy_count', count(*) filter (where status = 'discrepancy')::text,
    'evidence_count', count(status)::text,
    'verified_minor', coalesce(sum(amount_minor) filter (where status = 'verified'), 0)::text,
    'open_days', (select opened from day_counts)::text,
    'pending_days', (select pending from day_counts)::text,
    'closed_days', (select closed from day_counts)::text
  ) into metrics from period_payments;
  return metrics;
end;
$$;

create function public.day_review(p_org uuid, p_day date) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  metrics jsonb := public.operations_metrics(p_org, p_day, p_day);
  state text;
  snapshot jsonb;
begin
  select case when d.closed_at is not null then 'closed'
      when d.closing_requested_at is not null then 'pending' else 'open' end,
    case when c.id is not null then to_jsonb(c) || jsonb_build_object(
      'cash_counted_minor', c.cash_counted_minor::text, 'cash_difference_minor', c.cash_difference_minor::text) end
  into state, snapshot
  from public.operating_days d left join public.day_closures c using (organization_id, day)
  where d.organization_id = p_org and d.day = p_day;

  return jsonb_build_object('state', coalesce(state, 'open'), 'exists', found, 'snapshot', snapshot,
    'metrics', metrics, 'review_version', md5(metrics::text));
end;
$$;

-- Writers acquire the same organization lock used by sale confirmation and later collection.
-- Authorization is checked again after waiting so a concurrent revocation takes effect.
create function public.lock_operations(p_org uuid) returns public.organizations
language plpgsql volatile security invoker set search_path = ''
as $$
declare org public.organizations;
begin
  if not coalesce(public.organization_role(p_org) in ('admin', 'manager'), false) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into org from public.organizations where id = p_org for update;
  if not coalesce(public.organization_role(p_org) in ('admin', 'manager'), false) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  return org;
end;
$$;

create function public.start_day_close(p_org uuid, p_day date) returns void
language plpgsql security definer set search_path = ''
as $$
declare org public.organizations := public.lock_operations(p_org);
begin
  if p_day is null or not isfinite(p_day) or p_day > (clock_timestamp() at time zone org.timezone)::date then
    raise exception using errcode = '22023', message = 'invalid_operating_day';
  end if;
  insert into public.operating_days (organization_id, day, closing_requested_at)
    values (p_org, p_day, clock_timestamp())
    on conflict (organization_id, day) do update set closing_requested_at = excluded.closing_requested_at
    where public.operating_days.closed_at is null and public.operating_days.closing_requested_at is null;
  if found then
    insert into public.audit_events (organization_id, actor_id, action, entity_id, details)
      values (p_org, auth.uid(), 'day_review_started', p_org, jsonb_build_object('day', p_day));
  end if;
end;
$$;

create function public.complete_day_close(p_org uuid, p_day date, p_review text, p_cash_counted text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  org public.organizations := public.lock_operations(p_org);
  existing uuid;
  report jsonb;
  counted bigint;
  expected numeric;
  closed_at_time timestamptz;
  closed_id uuid;
begin
  select id into existing from public.day_closures where organization_id = p_org and day = p_day;
  if found then return existing; end if;

  if p_day is null or not isfinite(p_day) or p_day > (clock_timestamp() at time zone org.timezone)::date then
    raise exception using errcode = '22023', message = 'invalid_operating_day';
  end if;
  perform 1 from public.operating_days
    where organization_id = p_org and day = p_day and closed_at is null and closing_requested_at is not null for update;
  if not found then raise exception using errcode = '22023', message = 'day_not_reviewable'; end if;

  report := public.operations_metrics(p_org, p_day, p_day);
  if md5(report::text) is distinct from p_review then
    raise exception using errcode = '22023', message = 'review_changed';
  end if;
  expected := (report->>'cash_minor')::numeric;
  if p_cash_counted is not null then
    if p_cash_counted !~ '^[0-9]{1,19}$' then
      raise exception using errcode = '22023', message = 'invalid_cash_count';
    end if;
    if p_cash_counted::numeric > 9223372036854775807
       or expected - p_cash_counted::numeric > 9223372036854775807 then
      raise exception using errcode = '22023', message = 'invalid_cash_count';
    end if;
    counted := p_cash_counted::bigint;
  end if;

  closed_at_time := clock_timestamp();
  update public.operating_days set closed_at = closed_at_time where organization_id = p_org and day = p_day;
  insert into public.day_closures (organization_id, day, actor_id, closed_at, currency, scale, review_version, metrics, cash_counted_minor, cash_difference_minor)
    values (p_org, p_day, auth.uid(), closed_at_time, org.currency, org.scale, p_review, report, counted, counted - expected)
    returning id into closed_id;
  insert into public.audit_events (organization_id, actor_id, action, entity_id, details)
    values (p_org, auth.uid(), 'day_closed', closed_id, jsonb_build_object('day', p_day, 'review_version', p_review));
  return closed_id;
end;
$$;

create view public.reconciliation_payments with (security_invoker = true) as
select p.organization_id, p.id, p.sale_id, p.day, p.method, p.amount_minor, p.created_at,
       e.kind, e.reference, e.amount_minor::text as evidence_minor,
       coalesce(e.status::text, 'missing') as status, e.reviewer_id, e.reviewed_at, e.notes
from public.payment_details p
left join public.payment_evidence e on (p.organization_id, p.id) = (e.organization_id, e.payment_id)
where public.organization_role(p.organization_id) in ('admin', 'manager');

revoke all on public.reconciliation_payments from public, anon, authenticated;
grant select on public.reconciliation_payments to authenticated;

create function public.save_payment_evidence(p_org uuid, p_payment uuid, p_kind text, p_reference text, p_amount text, p_status public.evidence_status, p_notes text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  payment_amount bigint;
  document_amount bigint;
  previous public.payment_evidence;
  saved public.payment_evidence;
begin
  perform public.lock_operations(p_org);
  select amount_minor into payment_amount from public.payments where organization_id = p_org and id = p_payment;
  if not found then raise exception using errcode = '22023', message = 'payment_unavailable'; end if;

  if p_kind is null or p_kind not in ('transfer', 'card', 'receipt') or p_reference is null
     or length(btrim(p_reference)) not between 1 and 120 or p_status is null or p_notes is null or length(p_notes) > 500
     or (p_status = 'discrepancy' and length(btrim(p_notes)) = 0)
     or p_amount is null or p_amount !~ '^[1-9][0-9]{0,18}$' then
    raise exception using errcode = '22023', message = 'invalid_evidence';
  end if;
  if p_amount::numeric > 9223372036854775807 then
    raise exception using errcode = '22023', message = 'invalid_evidence';
  end if;
  document_amount := p_amount::bigint;
  if p_status = 'verified' and document_amount <> payment_amount then
    raise exception using errcode = '22023', message = 'evidence_amount_mismatch';
  end if;

  select * into previous from public.payment_evidence where organization_id = p_org and payment_id = p_payment;
  insert into public.payment_evidence (organization_id, payment_id, kind, reference, amount_minor, status, reviewer_id, reviewed_at, notes)
    values (p_org, p_payment, p_kind, btrim(p_reference), document_amount, p_status,
      case when p_status <> 'pending' then auth.uid() end,
      case when p_status <> 'pending' then clock_timestamp() end, btrim(p_notes))
    on conflict (organization_id, payment_id) do update set kind = excluded.kind, reference = excluded.reference,
      amount_minor = excluded.amount_minor, status = excluded.status, reviewer_id = excluded.reviewer_id,
      reviewed_at = excluded.reviewed_at, notes = excluded.notes
    returning * into saved;
  insert into public.audit_events (organization_id, actor_id, action, entity_id, details)
    values (p_org, auth.uid(), 'payment_evidence_reviewed', p_payment, jsonb_build_object(
      'before', to_jsonb(previous) || jsonb_build_object('amount_minor', previous.amount_minor::text),
      'after', to_jsonb(saved) || jsonb_build_object('amount_minor', saved.amount_minor::text)));
end;
$$;

revoke all on function public.operations_metrics(uuid,date,date), public.day_review(uuid,date), public.lock_operations(uuid),
  public.start_day_close(uuid,date), public.complete_day_close(uuid,date,text,text),
  public.save_payment_evidence(uuid,uuid,text,text,text,public.evidence_status,text) from public, anon, authenticated;
grant execute on function public.operations_metrics(uuid,date,date), public.day_review(uuid,date),
  public.start_day_close(uuid,date), public.complete_day_close(uuid,date,text,text),
  public.save_payment_evidence(uuid,uuid,text,text,text,public.evidence_status,text) to authenticated;
