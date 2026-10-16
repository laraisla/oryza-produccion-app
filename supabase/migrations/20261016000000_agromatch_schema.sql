-- AgroMatch COMEX — esquema relacional inicial (PostgreSQL / Supabase).
-- Importes y cantidades en NUMERIC (nunca float). Identificadores UUID.
-- Seguridad: RLS por organización en todas las tablas de negocio.

create extension if not exists pgcrypto;

-- ============================================================
-- Organizaciones, perfiles y membresías
-- ============================================================
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 1),
  kinds text[] not null check (cardinality(kinds) > 0 and kinds <@ array['producer', 'mill', 'exporter', 'buyer']::text[]),
  country char(2) not null,
  province text,
  city text,
  tax_id text,
  stellar_address text check (stellar_address is null or stellar_address ~ '^G[A-Z2-7]{55}$'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  is_demo boolean not null default false
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('producer', 'buyer', 'exporter', 'admin')),
  primary key (organization_id, user_id)
);

-- Funciones auxiliares de RLS (SECURITY DEFINER evita recursión sobre las membresías).
create or replace function public.is_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members m where m.organization_id = org and m.user_id = auth.uid());
$$;

create or replace function public.has_role(org uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.role = any (roles)
  );
$$;

-- ============================================================
-- Catálogos de referencia
-- ============================================================
create table public.ports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country char(2) not null,
  city text not null,
  code text unique,
  kind text not null check (kind in ('origin', 'destination', 'both'))
);

create table public.container_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  max_payload_kg numeric(12, 3) not null check (max_payload_kg > 0),
  operational_limit_kg numeric(12, 3) check (operational_limit_kg > 0),
  usable_volume_m3 numeric(10, 3) check (usable_volume_m3 > 0),
  max_pallets integer check (max_pallets > 0),
  source text not null,
  verification_status text not null check (verification_status in ('estimated', 'quoted', 'verified', 'pending', 'expired'))
);

-- ============================================================
-- Origen: establecimientos
-- ============================================================
create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  type text not null check (type in ('mill', 'plant', 'warehouse', 'farm')),
  country char(2) not null,
  province text not null,
  city text not null,
  address text not null,
  exit_port_id uuid references public.ports (id),
  distance_to_port_km numeric(10, 2) check (distance_to_port_km >= 0),
  distance_source text check (distance_source in ('manual', 'service')),
  loading_conditions text,
  logistics_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

-- ============================================================
-- Productos, presentaciones y lotes
-- ============================================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null,
  name text not null check (length(trim(name)) >= 3),
  category text not null check (category in ('rice', 'other')),
  commercial_type text not null check (commercial_type in ('long_fine', 'long_wide', 'medium', 'short', 'jasmine', 'basmati', 'persian', 'aromatic_other')),
  variety text,
  processing text not null check (processing in ('paddy', 'brown', 'white', 'parboiled', 'broken')),
  ncm text,
  ncm_description text,
  ncm_status text not null check (ncm_status in ('estimated', 'quoted', 'verified', 'pending', 'expired')),
  ncm_source text,
  description text,
  convertible_to jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (organization_id, code),
  unique (id, organization_id)
);

create table public.product_presentations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label text not null,
  packaging text not null check (packaging in ('bulk', 'bag', 'big_bag', 'box')),
  net_weight_kg numeric(12, 3),
  tare_weight_kg numeric(12, 4) check (tare_weight_kg >= 0),
  units_per_pallet integer check (units_per_pallet > 0),
  pallet_tare_kg numeric(10, 3) check (pallet_tare_kg >= 0),
  package_volume_m3 numeric(10, 4) check (package_volume_m3 > 0),
  check (packaging = 'bulk' or net_weight_kg > 0),
  unique (id, product_id)
);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null,
  code text not null,
  facility_id uuid not null,
  presentation_id uuid not null,
  physical_stock_t numeric(14, 3) not null check (physical_stock_t > 0),
  harvest text,
  available_from date not null,
  broken_pct numeric(6, 3) check (broken_pct between 0 and 100),
  moisture_pct numeric(6, 3) check (moisture_pct between 0 and 100),
  impurities_pct numeric(6, 3) check (impurities_pct between 0 and 100),
  other_quality jsonb not null default '[]'::jsonb,
  analysis_date date,
  analyst text,
  document_ref text,
  quality_status text not null check (quality_status in ('estimated', 'quoted', 'verified', 'pending', 'expired')),
  quality_valid_until date,
  certifications jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  -- El mismo código visible puede repetirse entre organizaciones (IDs internos únicos).
  unique (organization_id, code),
  unique (id, organization_id),
  -- Un lote solo usa productos y plantas de su propia organización.
  foreign key (product_id, organization_id) references public.products (id, organization_id),
  foreign key (facility_id, organization_id) references public.facilities (id, organization_id),
  foreign key (presentation_id, product_id) references public.product_presentations (id, product_id),
  check (quality_status <> 'verified' or document_ref is not null)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lot_id uuid not null,
  type text not null check (type in ('reservation', 'release', 'commitment', 'shipment', 'adjustment')),
  quantity_t numeric(14, 3) not null check (type = 'adjustment' or quantity_t >= 0),
  converts_reservation boolean not null default false,
  reference_kind text not null check (reference_kind in ('quotation', 'operation', 'shipment', 'manual')),
  reference_id uuid,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  foreign key (lot_id, organization_id) references public.lots (id, organization_id)
);
create index inventory_movements_lot_idx on public.inventory_movements (lot_id);

