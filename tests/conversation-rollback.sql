begin;

create function pg_temp.fail_conversation_audit() returns trigger language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = 'conversation_audit_failed';
end;
$$;

create trigger test_fail_conversation_audit before insert on public.audit_events
for each row when (new.action = 'conversational_sale_confirmed') execute function pg_temp.fail_conversation_audit();

do $$
declare
  org constant uuid := '10000000-0000-4000-8000-000000000001';
  actor uuid;
  draft public.conversational_sale_drafts;
  reviewed_revision integer;
  sales_before bigint;
  payments_before bigint;
begin
  select id into strict actor from auth.users where email = 'operador@feria.example';
  perform set_config('request.jwt.claim.sub', actor::text, true);
  draft := public.save_conversational_sale(org, null, null, '{}', null);
  draft := public.save_conversational_sale(org, draft.id, draft.revision, '{}',
    '{"lines":[{"product_id":"20000000-0000-4000-8000-000000000001","price_id":"30000000-0000-4000-8000-000000000001","quantity":1}],"payments":[{"method":"transfer","amount_minor":"200000"}]}');
  reviewed_revision := draft.revision;
  select count(*) into sales_before from public.sales where organization_id = org;
  select count(*) into payments_before from public.payments where organization_id = org;

  begin
    perform public.confirm_conversational_sale(org, draft.id, draft.revision);
    raise exception using errcode = 'P0002', message = 'expected_audit_failure';
  exception when raise_exception then
    if sqlerrm <> 'conversation_audit_failed' then raise; end if;
  end;

  if (select count(*) from public.sales where organization_id = org) <> sales_before
     or (select count(*) from public.payments where organization_id = org) <> payments_before
     or exists (select 1 from public.sale_requests where organization_id = org and request_id = draft.id)
     or not exists (select 1 from public.conversational_sale_drafts where id = draft.id and status = 'review' and revision = reviewed_revision and sale_id is null) then
    raise exception 'Failed audit left partial conversation writes';
  end if;

  raise notice 'PASS: sale, payments and confirmation roll back when conversational audit fails';
end;
$$;

rollback;
