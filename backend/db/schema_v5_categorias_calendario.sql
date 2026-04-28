-- schema_v5_categorias_calendario.sql
-- Adiciona suporte a múltiplas categorias de agenda, horários e recorrência genérica.
-- Aplicar após schema_v4_fornecedor_notas.sql

-- ============================================================
-- 1. Tabela de categorias de agenda por tenant
-- ============================================================

CREATE TABLE IF NOT EXISTS categorias_agenda (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome        TEXT        NOT NULL,
  cor         TEXT        NOT NULL DEFAULT '#3B82F6',
  icone       TEXT,
  ativo       BOOLEAN     NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, nome)
);

ALTER TABLE categorias_agenda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_categorias_agenda"
  ON categorias_agenda
  FOR ALL
  USING (tenant_id = (current_setting('app.tenant_id', TRUE))::UUID);

-- ============================================================
-- 2. Novos campos em agenda_ocorrencias
-- ============================================================

ALTER TABLE agenda_ocorrencias
  ADD COLUMN IF NOT EXISTS titulo        TEXT,
  ADD COLUMN IF NOT EXISTS hora_inicio   TIME,
  ADD COLUMN IF NOT EXISTS hora_fim      TIME,
  ADD COLUMN IF NOT EXISTS categoria_id  UUID REFERENCES categorias_agenda(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recorrencia   JSONB;

-- ============================================================
-- 3. Categorias padrão — inserir para cada tenant existente
--    (Fornecedores vem pré-cadastrada; as demais o cliente cria)
-- ============================================================

INSERT INTO categorias_agenda (tenant_id, nome, cor, icone)
SELECT id, 'Agenda de Compras', '#F59E0B', 'truck'
FROM tenants
ON CONFLICT (tenant_id, nome) DO NOTHING;

INSERT INTO categorias_agenda (tenant_id, nome, cor, icone)
SELECT id, 'Pessoal', '#F59E0B', 'user'
FROM tenants
ON CONFLICT (tenant_id, nome) DO NOTHING;

INSERT INTO categorias_agenda (tenant_id, nome, cor, icone)
SELECT id, 'Operacional', '#10B981', 'settings'
FROM tenants
ON CONFLICT (tenant_id, nome) DO NOTHING;

-- ============================================================
-- 4. Vincular ocorrências existentes de fornecedor à categoria
--    'Fornecedores' do respectivo tenant
-- ============================================================

UPDATE agenda_ocorrencias ao
SET categoria_id = ca.id
FROM categorias_agenda ca
WHERE ca.tenant_id = ao.tenant_id
  AND ca.nome = 'Fornecedores'
  AND ao.categoria_id IS NULL
  AND ao.fornecedor_id IS NOT NULL;

-- ============================================================
-- 5. Índice de performance para consultas por categoria e data
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_agenda_ocorrencias_categoria
  ON agenda_ocorrencias (tenant_id, categoria_id, data_prevista);