-- Stock = físico − reservado − comprometido. Se calcula siempre desde los movimientos (nunca se edita).
-- lot_stock_raw ve todos los movimientos (uso interno del control de integridad, sin permiso público).
create or replace function public.lot_stock_raw(lot uuid)
returns table (physical_t numeric, reserved_t numeric, committed_t numeric)
language sql stable security definer set search_path = public as $$
  select
    l.physical_stock_t
      + coalesce(sum(m.quantity_t) filter (where m.type = 'adjustment'), 0)
      - coalesce(sum(m.quantity_t) filter (where m.type = 'shipment'), 0),
    coalesce(sum(m.quantity_t) filter (where m.type = 'reservation'), 0)
      - coalesce(sum(m.quantity_t) filter (where m.type = 'release'), 0)
      - coalesce(sum(m.quantity_t) filter (where m.type = 'commitment' and m.converts_reservation), 0),
    coalesce(sum(m.quantity_t) filter (where m.type = 'commitment'), 0)
      - coalesce(sum(m.quantity_t) filter (where m.type = 'shipment'), 0)
  from lots l
  left join inventory_movements m on m.lot_id = l.id
  where l.id = lot
  group by l.id;
$$;
revoke execute on function public.lot_stock_raw(uuid) from public;

create or replace function public.check_lot_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  select * into s from lot_stock_raw(new.lot_id);
  if s.physical_t < 0 or s.reserved_t < 0 or s.committed_t < 0 or s.physical_t - s.reserved_t - s.committed_t < 0 then
    raise exception 'Stock insuficiente en el lote %: no se puede reservar ni comprometer stock ya comprometido', new.lot_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create constraint trigger inventory_movements_stock
after insert or update on public.inventory_movements
deferrable initially deferred
for each row execute function public.check_lot_stock();

-- ============================================================
-- Demanda: solicitudes de compra
-- ============================================================
create table public.buyer_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  buyer_organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_name text not null,
  contact_email text,
  status text not null check (status in ('draft', 'published', 'negotiating', 'closed', 'cancelled')),
  visibility text not null check (visibility in ('public', 'private')),
  category text not null check (category in ('rice', 'other')),
  commercial_type text not null check (commercial_type in ('long_fine', 'long_wide', 'medium', 'short', 'jasmine', 'basmati', 'persian', 'aromatic_other')),
  variety_policy text not null check (variety_policy in ('exact', 'equivalents_allowed')),
  variety text,
  processing text not null check (processing in ('paddy', 'brown', 'white', 'parboiled', 'broken')),
  max_broken_pct numeric(6, 3) not null check (max_broken_pct between 0 and 100),
  max_moisture_pct numeric(6, 3) check (max_moisture_pct between 0 and 100),
  max_impurities_pct numeric(6, 3) check (max_impurities_pct between 0 and 100),
  quantity_t numeric(14, 3) not null check (quantity_t > 0),
  packaging_type text not null check (packaging_type in ('bulk', 'bag', 'big_bag', 'box')),
  packaging_net_weight_kg numeric(12, 3),
  packaging_flexible boolean not null default false,
  allow_consolidation boolean not null default false,
  destination_country char(2) not null,
  destination_city text,
  destination_port_id uuid references public.ports (id),
  final_address text,
  availability_deadline date,
  delivery_date date,
  currency text not null check (currency in ('USD', 'EUR', 'ARS', 'BRL')),
  preferred_incoterm text check (preferred_incoterm in ('FCA', 'FOB', 'CFR', 'CIF', 'DAP')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  check (variety_policy <> 'exact' or variety is not null),
  check (packaging_type = 'bulk' or packaging_net_weight_kg > 0)
);

create table public.request_invitations (
  request_id uuid not null references public.buyer_requests (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (request_id, organization_id)
);

create table public.request_requirements (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.buyer_requests (id) on delete cascade,
  kind text not null check (kind in ('certification', 'buyer_document')),
  name text not null,
  note text
);

create table public.commercial_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_id uuid not null references public.buyer_requests (id) on delete cascade,
  lot_id uuid not null references public.lots (id) on delete cascade,
  status text not null check (status in ('compatible', 'conditional', 'incompatible')),
  checks jsonb not null,
  engine_version text not null,
  evaluated_at timestamptz not null default now(),
  evaluated_by uuid references public.profiles (id)
);

-- ============================================================
-- Costos: catálogo, tipos de cambio y escenarios
-- ============================================================
create table public.cost_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  name text not null,
  stage text not null check (stage in ('merchandise', 'origin', 'port', 'international', 'customs', 'commercial', 'financial', 'contingency')),
  point text not null,
  provider text,
  amount numeric(20, 6) not null,
  currency text not null check (currency in ('USD', 'EUR', 'ARS', 'BRL')),
  unit text not null check (unit in ('per_ton', 'per_container', 'per_operation', 'per_day', 'per_unit', 'percent')),
  definition jsonb not null default '{}'::jsonb,
  default_enabled boolean not null default true,
  required boolean not null default false,
  rate_date date,
  valid_until date,
  source text not null check (length(trim(source)) > 0),
  source_url text,
  verification_status text not null check (verification_status in ('estimated', 'quoted', 'verified', 'pending', 'expired')),
  may_be_included_in text[] not null default '{}',
  notes text,
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  base text not null check (base in ('USD', 'EUR', 'ARS', 'BRL')),
  quote text not null check (quote in ('USD', 'EUR', 'ARS', 'BRL')),
  rate numeric(20, 8) not null check (rate > 0),
  date date not null,
  source text not null check (length(trim(source)) > 2),
  source_url text,
  status text not null check (status in ('estimated', 'quoted', 'verified', 'pending', 'expired')),
  created_at timestamptz not null default now(),
  check (base <> quote),
  check (status <> 'verified' or source_url is not null)
);

create table public.cost_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  status text not null check (status in ('draft', 'quoted', 'archived')),
  wizard_step integer not null default 0 check (wizard_step between 0 and 5),
  request_id uuid references public.buyer_requests (id),
  buyer_organization_id uuid references public.organizations (id),
  product_id uuid references public.products (id),
  presentation_id uuid references public.product_presentations (id),
  quantity_t numeric(14, 3) not null default 0,
  packaging_decision text check (packaging_decision in ('round_up', 'round_down')),
  origin_facility_id uuid references public.facilities (id),
  exit_port_id uuid references public.ports (id),
  destination_country char(2),
  destination_city text,
  destination_port_id uuid references public.ports (id),
  container_type_id uuid references public.container_types (id),
  containers_override integer check (containers_override >= 0),
  commercial jsonb not null,
  pricing jsonb not null,
  rounding jsonb not null,
  financing jsonb not null,
  customs jsonb not null,
  finance jsonb not null,
  fx_rate_ids uuid[] not null default '{}',
  quotation_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create table public.scenario_lots (
  scenario_id uuid not null references public.cost_scenarios (id) on delete cascade,
  lot_id uuid not null references public.lots (id),
  quantity_t numeric(14, 3) not null check (quantity_t >= 0),
  primary key (scenario_id, lot_id)
);

