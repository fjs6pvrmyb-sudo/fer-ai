-- GoTrue can revoke a session before its signed access token expires. Require
-- the corresponding session in the central tenant guard used by RLS and RPCs.
create function public.feria_session_active() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = case
      when (auth.jwt() ->> 'session_id') ~ '^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$'
      then (auth.jwt() ->> 'session_id')::uuid
    end
      and s.user_id = (select auth.uid())
      and (auth.jwt() ->> 'aud') = 'authenticated'
      and (s.not_after is null or s.not_after > statement_timestamp())
  );
$$;

revoke all on function public.feria_session_active() from public, anon, authenticated;
grant execute on function public.feria_session_active() to authenticated;

create or replace function public.organization_role(p_org uuid) returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select role from public.memberships
  where organization_id = p_org and user_id = (select auth.uid()) and active
    and (select public.feria_session_active());
$$;

-- The self-membership path also needs the session check.
alter policy memberships_read on public.memberships to authenticated
  using ((select public.feria_session_active()) and (
    public.organization_role(organization_id) = 'admin'
    or (active and user_id = (select auth.uid()))
  ));
