-- 6A is confined to synthetic offline documents. Existing financial tables are read-only here.
create table public.fiscal_issuers (
  id uuid primary key default gen_random_uuid(),
  identification_type text not null check (identification_type in ('01','02')),
  identification_number text not null,
  legal_name text not null check (char_length(legal_name) between 5 and 100),
  email text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+[.]example$'),
  province text not null check (province ~ '^[1-7]$'),
  canton text not null check (canton ~ '^[0-9]{2}$'),
  district text not null check (district ~ '^[0-9]{2}$'),
  address text not null check (char_length(address) between 5 and 250),
  check ((identification_type = '01' and identification_number ~ '^[0-9]{9}$')
      or (identification_type = '02' and identification_number ~ '^[0-9]{10}$')),
  unique (identification_type, identification_number)
);

create table public.fiscal_organization_settings (
  organization_id uuid primary key references public.organizations,
  issuer_id uuid not null references public.fiscal_issuers,
  supplier_id text not null check (supplier_id ~ '^([0-9]{9}|[0-9]{10})$'),
  issuer_activity text not null check (issuer_activity ~ '^[0-9]{6}$'),
  branch text not null check (branch ~ '^[0-9]{3}$' and branch <> '000'),
  terminal text not null check (terminal ~ '^[0-9]{5}$' and terminal <> '00000'),
  offline_enabled boolean not null default false
);

-- Only documented fixture sources are accepted in 6A. No official catalog is imported.
create table public.fiscal_cabys_fixtures (
  code text primary key check (code ~ '^[0-9]{13}$'),
  source_ref text not null check (source_ref in ('tests/fixtures/fiscal-offline.ts')),
  source_version text not null check (source_version = 'feria-6a-v1'),
  description text not null check (char_length(description) between 1 and 200)
);

create table public.fiscal_product_profiles (
  organization_id uuid not null,
  product_id uuid not null,
  price_id uuid not null,
  cabys text references public.fiscal_cabys_fixtures,
  unit text not null check (unit in ('Unid','Sp')),
  is_service boolean not null,
  tax_treatment text check (tax_treatment = 'iva13'),
  net_unit numeric not null check (net_unit > 0 and net_unit <= 9999999999999.99999 and scale(net_unit) <= 5),
  price_includes_tax boolean not null check (price_includes_tax),
  primary key (organization_id, product_id, price_id),
  foreign key (organization_id, product_id, price_id) references public.product_prices (organization_id, product_id, id),
  check (cabys is null or is_service = (left(cabys, 1) between '5' and '9'))
);

-- The organization does not participate in sequence uniqueness. The canonical issuer can
-- be shared by tenants. Document kind 01 (FE) and 04 (TE) have independent series.
create table public.fiscal_series (
  issuer_id uuid not null references public.fiscal_issuers,
  environment text not null check (environment = 'offline'),
  kind text not null check (kind in ('01','04')),
  branch text not null,
  terminal text not null,
  last_value bigint not null check (last_value between 1 and 9999999999),
  primary key (issuer_id, environment, kind, branch, terminal)
);

create table public.fiscal_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  actor_id uuid not null,
  issuer_id uuid not null references public.fiscal_issuers,
  environment text not null check (environment = 'offline'),
  purpose text not null default 'original' check (purpose = 'original'),
  kind text not null check (kind in ('01','04')),
  branch text not null,
  terminal text not null,
  sequence bigint not null check (sequence between 1 and 9999999999),
  security_code text not null check (security_code ~ '^[0-9]{8}$'),
  issued_at text not null,
  request jsonb not null,
  snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (organization_id, sale_id, environment, purpose),
  unique (issuer_id, environment, kind, branch, terminal, sequence),
  unique (organization_id, id),
  foreign key (organization_id, sale_id) references public.sales (organization_id, id)
);

create table public.fiscal_documents (
  organization_id uuid not null,
  intent_id uuid primary key,
  clave text not null unique check (clave ~ '^[0-9]{50}$'),
  consecutive text not null check (consecutive ~ '^[0-9]{20}$'),
  sdk_version text not null check (sdk_version = '0.13.0'),
  xml text not null check (octet_length(xml) <= 2097152),
  xml_sha256 text not null check (xml_sha256 ~ '^[0-9a-f]{64}$'),
  totals jsonb not null,
  prepared_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, intent_id) references public.fiscal_intents (organization_id, id)
);

create table public.fiscal_history (
  organization_id uuid not null,
  intent_id uuid not null,
  event text not null check (event in ('reserved_offline','prepared_offline')),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (intent_id, event),
  foreign key (organization_id, intent_id) references public.fiscal_intents (organization_id, id)
);