-- Los gastos pertenecen a un escenario concreto (y se congelan en cada versión de cotización).
create table public.scenario_cost_lines (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.cost_scenarios (id) on delete cascade,
  position integer not null,
  catalog_key text,
  name text not null,
  stage text not null,
  point text not null,
  amount numeric(20, 6) not null,
  currency text not null check (currency in ('USD', 'EUR', 'ARS', 'BRL')),
  unit text not null check (unit in ('per_ton', 'per_container', 'per_operation', 'per_day', 'per_unit', 'percent')),
  definition jsonb not null default '{}'::jsonb,
  payer_override text check (payer_override in ('seller', 'buyer')),
  override_note text,
  included_in_line_id uuid references public.scenario_cost_lines (id) on delete set null,
  enabled boolean not null default true,
  required boolean not null default false,
  rate_date date,
  valid_until date,
  source text not null,
  source_url text,
  verification_status text not null check (verification_status in ('estimated', 'quoted', 'verified', 'pending', 'expired'))
);

-- ============================================================
-- Cotizaciones versionadas
-- ============================================================
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  seller_organization_id uuid not null references public.organizations (id),
  buyer_organization_id uuid not null references public.organizations (id),
  request_id uuid references public.buyer_requests (id),
  scenario_id uuid references public.cost_scenarios (id),
  product_id uuid not null references public.products (id),
  operation_id uuid,
  status text not null check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  current_version_id uuid,
  accepted_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (seller_organization_id, code),
  check (seller_organization_id <> buyer_organization_id)
);

-- Términos y precio: visibles para vendedor y comprador.
create table public.quotation_versions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded')),
  price_per_t numeric(20, 6) not null check (price_per_t > 0),
  total_amount numeric(20, 6) not null check (total_amount > 0),
  currency text not null check (currency in ('USD', 'EUR', 'ARS', 'BRL')),
  quantity_t numeric(14, 3) not null check (quantity_t > 0),
  incoterm text not null check (incoterm in ('FCA', 'FOB', 'CFR', 'CIF', 'DAP')),
  named_place text not null check (length(trim(named_place)) > 0),
  valid_until date not null,
  terms jsonb not null,
  terms_hash char(64) not null check (terms_hash ~ '^[0-9a-f]{64}$'),
  change_note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  rejected_at timestamptz,
  rejected_by uuid references public.profiles (id),
  rejection_reason text,
  unique (quotation_id, version),
  check (status <> 'accepted' or (accepted_at is not null and accepted_by is not null)),
  check (status <> 'rejected' or rejection_reason is not null)
);

-- Costos, márgenes y escenario: privados del vendedor (tabla separada con RLS propia).
create table public.quotation_version_costing (
  version_id uuid primary key references public.quotation_versions (id) on delete cascade,
  seller_organization_id uuid not null references public.organizations (id),
  scenario jsonb not null,
  costing_input jsonb not null,
  result jsonb not null,
  engine_version text not null
);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.quotation_versions (id) on delete cascade,
  seller_organization_id uuid not null references public.organizations (id),
  line_key text not null,
  name text not null,
  stage text not null,
  point text not null,
  amount numeric(20, 6) not null,
  payer text not null check (payer in ('seller', 'buyer')),
  payer_source text not null check (payer_source in ('incoterm', 'agreement')),
  explanation text not null,
  included boolean not null,
  exclusion_reason text,
  effective_status text not null,
  source text not null
);

alter table public.quotations
  add constraint quotations_current_version_fk foreign key (current_version_id) references public.quotation_versions (id) deferrable initially deferred,
  add constraint quotations_accepted_version_fk foreign key (accepted_version_id) references public.quotation_versions (id) deferrable initially deferred;
alter table public.cost_scenarios
  add constraint cost_scenarios_quotation_fk foreign key (quotation_id) references public.quotations (id) deferrable initially deferred;

-- Una versión enviada o aceptada no se modifica silenciosamente.
create or replace function public.protect_quotation_version()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'La versión % no puede eliminarse: ya fue enviada', old.version;
    end if;
    return old;
  end if;
  if old.status <> 'draft' and (
    new.price_per_t is distinct from old.price_per_t or new.total_amount is distinct from old.total_amount or
    new.quantity_t is distinct from old.quantity_t or new.terms is distinct from old.terms or
    new.terms_hash is distinct from old.terms_hash or new.incoterm is distinct from old.incoterm or
    new.named_place is distinct from old.named_place or new.valid_until is distinct from old.valid_until
  ) then
    raise exception 'La versión % ya fue enviada o aceptada: sus términos son inmutables; crear una nueva versión', old.version;
  end if;
  if old.status in ('accepted', 'rejected', 'superseded') and new.status is distinct from old.status then
    raise exception 'La versión % está %: su estado es definitivo', old.version, old.status;
  end if;
  return new;
end;
$$;

create trigger quotation_versions_protect
before update or delete on public.quotation_versions
for each row execute function public.protect_quotation_version();

create or replace function public.protect_version_costing()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  st text;
begin
  select status into st from public.quotation_versions where id = coalesce(old.version_id, new.version_id);
  if st is not null and st <> 'draft' then
    raise exception 'El desglose de una versión enviada o aceptada es inmutable';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger quotation_version_costing_protect
before update or delete on public.quotation_version_costing
for each row execute function public.protect_version_costing();
create trigger quotation_items_protect
before update or delete on public.quotation_items
for each row execute function public.protect_version_costing();

