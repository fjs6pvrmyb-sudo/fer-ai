-- Both channels reserve the same actor quota. The read channel keeps its existing role gate.
alter table public.intelligence_requests
  add column capability text not null default 'read' check (capability in ('read', 'sale_draft')),
  drop constraint intelligence_requests_intent_check,
  add constraint intelligence_requests_intent_check check (
    intent in ('sales','collections','sales_and_collections','balance','closure','products','evidence','differences','priorities','compare','unsupported',
      'draft_create','draft_edit','draft_cancel','draft_clarify')
  );

create function public.reserve_intelligence_request(p_org uuid, p_mode text, p_model text, p_capability text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  role public.member_role;
  at_time timestamptz;
  minute_count bigint;
  day_count bigint;
  request_id uuid;
begin
  if actor is null then raise exception using errcode = '42501', message = 'forbidden'; end if;
  role := public.organization_role(p_org);
  if role is null or (p_capability = 'read' and role not in ('admin','manager')) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('feria-intelligence:' || actor::text, 0));
  role := public.organization_role(p_org);
  if role is null or (p_capability = 'read' and role not in ('admin','manager')) then
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
  insert into public.intelligence_requests (organization_id, actor_id, created_at, mode, model, capability)
    values (p_org, actor, at_time, p_mode, p_model, p_capability) returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.begin_intelligence_request(p_org uuid, p_mode text, p_model text)
returns uuid language sql security definer set search_path = '' as $$
  select public.reserve_intelligence_request(p_org, p_mode, p_model, 'read');
$$;

create function public.begin_sale_interpretation(p_org uuid, p_mode text, p_model text)
returns uuid language sql security definer set search_path = '' as $$
  select public.reserve_intelligence_request(p_org, p_mode, p_model, 'sale_draft');
$$;

create function public.complete_intelligence_request(
  p_org uuid, p_request uuid, p_status text, p_intent text, p_input integer, p_output integer, p_capability text
) returns void language plpgsql security invoker set search_path = '' as $$
declare role public.member_role := public.organization_role(p_org);
begin
  if role is null or (p_capability = 'read' and role not in ('admin','manager')) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_status is null or p_status = 'started' then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;
  update public.intelligence_requests set status = p_status, intent = p_intent,
    input_tokens = p_input, output_tokens = p_output, finished_at = clock_timestamp()
    where organization_id = p_org and actor_id = auth.uid() and id = p_request
      and capability = p_capability and status = 'started';
end;
$$;

create or replace function public.finish_intelligence_request(
  p_org uuid, p_request uuid, p_status text, p_intent text, p_input integer, p_output integer
) returns void language sql security definer set search_path = '' as $$
  select public.complete_intelligence_request(p_org, p_request, p_status, p_intent, p_input, p_output, 'read');
$$;

create function public.finish_sale_interpretation(
  p_org uuid, p_request uuid, p_status text, p_intent text, p_input integer, p_output integer
) returns void language sql security definer set search_path = '' as $$
  select public.complete_intelligence_request(p_org, p_request, p_status, p_intent, p_input, p_output, 'sale_draft');
$$;

-- Organizations retain the current defaults. Conversational capture consumes this
-- configuration both in the editor and while the organization is locked.
alter table public.organizations
  add column conversational_payment_methods public.payment_method[] not null
    default '{cash,transfer,card}'
    check (cardinality(conversational_payment_methods) between 1 and 3
      and array_position(conversational_payment_methods, null) is null);

create table public.conversational_sale_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations,
  actor_id uuid not null references auth.users on delete cascade,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'editing' check (status in ('editing','review','confirmed','cancelled')),
  document jsonb not null check (jsonb_typeof(document) = 'object' and octet_length(document::text) <= 24000),
  review_payload jsonb,
  review_day date,
  sale_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 minutes'),
  foreign key (organization_id, sale_id) references public.sales (organization_id, id),
  check ((status = 'confirmed') = (sale_id is not null)),
  check ((status = 'review') = (review_payload is not null and review_day is not null))
);
create index conversation_sale_drafts_owner on public.conversational_sale_drafts (organization_id, actor_id, created_at desc);

alter table public.conversational_sale_drafts enable row level security;
revoke all on public.conversational_sale_drafts from public, anon, authenticated;
grant select on public.conversational_sale_drafts to authenticated;
create policy drafts_read on public.conversational_sale_drafts for select to authenticated
  using (actor_id = (select auth.uid()) and public.organization_role(organization_id) is not null
    and (expires_at > now() or status = 'confirmed'));

-- Private row lock ensures a revision can be reviewed, cancelled or confirmed only once at a time.
create function public.lock_conversational_sale(p_org uuid, p_id uuid, p_revision integer)
returns public.conversational_sale_drafts
language plpgsql security invoker set search_path = '' as $$
declare draft public.conversational_sale_drafts;
begin
  if public.organization_role(p_org) is null then raise exception using errcode = '42501', message = 'forbidden'; end if;
  select * into draft from public.conversational_sale_drafts
    where id = p_id and organization_id = p_org and actor_id = auth.uid() for update;
  if not found then raise exception using errcode = '42501', message = 'draft_unavailable'; end if;
  if draft.revision is distinct from p_revision then
    raise exception using errcode = '22023', message = 'draft_revision';
  end if;
  if draft.status <> 'confirmed' and draft.expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'draft_expired';
  end if;
  return draft;
