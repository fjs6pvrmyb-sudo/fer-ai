create table public.intelligence_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations,
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  mode text not null check (mode in ('demo', 'openai')),
  model text not null check (model ~ '^[a-zA-Z0-9_.:-]{1,80}$'),
  intent text check (intent in ('sales','collections','sales_and_collections','balance','closure','products','evidence','differences','priorities','compare','unsupported')),
  status text not null default 'started'
    check (status in ('started','answered','clarification','denied','provider_unavailable','provider_timeout','invalid_plan','query_error')),
  input_tokens integer check (input_tokens between 0 and 1000000),
  output_tokens integer check (output_tokens between 0 and 1000000),
  check ((status = 'started') = (finished_at is null))
);
create index intelligence_requests_actor_date on public.intelligence_requests (actor_id, created_at desc);

alter table public.intelligence_requests enable row level security;
revoke all on public.intelligence_requests from public, anon, authenticated;

create function public.begin_intelligence_request(p_org uuid, p_mode text, p_model text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  at_time timestamptz;
  minute_count bigint;
  day_count bigint;
  request_id uuid;
begin
  if actor is null or not coalesce(public.organization_role(p_org) in ('admin','manager'), false) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  -- Reserve quota atomically across server workers and the actor's organizations.
  perform pg_advisory_xact_lock(hashtextextended('feria-intelligence:' || actor::text, 0));
  if not coalesce(public.organization_role(p_org) in ('admin','manager'), false) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  at_time := clock_timestamp();
  select count(*) filter (where created_at >= at_time - interval '1 minute'), count(*)
    into minute_count, day_count from public.intelligence_requests
    where actor_id = actor and created_at >= at_time - interval '1 day';
  if minute_count >= 8 or day_count >= 60 then
    raise exception using errcode = 'P0001', message = 'intelligence_rate_limited';
  end if;
  delete from public.intelligence_requests where actor_id = actor and created_at < at_time - interval '30 days';
  insert into public.intelligence_requests (organization_id, actor_id, created_at, mode, model)
    values (p_org, actor, at_time, p_mode, p_model)
    returning id into request_id;
  return request_id;
end;
$$;

create function public.finish_intelligence_request(
  p_org uuid, p_request uuid, p_status text, p_intent text, p_input integer, p_output integer
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(public.organization_role(p_org) in ('admin','manager'), false) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_status is null or p_status = 'started' then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;
  update public.intelligence_requests set status = p_status, intent = p_intent,
    input_tokens = p_input, output_tokens = p_output, finished_at = clock_timestamp()
    where organization_id = p_org and actor_id = auth.uid() and id = p_request and status = 'started';
end;
$$;

create function public.intelligence_product_ranking(p_org uuid, p_from date, p_to date)
returns table (product_id uuid, name text, units text)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if not coalesce(public.organization_role(p_org) in ('admin','manager'), false) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to < p_from then
    raise exception using errcode = '22023', message = 'invalid_period';
  end if;
  if p_to - p_from > 365 then
    raise exception using errcode = '22023', message = 'invalid_period';
  end if;
  return query
    select p.id, p.name, sum(l.quantity)::text
      from public.sales s
      join public.sale_lines l on (s.organization_id, s.id) = (l.organization_id, l.sale_id)
      join public.products p on (p.organization_id, p.id) = (l.organization_id, l.product_id)
      where s.organization_id = p_org and s.day between p_from and p_to
      group by p.id, p.name
      order by sum(l.quantity) desc, p.id
      limit 5;
end;
$$;

revoke all on function public.begin_intelligence_request(uuid,text,text),
  public.finish_intelligence_request(uuid,uuid,text,text,integer,integer),
  public.intelligence_product_ranking(uuid,date,date) from public, anon, authenticated;
grant execute on function public.begin_intelligence_request(uuid,text,text),
  public.finish_intelligence_request(uuid,uuid,text,text,integer,integer),
  public.intelligence_product_ranking(uuid,date,date) to authenticated;