-- ============================================================
-- Operaciones, lotes asignados y embarques
-- ============================================================
create table public.trade_operations (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  seller_organization_id uuid not null references public.organizations (id),
  buyer_organization_id uuid not null references public.organizations (id),
  quotation_id uuid not null references public.quotations (id),
  accepted_version_id uuid references public.quotation_versions (id),
  request_id uuid references public.buyer_requests (id),
  product_id uuid not null references public.products (id),
  quantity_t numeric(14, 3) not null check (quantity_t > 0),
  price_per_t numeric(20, 6) not null check (price_per_t > 0),
  total_amount numeric(20, 6) not null check (total_amount > 0),
  currency text not null check (currency in ('USD', 'EUR', 'ARS', 'BRL')),
  incoterm text not null check (incoterm in ('FCA', 'FOB', 'CFR', 'CIF', 'DAP')),
  named_place text not null,
  payment_method text not null check (payment_method in ('advance_transfer', 'open_account', 'documentary_collection', 'letter_of_credit', 'cash_against_documents')),
  payment_terms text not null,
  shipment_date date,
  destination_country char(2) not null,
  destination_port_id uuid references public.ports (id),
  terms_hash char(64) check (terms_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('negotiation', 'confirmed', 'in_preparation', 'shipped', 'collected', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  unique (seller_organization_id, code),
  check (seller_organization_id <> buyer_organization_id),
  check (status = 'negotiation' or (accepted_version_id is not null and terms_hash is not null))
);

alter table public.quotations
  add constraint quotations_operation_fk foreign key (operation_id) references public.trade_operations (id) deferrable initially deferred;

-- La operación confirmada conserva exactamente lo pactado en la versión aceptada.
create or replace function public.protect_operation_terms()
returns trigger language plpgsql as $$
begin
  if old.status <> 'negotiation' and (
    new.quantity_t is distinct from old.quantity_t or new.price_per_t is distinct from old.price_per_t or
    new.total_amount is distinct from old.total_amount or new.terms_hash is distinct from old.terms_hash or
    new.incoterm is distinct from old.incoterm or new.accepted_version_id is distinct from old.accepted_version_id
  ) then
    raise exception 'Los términos de la operación % provienen de la versión aceptada y no se editan', old.code;
  end if;
  return new;
end;
$$;

create trigger trade_operations_protect
before update on public.trade_operations
for each row execute function public.protect_operation_terms();

-- Una operación puede incluir varios lotes y un lote asignarse parcialmente a varias operaciones.
create table public.operation_lots (
  operation_id uuid not null references public.trade_operations (id) on delete cascade,
  lot_id uuid not null references public.lots (id),
  quantity_t numeric(14, 3) not null check (quantity_t > 0),
  primary key (operation_id, lot_id)
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.trade_operations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  status text not null check (status in ('planned', 'dispatched', 'shipped', 'received', 'exception')),
  container_type_id uuid references public.container_types (id),
  vessel text,
  voyage text,
  booking_number text,
  bl_number text,
  export_permit_number text,
  port_of_loading_id uuid references public.ports (id),
  port_of_discharge_id uuid references public.ports (id),
  planned_date date,
  dispatched_at date,
  shipped_at date,
  received_at date,
  shipped_quantity_t numeric(14, 3) check (shipped_quantity_t > 0),
  packages integer check (packages >= 0),
  gross_weight_kg numeric(14, 3) check (gross_weight_kg > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('shipped', 'received') or (shipped_quantity_t is not null and shipped_at is not null))
);

create table public.shipment_containers (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  number text not null check (length(number) >= 4),
  seal text,
  gross_kg numeric(14, 3),
  vgm_kg numeric(14, 3),
  unique (shipment_id, number)
);

-- ============================================================
-- Requisitos y documentación
-- ============================================================
create table public.destination_requirements (
  id uuid primary key default gen_random_uuid(),
  country text not null check (country = '*' or country ~ '^[A-Z]{2}$'),
  ncm_prefix text,
  processing text[],
  transport_modes text[],
  payment_methods text[],
  buyer_organization_id uuid references public.organizations (id),
  category text not null check (category in ('official_origin', 'official_destination', 'buyer', 'bank', 'logistics', 'commercial')),
  document_type text not null,
  name text not null,
  description text not null,
  issuer text not null,
  responsible_party text not null check (responsible_party in ('seller', 'buyer', 'forwarder', 'customs_broker', 'bank', 'laboratory')),
  required_if text,
  source_name text not null,
  source_url text,
  verified_at date,
  verification_status text not null check (verification_status in ('estimated', 'quoted', 'verified', 'pending', 'expired')),
  due_days_before_shipment integer
);

create table public.operation_documents (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.trade_operations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  requirement_id uuid references public.destination_requirements (id),
  document_type text not null,
  name text not null,
  responsible_party text not null check (responsible_party in ('seller', 'buyer', 'forwarder', 'customs_broker', 'bank', 'laboratory')),
  status text not null check (status in ('pending', 'in_preparation', 'submitted', 'verified', 'observed', 'not_applicable')),
  due_date date,
  issuer text,
  current_version integer not null default 0 check (current_version >= 0),
  requirement_source text,
  requirement_status text check (requirement_status in ('estimated', 'quoted', 'verified', 'pending', 'expired')),
  notes text,
  observation text,
  shared_with_counterparty boolean not null default true,
  is_financial boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un documento financiero nunca se comparte; presentado/verificado exige archivo.
  check (not (is_financial and shared_with_counterparty)),
  check (status not in ('submitted', 'verified') or current_version > 0),
  check (status <> 'observed' or observation is not null)
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.operation_documents (id) on delete cascade,
  version integer not null check (version > 0),
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 0 and 10485760),
  sha256 char(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text,
  demo_content text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles (id),
  note text,
  unique (document_id, version)
);

-- ============================================================
-- Finanzas: facturas, cobros (informativos), imputaciones y conciliación
-- ============================================================
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.trade_operations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  number text not null,
  issue_date date not null,
  currency text not null check (currency in ('USD', 'EUR', 'ARS', 'BRL')),
  amount numeric(20, 2) not null check (amount > 0),
  quantity_t numeric(14, 3) not null check (quantity_t > 0),
  export_permit_number text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (organization_id, number)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.trade_operations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  reference text not null,
  received_date date not null,
  currency text not null check (currency in ('USD', 'EUR', 'ARS', 'BRL')),
  gross_amount numeric(20, 2) not null check (gross_amount > 0),
  foreign_bank_fees numeric(20, 2) not null default 0 check (foreign_bank_fees >= 0),
  local_bank_fees numeric(20, 2) not null default 0 check (local_bank_fees >= 0),
  other_deductions numeric(20, 2) not null default 0 check (other_deductions >= 0),
  net_amount numeric(20, 2) not null check (net_amount > 0),
  is_advance boolean not null default false,
  bank_name text,
  bank_report_status text not null check (bank_report_status in ('informed_by_user', 'consulted_in_source', 'verified_by_bank')),
  evidence_document_ids uuid[] not null default '{}',
  -- Registro informativo: la plataforma no ejecuta operaciones bancarias ni cambiarias.
  record_kind text not null default 'informational' check (record_kind = 'informational'),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

-- Un cobro puede cubrir varias facturas y una factura recibir varios cobros.
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(20, 2) not null check (amount > 0),
  unique (payment_id, invoice_id)
);

create or replace function public.check_payment_allocation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p record;
  inv record;
  allocated numeric;
begin
  select operation_id, gross_amount into p from public.payments where id = new.payment_id;
  select operation_id into inv from public.invoices where id = new.invoice_id;
  if p.operation_id <> inv.operation_id then
    raise exception 'El cobro y la factura pertenecen a operaciones distintas';
  end if;
  select coalesce(sum(amount), 0) into allocated from public.payment_allocations where payment_id = new.payment_id;
  if allocated > p.gross_amount then
    raise exception 'Las imputaciones (%) superan el cobro bruto (%)', allocated, p.gross_amount;
  end if;
  return new;
end;
$$;

create constraint trigger payment_allocations_check
after insert or update on public.payment_allocations
deferrable initially deferred
for each row execute function public.check_payment_allocation();

create table public.financial_reconciliations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.trade_operations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  status text not null check (status in ('no_data', 'partial', 'difference_to_review', 'reconciled_by_operator')),
  last_result jsonb,
  operator_note text,
  reconciled_by uuid references public.profiles (id),
  reconciled_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status <> 'reconciled_by_operator' or (reconciled_at is not null and length(trim(coalesce(operator_note, ''))) > 0))
);

