-- Supabase installs this event handler in hosted projects. Restrict direct
-- invocation while keeping the existing trigger, owner and service role.
do $$
declare
  handler oid := to_regprocedure('public.rls_auto_enable()');
begin
  if handler is null then
    return;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_event_trigger t on t.evtfoid = p.oid
    where p.oid = handler
      and p.prorettype = 'event_trigger'::regtype
      and p.prosecdef
      and pg_get_userbyid(p.proowner) = 'postgres'
      and t.evtname = 'ensure_rls'
      and t.evtevent = 'ddl_command_end'
      and t.evtenabled = 'O'
  ) then
    raise exception 'Unexpected Supabase RLS event handler identity';
  end if;

  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
end;
$$;
