-- Local test. Its fixture and injected failure are rolled back.
begin;

create function pg_temp.fail_collection_audit() returns trigger language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = 'collection_audit_failed';
end;
$$;

create trigger test_fail_collection_audit before insert on public.audit_events
for each row when (new.action = 'payment_collected') execute function pg_temp.fail_collection_audit();

do $$
declare
  org constant uuid := '10000000-0000-4000-8000-000000000001';
  attempt_id constant uuid := gen_random_uuid();
  actor uuid;
  sale uuid;
begin
  select id into strict actor from auth.users where email = 'admin@feria.example';
  perform set_config('request.jwt.claim.sub', actor::text, true);
  sale := public.confirm_sale(org, gen_random_uuid(),
    '[{"product_id":"20000000-0000-4000-8000-000000000001","price_id":"30000000-0000-4000-8000-000000000001","quantity":1}]',
    '[{"method":"transfer","amount_minor":"200000"}]');

  begin
    perform public.collect_payment(org, sale, attempt_id, 'CRC', 'cash', '300000');
    raise exception using errcode = 'P0002', message = 'expected_audit_failure';
  exception when raise_exception then
    if sqlerrm <> 'collection_audit_failed' then raise; end if;
  end;

  if (select count(*) from public.payments where organization_id = org and sale_id = sale) <> 1
     or exists (select 1 from public.collection_requests r where r.organization_id = org and r.request_id = attempt_id)
     or (select balance_minor from public.sales_overview where organization_id = org and id = sale) <> '300000' then
    raise exception 'Failed audit left partial collection writes';
  end if;
  raise notice 'PASS: payment, idempotency and balance roll back if collection audit fails';
end;
$$;

rollback;