-- ============================================================
-- Verificación, trazabilidad, blockchain y auditoría
-- ============================================================
create table public.verification_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subject_kind text not null check (subject_kind in ('cost_catalog', 'fx_rate', 'requirement', 'lot_quality', 'product_ncm', 'container_type', 'price', 'blockchain')),
  subject_id uuid not null,
  subject_field text,
  data_label text not null,
  value text not null,
  unit text not null,
  source text not null,
  evidence_url text,
  evidence_document_id uuid references public.operation_documents (id),
  consulted_at date not null,
  valid_until date,
  responsible text not null check (length(trim(responsible)) > 0),
  status text not null check (status in ('estimated', 'quoted', 'verified', 'pending', 'expired')),
  notes text,
  -- Nunca "verificado" sin respaldo identificado.
  check (status <> 'verified' or evidence_url is not null or evidence_document_id is not null)
);

create table public.verification_history (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.verification_records (id) on delete cascade,
  at timestamptz not null default now(),
  by_user uuid references public.profiles (id),
  from_status text not null,
  to_status text not null,
  value text,
  note text
);

create table public.traceability_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_user_id uuid references public.profiles (id),
  organization_id uuid not null references public.organizations (id),
  type text not null,
  title text not null,
  detail text,
  operation_id uuid references public.trade_operations (id) on delete cascade,
  lot_ids uuid[] not null default '{}',
  entity_kind text not null,
  entity_id text not null,
  shared boolean not null default false
);
create index traceability_events_operation_idx on public.traceability_events (operation_id);

-- Solo hashes y direcciones públicas; únicamente transacciones confirmadas por la red.
create table public.blockchain_records (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.trade_operations (id) on delete cascade,
  network text not null check (network in ('testnet', 'local')),
  contract_id text not null check (contract_id ~ '^C[A-Z2-7]{55}$'),
  action text not null check (action in ('create_deal', 'accept_deal', 'amend_terms', 'record_proof')),
  deal_key char(64) not null check (deal_key ~ '^[0-9a-f]{64}$'),
  terms_hash char(64) not null check (terms_hash ~ '^[0-9a-f]{64}$'),
  terms_version integer not null check (terms_version > 0),
  tx_hash char(64) not null unique check (tx_hash ~ '^[0-9a-f]{64}$'),
  ledger bigint not null check (ledger > 0),
  confirmed_at timestamptz not null,
  signer text not null check (signer ~ '^G[A-Z2-7]{55}$'),
  status text not null check (status = 'confirmed'),
  created_by uuid references public.profiles (id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_user_id uuid references public.profiles (id),
  organization_id uuid not null references public.organizations (id),
  entity text not null,
  entity_id text not null,
  action text not null,
  summary text not null,
  changes jsonb
);

create table public.app_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  rounding jsonb not null,
  stellar jsonb not null
);

-- Registros de solo inserción: historial, versiones de documentos, evidencias y auditoría.
create or replace function public.forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'La tabla % es de solo inserción: no se modifican ni eliminan registros históricos', tg_table_name;
end;
$$;

create trigger audit_logs_append_only before update or delete on public.audit_logs for each row execute function public.forbid_mutation();
create trigger traceability_events_append_only before update or delete on public.traceability_events for each row execute function public.forbid_mutation();
create trigger document_versions_append_only before update or delete on public.document_versions for each row execute function public.forbid_mutation();
create trigger blockchain_records_append_only before update or delete on public.blockchain_records for each row execute function public.forbid_mutation();
create trigger verification_history_append_only before update or delete on public.verification_history for each row execute function public.forbid_mutation();

