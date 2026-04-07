-- Agenda de Compras Web - Schema V2
-- Complementa a base multi-tenant para uso com Supabase + painel de clientes.

create schema if not exists app;

alter table tenants
  add column if not exists slug text,
  add column if not exists status text not null default 'implantacao',
  add column if not exists plano text not null default 'basico',
  add column if not exists contato_nome text,
  add column if not exists contato_email text,
  add column if not exists observacoes text,
  add column if not exists updated_at timestamptz not null default now();

update tenants
set slug = lower(regexp_replace(nome, '[^a-zA-Z0-9]+', '-', 'g'))
where slug is null;

alter table tenants
  alter column slug set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenants_slug_key'
  ) then
    alter table tenants add constraint tenants_slug_key unique (slug);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenants_status_check'
  ) then
    alter table tenants add constraint tenants_status_check
      check (status in ('ativo', 'implantacao', 'bloqueado', 'inativo'));
  end if;
end $$;

create table if not exists tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'buyer', 'viewer')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists idx_tenant_users_tenant on tenant_users(tenant_id);
create index if not exists idx_tenant_users_user on tenant_users(user_id);

create or replace function app.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  ) = 'service_role';
$$;

create or replace function app.user_belongs_to_tenant(target_tenant uuid)
returns boolean
language sql
stable
as $$
  select
    app.is_service_role()
    or exists (
      select 1
      from tenant_users tu
      where tu.tenant_id = target_tenant
        and tu.user_id = auth.uid()
        and tu.ativo = true
    );
$$;

alter table tenants enable row level security;
alter table compradores enable row level security;
alter table fornecedores enable row level security;
alter table fornecedor_dias_compra enable row level security;
alter table agenda_ocorrencias enable row level security;
alter table regras_agenda_fornecedor enable row level security;
alter table tenant_users enable row level security;

drop policy if exists "tenant read access" on tenants;
create policy "tenant read access" on tenants
for select
using (app.user_belongs_to_tenant(id));

drop policy if exists "tenant update access" on tenants;
create policy "tenant update access" on tenants
for update
using (app.user_belongs_to_tenant(id))
with check (app.user_belongs_to_tenant(id));

drop policy if exists "tenant membership access" on tenant_users;
create policy "tenant membership access" on tenant_users
for select
using (app.user_belongs_to_tenant(tenant_id));

drop policy if exists "compradores tenant access" on compradores;
create policy "compradores tenant access" on compradores
for all
using (app.user_belongs_to_tenant(tenant_id))
with check (app.user_belongs_to_tenant(tenant_id));

drop policy if exists "fornecedores tenant access" on fornecedores;
create policy "fornecedores tenant access" on fornecedores
for all
using (app.user_belongs_to_tenant(tenant_id))
with check (app.user_belongs_to_tenant(tenant_id));

drop policy if exists "fornecedor_dias tenant access" on fornecedor_dias_compra;
create policy "fornecedor_dias tenant access" on fornecedor_dias_compra
for all
using (app.user_belongs_to_tenant(tenant_id))
with check (app.user_belongs_to_tenant(tenant_id));

drop policy if exists "agenda tenant access" on agenda_ocorrencias;
create policy "agenda tenant access" on agenda_ocorrencias
for all
using (app.user_belongs_to_tenant(tenant_id))
with check (app.user_belongs_to_tenant(tenant_id));

drop policy if exists "regras tenant access" on regras_agenda_fornecedor;
create policy "regras tenant access" on regras_agenda_fornecedor
for all
using (app.user_belongs_to_tenant(tenant_id))
with check (app.user_belongs_to_tenant(tenant_id));

-- O painel administrativo global deve usar a service_role do Supabase
-- ou uma API backend protegida por token para criar/editar clientes.