end;
$$;

create function public.save_conversational_sale(p_org uuid, p_id uuid, p_revision integer, p_document jsonb, p_review jsonb)
returns public.conversational_sale_drafts
language plpgsql security definer set search_path = '' as $$
declare
  draft public.conversational_sale_drafts;
  day_reviewed date;
  zone text;
begin
  if public.organization_role(p_org) is null then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_review is not null then
    if p_id is null or jsonb_typeof(p_review->'lines') is distinct from 'array'
      or jsonb_typeof(p_review->'payments') is distinct from 'array'
      or octet_length(p_review::text) > 20000 then
      raise exception using errcode = '22023', message = 'invalid_sale';
    end if;
    select timezone into zone from public.organizations where id = p_org;
    day_reviewed := (clock_timestamp() at time zone zone)::date;
  end if;

  if p_id is null then
    delete from public.conversational_sale_drafts where organization_id = p_org and actor_id = auth.uid()
      and created_at < clock_timestamp() - interval '1 day';
    insert into public.conversational_sale_drafts (organization_id, actor_id, document)
      values (p_org, auth.uid(), p_document) returning * into draft;
  else
    draft := public.lock_conversational_sale(p_org, p_id, p_revision);
    if draft.status not in ('editing','review') then
      raise exception using errcode = '22023', message = 'draft_not_editable';
    end if;
    update public.conversational_sale_drafts set revision = revision + 1, document = p_document,
      status = case when p_review is null then 'editing' else 'review' end, review_payload = p_review, review_day = day_reviewed
      where id = p_id returning * into draft;
  end if;
  return draft;
end;
$$;

create function public.cancel_conversational_sale(p_org uuid, p_id uuid, p_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare draft public.conversational_sale_drafts := public.lock_conversational_sale(p_org, p_id, p_revision);
begin
  if draft.status = 'confirmed' then raise exception using errcode = '22023', message = 'draft_not_editable'; end if;
  update public.conversational_sale_drafts set status = 'cancelled', review_payload = null,
    review_day = null, document = '{}'::jsonb where id = p_id;
end;
$$;

create function public.confirm_conversational_sale(p_org uuid, p_id uuid, p_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  draft public.conversational_sale_drafts;
  result uuid;
  zone text;
  allowed_methods public.payment_method[];
begin
  if public.organization_role(p_org) is null then raise exception using errcode = '42501', message = 'forbidden'; end if;
  -- Follow confirm_sale's organization-first locking order.
  select timezone, conversational_payment_methods into zone, allowed_methods from public.organizations where id = p_org for update;
  draft := public.lock_conversational_sale(p_org, p_id, p_revision);
  if draft.status = 'confirmed' then return draft.sale_id; end if;
  if draft.status <> 'review' then raise exception using errcode = '22023', message = 'draft_needs_review'; end if;
  if draft.review_day <> (clock_timestamp() at time zone zone)::date then
    raise exception using errcode = '22023', message = 'draft_day_changed';
  end if;

  if exists (
    select 1 from jsonb_array_elements(draft.review_payload->'payments') item
      where item->>'method' is null or not (item->>'method' = any(allowed_methods::text[]))
  ) then
    raise exception using errcode = '22023', message = 'draft_payment_method_changed';
  end if;

  result := public.confirm_sale(p_org, draft.id, draft.review_payload->'lines', draft.review_payload->'payments');
  insert into public.audit_events (organization_id, actor_id, action, entity_id, details)
    values (p_org, auth.uid(), 'conversational_sale_confirmed', result,
      jsonb_build_object('draft_id', draft.id, 'revision', draft.revision));
  -- Remove the extracted draft data after success. The sale and audit record remain authoritative.
  update public.conversational_sale_drafts set status = 'confirmed', sale_id = result, review_day = null,
    review_payload = null, document = '{}'::jsonb where id = p_id;
  return result;
end;
$$;

revoke all on function public.reserve_intelligence_request(uuid,text,text,text),
  public.complete_intelligence_request(uuid,uuid,text,text,integer,integer,text), public.lock_conversational_sale(uuid,uuid,integer),
  public.begin_sale_interpretation(uuid,text,text), public.finish_sale_interpretation(uuid,uuid,text,text,integer,integer),
  public.save_conversational_sale(uuid,uuid,integer,jsonb,jsonb), public.cancel_conversational_sale(uuid,uuid,integer),
  public.confirm_conversational_sale(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.begin_sale_interpretation(uuid,text,text), public.finish_sale_interpretation(uuid,uuid,text,text,integer,integer),
  public.save_conversational_sale(uuid,uuid,integer,jsonb,jsonb), public.cancel_conversational_sale(uuid,uuid,integer),
  public.confirm_conversational_sale(uuid,uuid,integer) to authenticated;
