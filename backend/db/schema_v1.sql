-- Agenda de Compras Web - Schema V1 (Supabase/PostgreSQL)
-- Multi-tenant: todas as tabelas de negócio possuem tenant_id.

create extension if not exists "pgcrypto";

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now()
);

create table if not exists compradores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nome_comprador text not null,
  telefone text,
  email text,
  senha_hash text,
  foto_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists fornecedores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  codigo_fornecedor text not null,
  nome_fornecedor text not null,
  data_primeiro_pedido date not null,
  frequencia_revisao int not null check (frequencia_revisao in (1,2,4,8,12)),
  parametro_estoque int not null check (parametro_estoque >= 0),
  lead_time_entrega int not null check (lead_time_entrega >= 0),
  parametro_compra int generated always as (parametro_estoque + lead_time_entrega) stored,
  comprador_id uuid references compradores(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, codigo_fornecedor)
);

create table if not exists fornecedor_dias_compra (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  fornecedor_id uuid not null references fornecedores(id) on delete cascade,
  dia_semana text not null check (dia_semana in ('SEGUNDA','TERCA','QUARTA','QUINTA','SEXTA','SABADO','DOMINGO')),
  created_at timestamptz not null default now(),
  unique (fornecedor_id, dia_semana)
);

create table if not exists agenda_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  fornecedor_id uuid not null references fornecedores(id) on delete cascade,
  comprador_id uuid references compradores(id) on delete set null,
  data_prevista date not null,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','REALIZADA','CANCELADA','ADIADA')),
  observacao text,
  data_realizacao date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists regras_agenda_fornecedor (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  fornecedor_id uuid not null references fornecedores(id) on delete cascade,
  data_inicial date not null,
  frequencia_tipo text not null check (frequencia_tipo in ('SEMANAL','QUINZENAL','MENSAL')),
  intervalo_frequencia int not null default 1 check (intervalo_frequencia >= 1),
  dia_semana int check (dia_semana between 0 and 6),
  dia_mes int check (dia_mes between 1 and 31),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_fornecedores_tenant on fornecedores(tenant_id);
create index if not exists idx_fornecedor_dias_tenant on fornecedor_dias_compra(tenant_id, fornecedor_id);
create index if not exists idx_agenda_tenant_data on agenda_ocorrencias(tenant_id, data_prevista);
create index if not exists idx_agenda_tenant_status on agenda_ocorrencias(tenant_id, status);

-- Regras de integridade equivalentes ao desktop devem ficar no backend
-- (ex.: frequência 1/2/4 exige 1 dia; 8 exige 2; 12 exige 3).