-- ============================================================
-- Row Level Security
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'profiles', 'organization_members', 'ports', 'container_types', 'facilities', 'products',
    'product_presentations', 'lots', 'inventory_movements', 'buyer_requests', 'request_invitations',
    'request_requirements', 'commercial_matches', 'cost_catalog', 'fx_rates', 'cost_scenarios', 'scenario_lots',
    'scenario_cost_lines', 'quotations', 'quotation_versions', 'quotation_version_costing', 'quotation_items',
    'trade_operations', 'operation_lots', 'shipments', 'shipment_containers', 'destination_requirements',
    'operation_documents', 'document_versions', 'invoices', 'payments', 'payment_allocations',
    'financial_reconciliations', 'verification_records', 'verification_history', 'traceability_events',
    'blockchain_records', 'audit_logs', 'app_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Funciones de visibilidad compartidas.
create or replace function public.is_participant(op uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trade_operations o
    where o.id = op and (is_member(o.seller_organization_id) or is_member(o.buyer_organization_id))
  );
$$;

create or replace function public.is_operation_seller(op uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from trade_operations o where o.id = op and has_role(o.seller_organization_id, roles));
$$;

create or replace function public.can_view_request(req uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from buyer_requests r
    where r.id = req and (
      is_member(r.buyer_organization_id)
      or (r.status not in ('draft', 'cancelled') and (
        r.visibility = 'public'
        or exists (select 1 from request_invitations i where i.request_id = r.id and is_member(i.organization_id))
      ))
    )
  );
$$;

create or replace function public.lot_is_public(lot uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from lots l where l.id = lot and l.published and l.status = 'active');
$$;

create or replace function public.can_view_document(doc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from operation_documents d
    where d.id = doc and is_participant(d.operation_id) and (
      (is_member(d.organization_id) and (not d.is_financial or has_role(d.organization_id, array['exporter', 'admin'])))
      or (d.shared_with_counterparty and not d.is_financial)
    )
  );
$$;

create or replace function public.lot_stock_visible(lot uuid)
returns table (physical_t numeric, reserved_t numeric, committed_t numeric, available_t numeric)
language sql stable security definer set search_path = public as $$
  select
    case when is_member(l.organization_id) then s.physical_t end,
    case when is_member(l.organization_id) then s.reserved_t end,
    case when is_member(l.organization_id) then s.committed_t end,
    s.physical_t - s.reserved_t - s.committed_t
  from lots l
  cross join lateral lot_stock_raw(l.id) s
  where l.id = lot and (is_member(l.organization_id) or (l.published and l.status = 'active'));
$$;

create view public.lot_stock with (security_invoker = true) as
select l.id as lot_id, l.organization_id, s.physical_t, s.reserved_t, s.committed_t, s.available_t
from public.lots l
cross join lateral public.lot_stock_visible(l.id) s;

create or replace function public.can_view_quotation(q uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from quotations x
    where x.id = q and (
      is_member(x.seller_organization_id)
      or (is_member(x.buyer_organization_id) and exists (select 1 from quotation_versions v where v.quotation_id = x.id and v.status <> 'draft'))
    )
  );
$$;

create or replace function public.can_view_quotation_version(q uuid, version_status text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from quotations x
    where x.id = q and (is_member(x.seller_organization_id) or (is_member(x.buyer_organization_id) and version_status <> 'draft'))
  );
$$;

create or replace function public.is_quotation_seller(q uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from quotations x where x.id = q and has_role(x.seller_organization_id, roles));
$$;

-- Usuarios de la contraparte de una operación compartida (para mostrar quién hizo cada hito).
create or replace function public.is_counterparty_user(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from organization_members m
    join trade_operations o on m.organization_id in (o.seller_organization_id, o.buyer_organization_id)
    where m.user_id = target and (is_member(o.seller_organization_id) or is_member(o.buyer_organization_id))
  );
$$;

-- Directorio y catálogos de referencia.
create policy organizations_read on public.organizations for select to authenticated using (true);
create policy organizations_update on public.organizations for update to authenticated using (has_role(id, array['admin', 'exporter', 'buyer'])) with check (has_role(id, array['admin', 'exporter', 'buyer']));
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid()
  or exists (select 1 from organization_members m where m.user_id = profiles.id and is_member(m.organization_id))
  or is_counterparty_user(id)
);
create policy profiles_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy members_read on public.organization_members for select to authenticated using (is_member(organization_id));
create policy members_admin on public.organization_members for all to authenticated using (has_role(organization_id, array['admin'])) with check (has_role(organization_id, array['admin']));
create policy ports_read on public.ports for select to authenticated using (true);
create policy container_types_read on public.container_types for select to authenticated using (true);
create policy requirements_read on public.destination_requirements for select to authenticated using (true);
create policy requirements_curate on public.destination_requirements for all to authenticated
  using (exists (select 1 from organization_members m where m.user_id = auth.uid() and m.role in ('admin', 'exporter')))
  with check (exists (select 1 from organization_members m where m.user_id = auth.uid() and m.role in ('admin', 'exporter')));

-- Origen, productos y lotes.
create policy facilities_read on public.facilities for select to authenticated using (
  is_member(organization_id) or exists (select 1 from lots l where l.facility_id = facilities.id and l.published and l.status = 'active')
);
create policy facilities_write on public.facilities for all to authenticated
  using (has_role(organization_id, array['producer', 'exporter', 'admin'])) with check (has_role(organization_id, array['producer', 'exporter', 'admin']));
create policy products_read on public.products for select to authenticated using (
  is_member(organization_id) or exists (select 1 from lots l where l.product_id = products.id and l.published and l.status = 'active')
);
create policy products_write on public.products for all to authenticated
  using (has_role(organization_id, array['producer', 'exporter', 'admin'])) with check (has_role(organization_id, array['producer', 'exporter', 'admin']));