alter table public.fiscal_issuers enable row level security;
alter table public.fiscal_organization_settings enable row level security;
alter table public.fiscal_cabys_fixtures enable row level security;
alter table public.fiscal_product_profiles enable row level security;
alter table public.fiscal_series enable row level security;
alter table public.fiscal_intents enable row level security;
alter table public.fiscal_documents enable row level security;
alter table public.fiscal_history enable row level security;

revoke all on public.fiscal_issuers, public.fiscal_organization_settings, public.fiscal_cabys_fixtures,
  public.fiscal_product_profiles, public.fiscal_series, public.fiscal_intents, public.fiscal_documents,
  public.fiscal_history from public, anon, authenticated, service_role;
grant select, insert, update on public.fiscal_issuers, public.fiscal_organization_settings,
  public.fiscal_cabys_fixtures, public.fiscal_product_profiles to service_role;
grant select on public.fiscal_series, public.fiscal_intents, public.fiscal_documents, public.fiscal_history to service_role;
grant select on public.fiscal_organization_settings, public.fiscal_product_profiles,
  public.fiscal_intents, public.fiscal_documents, public.fiscal_history to authenticated;

create policy fiscal_settings_read on public.fiscal_organization_settings for select to authenticated
  using (public.organization_role(organization_id) in ('admin','manager'));
create policy fiscal_products_read on public.fiscal_product_profiles for select to authenticated
  using (public.organization_role(organization_id) in ('admin','manager'));
create policy fiscal_intents_read on public.fiscal_intents for select to authenticated
  using (public.organization_role(organization_id) in ('admin','manager'));
create policy fiscal_documents_read on public.fiscal_documents for select to authenticated
  using (public.organization_role(organization_id) in ('admin','manager'));
create policy fiscal_history_read on public.fiscal_history for select to authenticated
  using (public.organization_role(organization_id) in ('admin','manager'));

create view public.fiscal_offline_status with (security_invoker = true) as
select i.organization_id, i.sale_id, i.id as intent_id, i.kind,
  case when d.intent_id is null then 'reserved_offline' else 'prepared_offline' end as status,
  d.clave, d.consecutive, d.xml_sha256
from public.fiscal_intents i left join public.fiscal_documents d
  on (d.organization_id, d.intent_id) = (i.organization_id, i.id);
revoke all on public.fiscal_offline_status from public, anon, authenticated, service_role;
grant select on public.fiscal_offline_status to authenticated, service_role;

create function public.reject_fiscal_history_edit() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '55000', message = 'fiscal_record_immutable';
end;
$$;
revoke all on function public.reject_fiscal_history_edit() from public, anon, authenticated, service_role;
create trigger fiscal_intents_immutable before update or delete on public.fiscal_intents
  for each row execute function public.reject_fiscal_history_edit();
create trigger fiscal_documents_immutable before update or delete on public.fiscal_documents
  for each row execute function public.reject_fiscal_history_edit();
create trigger fiscal_history_immutable before update or delete on public.fiscal_history
  for each row execute function public.reject_fiscal_history_edit();

create function public.reserve_fiscal_offline(
  p_actor uuid, p_org uuid, p_sale uuid, p_kind text, p_receiver jsonb, p_transfers jsonb
) returns public.fiscal_intents
language plpgsql security definer set search_path = '' as $$
declare
  sale public.sales%rowtype;
  settings public.fiscal_organization_settings%rowtype;
  issuer public.fiscal_issuers%rowtype;
  intent public.fiscal_intents%rowtype;
  request jsonb;
  fiscal_lines jsonb;
  fiscal_payments jsonb;
  paid numeric;
  original_payments boolean;
  next_number bigint;
