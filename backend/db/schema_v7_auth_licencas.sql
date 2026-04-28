-- schema_v7_auth_licencas.sql
-- Adiciona autenticação real via Supabase Auth (Opção A: auth direto em compradores)
-- e tabela de licenças/validade por tenant.
-- Aplicar após schema_v6_notas_painel.sql

-- ============================================================
-- 1. Vinculação de compradores ao Supabase Auth
--    Adiciona user_id e email (para lookup) em compradores
-- ============================================================

ALTER TABLE compradores
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Índices para lookup eficiente
CREATE INDEX IF NOT EXISTS idx_compradores_user_id
  ON compradores (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compradores_email
  ON compradores (tenant_id, email)
  WHERE email IS NOT NULL;

-- ============================================================
-- 2. Tabela de licenças/validade por tenant
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_licencas (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plano            TEXT        NOT NULL DEFAULT 'basico',
  status           TEXT        NOT NULL DEFAULT 'ativo',
  -- status: ativo | implantacao | bloqueado | expirado
  inicio_vigencia  DATE        NOT NULL DEFAULT CURRENT_DATE,
  fim_vigencia     DATE,
  limite_compradores INTEGER,
  observacoes      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant_licencas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_licencas" ON tenant_licencas FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_tenant_licencas_tenant
  ON tenant_licencas (tenant_id);

-- ============================================================
-- 3. Inserir licença padrão para tenants existentes
-- ============================================================

INSERT INTO tenant_licencas (tenant_id, plano, status, inicio_vigencia)
SELECT id, 'basico', 'ativo', CURRENT_DATE
FROM tenants
ON CONFLICT DO NOTHING;
