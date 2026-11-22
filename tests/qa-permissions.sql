-- Execute on a disposable PostgreSQL instance after applying the FER AI schema.
-- This regression only reads catalog metadata and checks effective privileges.
begin read only;

do $$
declare
  routines text[];
  expected_signed constant text[] := array[
    'feria_private.active_organization_roles',
    'public.begin_intelligence_request', 'public.begin_sale_interpretation',
    'public.cancel_conversational_sale', 'public.collect_payment', 'public.complete_day_close',
    'public.confirm_conversational_sale', 'public.confirm_sale', 'public.dashboard_summary',
    'public.day_review', 'public.feria_session_active', 'public.finish_intelligence_request',
    'public.finish_sale_interpretation', 'public.intelligence_product_ranking',
    'public.operations_metrics', 'public.organization_role', 'public.save_conversational_sale',
    'public.save_payment_evidence', 'public.save_product', 'public.set_membership',
    'public.start_day_close', 'public.update_organization'
  ];
  expected_worker constant text[] := array[
    'public.reserve_fiscal_offline', 'public.store_fiscal_offline'
  ];
  expected_helpers constant text[] := array[
    'public.complete_intelligence_request', 'public.lock_conversational_sale',
    'public.lock_operations', 'public.reject_fiscal_history_edit',
    'public.reserve_intelligence_request'
  ];
  expected_no_policy constant text[] := array[
    'collection_requests', 'fiscal_cabys_fixtures', 'fiscal_issuers', 'fiscal_series',
    'intelligence_requests', 'sale_requests'
  ];
  routine record;
  relation record;
  signature text;
begin
  select array_agg(n.nspname || '.' || p.proname order by n.nspname || '.' || p.proname)
  into routines
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'feria_private') and p.prokind = 'f'
    and p.prorettype <> 'event_trigger'::regtype;

  if routines is distinct from array(
    select unnest(expected_signed || expected_worker || expected_helpers) order by 1
  ) then
    raise exception 'Cambió el inventario de RPC o funciones auxiliares';
  end if;

  for routine in
    select p.*, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname || '.' || p.proname = any(routines)
  loop
    signature := routine.nspname || '.' || routine.proname;
    if has_function_privilege('anon', routine.oid, 'EXECUTE')
      or has_function_privilege('authenticated', routine.oid, 'EXECUTE') is distinct from (signature = any(expected_signed))
      -- Supabase concede EXECUTE a service_role por privilegios por defecto; ese rol ya
      -- omite RLS y escribe tablas, así que solo se exige que pueda ejecutar el worker.
      or (signature = any(expected_worker)
        and not has_function_privilege('service_role', routine.oid, 'EXECUTE')) then
      raise exception 'Grants de función inesperados en %', signature;
    end if;
    if routine.prosecdef is distinct from (
      signature <> all(expected_helpers || array[
        'public.dashboard_summary', 'public.day_review', 'public.intelligence_product_ranking', 'public.operations_metrics'
      ])
    ) then
      raise exception 'Contexto de ejecución inesperado en %', signature;
    end if;
    if routine.prosecdef and (
      routine.proconfig is null or not ('search_path=""' = any(routine.proconfig))
      or pg_has_role('authenticated', routine.proowner, 'MEMBER')
      or pg_has_role('anon', routine.proowner, 'MEMBER')
    ) then
      raise exception 'Dueño o search_path inseguro en %', signature;
    end if;
  end loop;

  if has_schema_privilege('anon', 'feria_private', 'USAGE,CREATE')
    or has_schema_privilege('authenticated', 'feria_private', 'CREATE')
    or not has_schema_privilege('authenticated', 'feria_private', 'USAGE')
    or has_schema_privilege('anon', 'public', 'CREATE')
    or has_schema_privilege('authenticated', 'public', 'CREATE')
    or has_table_privilege('anon', 'auth.sessions', 'SELECT')
    or has_table_privilege('authenticated', 'auth.sessions', 'SELECT') then
    raise exception 'Privilegios inesperados en esquemas o almacenamiento de sesiones';
  end if;

  if (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p')) <> 23 then
    raise exception 'Cambió el inventario de tablas de negocio';
  end if;

  for relation in
    select c.*, exists (select 1 from pg_policy p where p.polrelid = c.oid) as has_policy
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v')
  loop
    if has_table_privilege('anon', relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege('authenticated', relation.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Acceso directo inesperado a %', relation.relname;
    end if;
    if relation.relkind = 'v' then
      if relation.reloptions is null or not ('security_invoker=true' = any(relation.reloptions)) then
        raise exception 'La vista debe respetar RLS del actor: %', relation.relname;
      end if;
    elsif not relation.relrowsecurity
      or relation.has_policy is distinct from (relation.relname <> all(expected_no_policy))
      or has_table_privilege('authenticated', relation.oid, 'SELECT') is distinct from relation.has_policy then
      raise exception 'RLS, política o lectura inesperada en %', relation.relname;
    end if;
  end loop;
end;
$$;

rollback;
select 'PASS: inventario RPC, privilegios efectivos, RLS y vistas de negocio' as result;
