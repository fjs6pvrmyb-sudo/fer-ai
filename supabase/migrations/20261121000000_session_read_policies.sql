-- Compute the current actor's roles once per policy scan instead of checking
-- session and membership for each row. Financial writers keep organization_role().
create schema feria_private;
revoke all on schema feria_private from public, anon, authenticated;
grant usage on schema feria_private to authenticated;

create function feria_private.active_organization_roles()
returns table (organization_id uuid, role public.member_role)
language sql stable security definer set search_path = ''
as $$
  select m.organization_id, m.role
  from public.memberships m
  where m.user_id = (select auth.uid()) and m.active
    and (select public.feria_session_active());
$$;

revoke all on function feria_private.active_organization_roles() from public, anon, authenticated;
grant execute on function feria_private.active_organization_roles() to authenticated;

alter policy memberships_read on public.memberships using (
  (select public.feria_session_active()) and (
    organization_id in (select organization_id from feria_private.active_organization_roles() where role = 'admin')
    or (active and user_id = (select auth.uid()))
  )
);

alter policy products_read on public.products using (
  organization_id in (select organization_id from feria_private.active_organization_roles())
);
alter policy prices_read on public.product_prices using (
  organization_id in (select organization_id from feria_private.active_organization_roles())
);

alter policy days_read on public.operating_days using (
  organization_id in (select organization_id from feria_private.active_organization_roles())
);
alter policy sales_read on public.sales using (
  organization_id in (select organization_id from feria_private.active_organization_roles())
);
alter policy payments_read on public.payments using (
  organization_id in (select organization_id from feria_private.active_organization_roles())
);
alter policy payment_evidence_read on public.payment_evidence using (
  organization_id in (select organization_id from feria_private.active_organization_roles() where role in ('admin', 'manager'))
);
alter policy closures_read on public.day_closures using (
  organization_id in (select organization_id from feria_private.active_organization_roles() where role in ('admin', 'manager'))
);