begin
  perform 1 from public.memberships
    where organization_id = p_org and user_id = p_actor and active and role in ('admin','manager') for share;
  if not found then raise exception using errcode = '42501', message = 'fiscal_forbidden'; end if;
  if p_kind is null or p_kind not in ('01','04')
      or (p_kind = '01' and jsonb_typeof(p_receiver) is distinct from 'object')
      or (p_kind = '04' and p_receiver is not null)
      or jsonb_typeof(p_transfers) is distinct from 'object'
  then raise exception using errcode = '22023', message = 'fiscal_invalid_request'; end if;
  request := jsonb_build_object('receiver', p_receiver, 'transfers', p_transfers);
  perform pg_advisory_xact_lock(hashtextextended('feria:fiscal:offline:' || p_org || ':' || p_sale, 0));
  select * into intent from public.fiscal_intents
    where organization_id = p_org and sale_id = p_sale and environment = 'offline' and purpose = 'original';
  if found then
    if intent.kind <> p_kind or intent.request <> request then
      raise exception using errcode = '23505', message = 'fiscal_intent_conflict';
    end if;
    return intent;
  end if;

  select * into sale from public.sales where (organization_id, id) = (p_org, p_sale);
  if not found then raise exception using errcode = '22023', message = 'fiscal_sale_unavailable'; end if;
  if sale.currency <> 'CRC' or sale.scale <> 2
  then raise exception using errcode = '22023', message = 'fiscal_currency_unsupported'; end if;
  select * into settings from public.fiscal_organization_settings
    where organization_id = p_org and offline_enabled for share;
  if not found then raise exception using errcode = '22023', message = 'fiscal_not_configured'; end if;
  select * into strict issuer from public.fiscal_issuers where id = settings.issuer_id for share;

  select coalesce(sum(amount_minor), 0), bool_and(occurred_at = sale.created_at and created_at = sale.created_at)
    into paid, original_payments from public.payments where (organization_id, sale_id) = (p_org, p_sale);
  if paid <> sale.total_minor or original_payments is distinct from true
  then raise exception using errcode = '22023', message = 'fiscal_requires_payment_at_sale'; end if;

  perform 1 from public.fiscal_product_profiles f join public.sale_lines l
    on (f.organization_id, f.product_id, f.price_id) = (l.organization_id, l.product_id, l.price_id)
    where (l.organization_id, l.sale_id) = (p_org, p_sale) for share of f;
  if exists (
    select 1 from public.sale_lines l left join public.fiscal_product_profiles f
      on (f.organization_id, f.product_id, f.price_id) = (l.organization_id, l.product_id, l.price_id)
    where (l.organization_id, l.sale_id) = (p_org, p_sale) and f.cabys is null
  ) then raise exception using errcode = '22023', message = 'fiscal_cabys_missing'; end if;
  if exists (
    select 1 from public.sale_lines l join public.fiscal_product_profiles f
      on (f.organization_id, f.product_id, f.price_id) = (l.organization_id, l.product_id, l.price_id)
    where (l.organization_id, l.sale_id) = (p_org, p_sale) and f.tax_treatment is null
  ) then raise exception using errcode = '22023', message = 'fiscal_iva_missing'; end if;
  if exists (
    select 1 from public.sale_lines l join public.fiscal_product_profiles f
      on (f.organization_id, f.product_id, f.price_id) = (l.organization_id, l.product_id, l.price_id)
    where (l.organization_id, l.sale_id) = (p_org, p_sale)
      and ((f.net_unit * l.quantity + round(f.net_unit * l.quantity * 0.13, 5)) * 100
        <> l.unit_minor::numeric * l.quantity)
  ) then raise exception using errcode = '22023', message = 'fiscal_amount_mismatch'; end if;

  if exists (
    select 1 from public.payments where (organization_id, sale_id) = (p_org, p_sale)
      and method = 'transfer' and coalesce(p_transfers ->> id::text, '') not in ('bank_transfer','sinpe_movil')
  ) or exists (
    select 1 from jsonb_object_keys(p_transfers) k
    where not exists (
      select 1 from public.payments where (organization_id, sale_id) = (p_org, p_sale)
        and method = 'transfer' and id::text = k
    )
  ) then raise exception using errcode = '22023', message = 'fiscal_transfer_classification_required'; end if;

  select jsonb_agg(jsonb_build_object('name', l.product_name, 'quantity', l.quantity::text,
    'cabys', f.cabys, 'cabysSource', c.source_ref, 'cabysVersion', c.source_version,
    'unit', f.unit, 'service', f.is_service, 'netUnit', f.net_unit::text,
    'grossMinor', (l.unit_minor::numeric * l.quantity)::text) order by l.id)
    into fiscal_lines from public.sale_lines l join public.fiscal_product_profiles f
      on (f.organization_id, f.product_id, f.price_id) = (l.organization_id, l.product_id, l.price_id)
    join public.fiscal_cabys_fixtures c on c.code = f.cabys
    where (l.organization_id, l.sale_id) = (p_org, p_sale);
  if fiscal_lines is null then raise exception using errcode = '22023', message = 'fiscal_lines_missing'; end if;

  select jsonb_agg(jsonb_build_object('code', code, 'minor', subtotal::text) order by code)
  into fiscal_payments from (
    select code, sum(amount_minor) as subtotal from (
      select amount_minor, case method when 'cash' then '01' when 'card' then '02'
        else case p_transfers ->> id::text when 'bank_transfer' then '04' else '06' end end as code
      from public.payments where (organization_id, sale_id) = (p_org, p_sale)
    ) classified group by code
  ) by_method;

  insert into public.fiscal_series (issuer_id, environment, kind, branch, terminal, last_value)
    values (issuer.id, 'offline', p_kind, settings.branch, settings.terminal, 1)
    on conflict (issuer_id, environment, kind, branch, terminal) do update
    set last_value = fiscal_series.last_value + 1 returning last_value into next_number;
  insert into public.fiscal_intents (organization_id, sale_id, actor_id, issuer_id, environment,
    kind, branch, terminal, sequence, security_code, issued_at, request, snapshot)
  values (p_org, p_sale, p_actor, issuer.id, 'offline', p_kind, settings.branch, settings.terminal, next_number,
    lpad(floor(random() * 100000000)::bigint::text, 8, '0'),
    to_char(clock_timestamp() at time zone 'America/Costa_Rica', 'YYYY-MM-DD"T"HH24:MI:SS') || '-06:00',
    request, jsonb_build_object('version', 'feria-6a-v1', 'priceIncludesTax', true, 'taxTreatment', 'iva13',
      'supplierId', settings.supplier_id, 'activity', settings.issuer_activity, 'grossMinor', sale.total_minor::text,
      'receiver', p_receiver, 'lines', fiscal_lines, 'payments', fiscal_payments,
      'issuer', jsonb_build_object('name', issuer.legal_name, 'type', issuer.identification_type,
        'number', issuer.identification_number, 'email', issuer.email, 'province', issuer.province,
        'canton', issuer.canton, 'district', issuer.district, 'address', issuer.address)))
  returning * into intent;
  insert into public.fiscal_history (organization_id, intent_id, event, actor_id)
    values (p_org, intent.id, 'reserved_offline', p_actor);
  return intent;
