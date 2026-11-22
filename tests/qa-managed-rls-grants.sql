-- Catalog only. No rows from application or Auth tables are read.
with handler as (
  select p.oid, p.proowner, p.proacl
  from pg_proc p
  where p.oid = to_regprocedure('public.rls_auto_enable()')
    and p.prorettype = 'event_trigger'::regtype
    and p.prosecdef
), grants as (
  select
    h.oid,
    h.proowner,
    has_function_privilege('anon', h.oid, 'EXECUTE') as anon_execute,
    has_function_privilege('authenticated', h.oid, 'EXECUTE') as authenticated_execute,
    has_function_privilege('service_role', h.oid, 'EXECUTE') as service_execute,
    exists (
      select 1
      from aclexplode(coalesce(h.proacl, acldefault('f', h.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) as public_execute
  from handler h
)
select case
  when g.oid is null then 'NOT INSTALLED'
  when t.oid is null or pg_get_userbyid(g.proowner) <> 'postgres'
    then 'FAIL: unexpected handler identity or trigger'
  when g.anon_execute or g.authenticated_execute or g.public_execute
    then 'FAIL: execution granted to API users or PUBLIC'
  else 'PASS'
end as status,
g.anon_execute, g.authenticated_execute, g.service_execute, g.public_execute,
t.evtname as trigger_name
from (values (1)) as baseline(id)
left join grants g on true
left join pg_event_trigger t on t.evtfoid = g.oid
  and t.evtname = 'ensure_rls' and t.evtevent = 'ddl_command_end' and t.evtenabled = 'O';