create policy presentations_read on public.product_presentations for select to authenticated using (
  exists (select 1 from products p where p.id = product_id)
);
create policy presentations_write on public.product_presentations for all to authenticated
  using (exists (select 1 from products p where p.id = product_id and has_role(p.organization_id, array['producer', 'exporter', 'admin'])))
  with check (exists (select 1 from products p where p.id = product_id and has_role(p.organization_id, array['producer', 'exporter', 'admin'])));
create policy lots_read on public.lots for select to authenticated using (is_member(organization_id) or (published and status = 'active'));
create policy lots_write on public.lots for all to authenticated
  using (has_role(organization_id, array['producer', 'admin'])) with check (has_role(organization_id, array['producer', 'admin']));
create policy movements_read on public.inventory_movements for select to authenticated using (is_member(organization_id));
create policy movements_insert on public.inventory_movements for insert to authenticated with check (has_role(organization_id, array['producer', 'exporter', 'admin']));

-- Demanda.
create policy requests_read on public.buyer_requests for select to authenticated using (can_view_request(id));
create policy requests_write on public.buyer_requests for all to authenticated
  using (has_role(buyer_organization_id, array['buyer', 'admin'])) with check (has_role(buyer_organization_id, array['buyer', 'admin']));
create policy invitations_read on public.request_invitations for select to authenticated using (can_view_request(request_id));
create policy invitations_write on public.request_invitations for all to authenticated
  using (exists (select 1 from buyer_requests r where r.id = request_id and has_role(r.buyer_organization_id, array['buyer', 'admin'])))
  with check (exists (select 1 from buyer_requests r where r.id = request_id and has_role(r.buyer_organization_id, array['buyer', 'admin'])));
create policy request_requirements_read on public.request_requirements for select to authenticated using (can_view_request(request_id));
create policy request_requirements_write on public.request_requirements for all to authenticated
  using (exists (select 1 from buyer_requests r where r.id = request_id and has_role(r.buyer_organization_id, array['buyer', 'admin'])))
  with check (exists (select 1 from buyer_requests r where r.id = request_id and has_role(r.buyer_organization_id, array['buyer', 'admin'])));
create policy matches_own on public.commercial_matches for all to authenticated using (is_member(organization_id)) with check (is_member(organization_id));

-- Costos privados del vendedor.
create policy catalog_read on public.cost_catalog for select to authenticated using (has_role(organization_id, array['producer', 'exporter', 'admin']));
create policy catalog_write on public.cost_catalog for all to authenticated using (has_role(organization_id, array['exporter', 'admin'])) with check (has_role(organization_id, array['exporter', 'admin']));
create policy fx_read on public.fx_rates for select to authenticated using (is_member(organization_id));
create policy fx_write on public.fx_rates for all to authenticated using (has_role(organization_id, array['exporter', 'admin'])) with check (has_role(organization_id, array['exporter', 'admin']));
create policy scenarios_own on public.cost_scenarios for all to authenticated
  using (has_role(organization_id, array['producer', 'exporter', 'admin'])) with check (has_role(organization_id, array['producer', 'exporter', 'admin']));
create policy scenario_lots_own on public.scenario_lots for all to authenticated
  using (exists (select 1 from cost_scenarios s where s.id = scenario_id and has_role(s.organization_id, array['producer', 'exporter', 'admin'])))
  with check (exists (select 1 from cost_scenarios s where s.id = scenario_id and has_role(s.organization_id, array['producer', 'exporter', 'admin'])));
create policy scenario_lines_own on public.scenario_cost_lines for all to authenticated
  using (exists (select 1 from cost_scenarios s where s.id = scenario_id and has_role(s.organization_id, array['producer', 'exporter', 'admin'])))
  with check (exists (select 1 from cost_scenarios s where s.id = scenario_id and has_role(s.organization_id, array['producer', 'exporter', 'admin'])));

-- Cotizaciones: el comprador ve términos y precio de versiones enviadas; nunca el costeo.
create policy quotations_read on public.quotations for select to authenticated using (can_view_quotation(id));
create policy quotations_seller on public.quotations for all to authenticated
  using (has_role(seller_organization_id, array['producer', 'exporter', 'admin'])) with check (has_role(seller_organization_id, array['producer', 'exporter', 'admin']));
create policy versions_read on public.quotation_versions for select to authenticated using (can_view_quotation_version(quotation_id, status));
create policy versions_seller on public.quotation_versions for all to authenticated
  using (is_quotation_seller(quotation_id, array['producer', 'exporter', 'admin']))
  with check (is_quotation_seller(quotation_id, array['producer', 'exporter', 'admin']));
create policy costing_seller on public.quotation_version_costing for all to authenticated
  using (has_role(seller_organization_id, array['producer', 'exporter', 'admin'])) with check (has_role(seller_organization_id, array['producer', 'exporter', 'admin']));
create policy items_seller on public.quotation_items for all to authenticated
  using (has_role(seller_organization_id, array['producer', 'exporter', 'admin'])) with check (has_role(seller_organization_id, array['producer', 'exporter', 'admin']));