end;
$$;

-- Only the trusted offline renderer may persist the output. Retried output must match byte for byte.
create function public.store_fiscal_offline(
  p_actor uuid, p_org uuid, p_intent uuid, p_clave text, p_consecutive text, p_xml text, p_totals jsonb
) returns public.fiscal_documents
language plpgsql security definer set search_path = '' as $$
declare
  intent public.fiscal_intents%rowtype;
  document public.fiscal_documents%rowtype;
  expected text;
begin
  perform 1 from public.memberships
    where organization_id = p_org and user_id = p_actor and active and role in ('admin','manager') for share;
  if not found then raise exception using errcode = '42501', message = 'fiscal_forbidden'; end if;
  select * into intent from public.fiscal_intents where (organization_id, id) = (p_org, p_intent) for update;
  if not found then raise exception using errcode = '22023', message = 'fiscal_intent_unavailable'; end if;
  expected := intent.branch || intent.terminal || intent.kind || lpad(intent.sequence::text, 10, '0');
  if p_consecutive is distinct from expected or p_clave is distinct from (
    '506' || to_char(left(intent.issued_at, 10)::date, 'DDMMYY')
      || lpad(intent.snapshot #>> '{issuer,number}', 12, '0')
      || expected || '1' || intent.security_code
  ) then raise exception using errcode = '22023', message = 'fiscal_identity_mismatch'; end if;
  select * into document from public.fiscal_documents where intent_id = p_intent;
  if found then
    if (document.clave, document.consecutive, document.xml, document.totals)
      is distinct from (p_clave, p_consecutive, p_xml, p_totals)
    then raise exception using errcode = '55000', message = 'fiscal_record_immutable'; end if;
    return document;
  end if;
  insert into public.fiscal_documents (organization_id, intent_id, clave, consecutive, sdk_version, xml, xml_sha256, totals)
    values (p_org, p_intent, p_clave, p_consecutive, '0.13.0', p_xml,
      encode(sha256(convert_to(p_xml, 'UTF8')), 'hex'), p_totals)
    returning * into document;
  insert into public.fiscal_history (organization_id, intent_id, event, actor_id)
    values (p_org, p_intent, 'prepared_offline', p_actor);
  return document;
end;
$$;

revoke all on function public.reserve_fiscal_offline(uuid,uuid,uuid,text,jsonb,jsonb),
  public.store_fiscal_offline(uuid,uuid,uuid,text,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.reserve_fiscal_offline(uuid,uuid,uuid,text,jsonb,jsonb),
  public.store_fiscal_offline(uuid,uuid,uuid,text,text,text,jsonb) to service_role;
