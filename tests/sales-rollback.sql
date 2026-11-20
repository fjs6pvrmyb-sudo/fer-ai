-- Runs only in the local Supabase database after demo users are seeded.
begin;

create function pg_temp.fail_audit() returns trigger language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = 'test_rollback';
end;
$$;

create trigger test_fail_audit before insert on public.audit_events
for each row when (new.action = 'sale_confirmed') execute function pg_temp.fail_audit();

do $$
declare
  org constant uuid := '10000000-0000-4000-8000-000000000001';
  request_id constant uuid := gen_random_uuid();
  actor uuid;
  before_counts bigint[];
  after_counts bigint[];
begin
  select id into strict actor from auth.users where email = 'operador@feria.example';
  perform set_config('request.jwt.claim.sub', actor::text, true);

  before_counts := array[
    (select count(*) from public.sales where organization_id = org),
    (select count(*) from public.sale_lines where organization_id = org),
    (select count(*) from public.payments where organization_id = org),
    (select count(*) from public.sale_requests where organization_id = org)
  ];

  begin
    perform public.confirm_sale(org, request_id,
      '[{"product_id":"20000000-0000-4000-8000-000000000001","price_id":"30000000-0000-4000-8000-000000000001","quantity":1}]',
      '[{"method":"cash","amount_minor":"200000"}]');
    raise exception using errcode = 'P0002', message = 'expected_audit_failure';
  exception when raise_exception then
    if sqlerrm <> 'test_rollback' then raise; end if;
  end;

  after_counts := array[
    (select count(*) from public.sales where organization_id = org),
    (select count(*) from public.sale_lines where organization_id = org),
    (select count(*) from public.payments where organization_id = org),
    (select count(*) from public.sale_requests where organization_id = org)
  ];

  if after_counts is distinct from before_counts then
    raise exception 'Failed audit left partial writes';
  end if;
  raise notice 'PASS: sale, lines, payments and idempotency roll back if audit fails';
end;
$$;

rollback;