-- La respuesta del comprador pasa por una función que solo cambia el estado de una versión enviada
-- (mismas reglas que acceptQuotationVersion en la app). La operación la crea luego el vendedor
-- a partir de la versión aceptada; sus términos quedan protegidos por protect_operation_terms.
create or replace function public.respond_quotation_version(version_id uuid, accept boolean, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  select qv.*, q.buyer_organization_id into v
  from quotation_versions qv join quotations q on q.id = qv.quotation_id
  where qv.id = version_id for update;
  if not found then raise exception 'Versión inexistente'; end if;
  if not has_role(v.buyer_organization_id, array['buyer', 'admin']) then
    raise exception 'Solo la empresa compradora puede responder la cotización';
  end if;
  if exists (select 1 from quotations q where q.id = v.quotation_id and q.status = 'accepted') then
    raise exception 'La cotización ya tiene una versión aceptada';
  end if;
  if v.status <> 'sent' then raise exception 'Solo se responden versiones enviadas'; end if;
  if v.valid_until < current_date then raise exception 'La versión está vencida'; end if;
  if accept then
    update quotation_versions set status = 'accepted', accepted_at = now(), accepted_by = auth.uid() where id = version_id;
    update quotation_versions set status = 'superseded'
    where quotation_id = v.quotation_id and id <> version_id and status in ('draft', 'sent');
    update quotations set status = 'accepted', accepted_version_id = version_id, updated_at = now() where id = v.quotation_id;
  else
    if coalesce(trim(reason), '') = '' then raise exception 'Indicar el motivo del rechazo'; end if;
    update quotation_versions set status = 'rejected', rejected_at = now(), rejected_by = auth.uid(), rejection_reason = reason where id = version_id;
    update quotations set status = 'rejected', updated_at = now() where id = v.quotation_id;
  end if;
end;
$$;

-- Operaciones: ambas partes las ven; solo el vendedor (COMEX) las gestiona.
create policy operations_read on public.trade_operations for select to authenticated using (is_member(seller_organization_id) or is_member(buyer_organization_id));
create policy operations_seller on public.trade_operations for all to authenticated
  using (has_role(seller_organization_id, array['exporter', 'admin'])) with check (has_role(seller_organization_id, array['exporter', 'admin']));
create policy operation_lots_read on public.operation_lots for select to authenticated using (is_participant(operation_id));
create policy operation_lots_seller on public.operation_lots for all to authenticated
  using (is_operation_seller(operation_id, array['exporter', 'admin'])) with check (is_operation_seller(operation_id, array['exporter', 'admin']));
create policy shipments_read on public.shipments for select to authenticated using (is_participant(operation_id));
create policy shipments_seller on public.shipments for all to authenticated
  using (is_operation_seller(operation_id, array['exporter', 'admin'])) with check (is_operation_seller(operation_id, array['exporter', 'admin']));
create policy containers_read on public.shipment_containers for select to authenticated using (exists (select 1 from shipments s where s.id = shipment_id));
create policy containers_seller on public.shipment_containers for all to authenticated
  using (exists (select 1 from shipments s where s.id = shipment_id and is_operation_seller(s.operation_id, array['exporter', 'admin'])))
  with check (exists (select 1 from shipments s where s.id = shipment_id and is_operation_seller(s.operation_id, array['exporter', 'admin'])));

-- Documentos: propios, o compartidos no financieros de la contraparte.
create policy documents_read on public.operation_documents for select to authenticated using (can_view_document(id));
create policy documents_insert on public.operation_documents for insert to authenticated with check (
  is_member(organization_id) and is_participant(operation_id)
  and (not is_financial or has_role(organization_id, array['exporter', 'admin']))
);
create policy documents_update on public.operation_documents for update to authenticated
  using (can_view_document(id) and is_member(organization_id))
  with check (is_member(organization_id) and (not is_financial or has_role(organization_id, array['exporter', 'admin'])));
create policy documents_delete on public.operation_documents for delete to authenticated
  using (has_role(organization_id, array['exporter', 'admin']) and current_version = 0);
create policy documents_review on public.operation_documents for update to authenticated
  using (is_operation_seller(operation_id, array['exporter', 'admin'])) with check (is_operation_seller(operation_id, array['exporter', 'admin']));
create policy document_versions_read on public.document_versions for select to authenticated using (can_view_document(document_id));
create policy document_versions_insert on public.document_versions for insert to authenticated with check (
  exists (select 1 from operation_documents d where d.id = document_id and is_member(d.organization_id))
);

-- Finanzas: solo exportador/administrador del vendedor.
create policy invoices_seller on public.invoices for all to authenticated using (has_role(organization_id, array['exporter', 'admin'])) with check (has_role(organization_id, array['exporter', 'admin']));
create policy payments_seller on public.payments for all to authenticated using (has_role(organization_id, array['exporter', 'admin'])) with check (has_role(organization_id, array['exporter', 'admin']));
create policy allocations_seller on public.payment_allocations for all to authenticated
  using (exists (select 1 from payments p where p.id = payment_id and has_role(p.organization_id, array['exporter', 'admin'])))
  with check (exists (select 1 from payments p where p.id = payment_id and has_role(p.organization_id, array['exporter', 'admin'])));
create policy reconciliations_seller on public.financial_reconciliations for all to authenticated
  using (has_role(organization_id, array['exporter', 'admin'])) with check (has_role(organization_id, array['exporter', 'admin']));

-- Verificación, trazabilidad, blockchain, auditoría y configuración.
create policy verifications_read on public.verification_records for select to authenticated using (is_member(organization_id));
create policy verifications_write on public.verification_records for all to authenticated
  using (has_role(organization_id, array['exporter', 'admin'])) with check (has_role(organization_id, array['exporter', 'admin']));
create policy verification_history_read on public.verification_history for select to authenticated using (exists (select 1 from verification_records r where r.id = record_id));
create policy verification_history_insert on public.verification_history for insert to authenticated with check (
  exists (select 1 from verification_records r where r.id = record_id and has_role(r.organization_id, array['exporter', 'admin']))
);
create policy events_read on public.traceability_events for select to authenticated using (
  is_member(organization_id)
  or (shared and (operation_id is null or is_participant(operation_id)))
);
create policy events_insert on public.traceability_events for insert to authenticated with check (is_member(organization_id));
create policy blockchain_read on public.blockchain_records for select to authenticated using (is_participant(operation_id));
create policy blockchain_insert on public.blockchain_records for insert to authenticated with check (is_participant(operation_id));
create policy audit_read on public.audit_logs for select to authenticated using (has_role(organization_id, array['exporter', 'admin']));
create policy audit_insert on public.audit_logs for insert to authenticated with check (is_member(organization_id));
create policy settings_read on public.app_settings for select to authenticated using (is_member(organization_id));
create policy settings_admin on public.app_settings for all to authenticated using (has_role(organization_id, array['admin'])) with check (has_role(organization_id, array['admin']));

grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.lot_stock_raw(uuid) from authenticated;
