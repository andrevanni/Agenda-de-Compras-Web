-- Agenda de Compras Web - Schema V3
-- Cadastro comercial de clientes e controle de validade/licenciamento.

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid unique references tenants(id) on delete set null,
  razao_social text not null,
  nome_fantasia text not null,
  documento text,
  email_responsavel text,
  telefone text,
  status text not null default 'ativo' check (status in ('ativo', 'implantacao', 'inativo', 'bloqueado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clientes_tenant on clientes(tenant_id);
create index if not exists idx_clientes_status on clientes(status);

create table if not exists clientes_licencas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  plano text not null default 'basico',
  limite_usuarios int not null default 1 check (limite_usuarios >= 1),
  status text not null default 'ativo' check (status in ('ativo', 'implantacao', 'vencido', 'bloqueado')),
  data_inicio_vigencia date,
  data_fim_vigencia date,
  dias_aviso_vencimento int not null default 15 check (dias_aviso_vencimento >= 0),
  bloqueado_manual boolean not null default false,
  motivo_bloqueio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clientes_licencas_cliente on clientes_licencas(cliente_id);
create index if not exists idx_clientes_licencas_vigencia on clientes_licencas(data_fim_vigencia);

comment on table clientes is 'Cadastro comercial do cliente, separado do tenant operacional.';
comment on table clientes_licencas is 'Controle de vigencia, plano e bloqueio da utilizacao da ferramenta.';
