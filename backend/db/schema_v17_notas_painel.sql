-- schema_v17_notas_painel.sql
-- Notas livres do Painel de Notas (post-it desvinculado de agenda_ocorrencias).
-- Aplicar após schema_v16_serie_recorrencia.sql

-- ============================================================
-- 1. Tabela notas_painel
-- ============================================================
-- Diferente de agenda_ocorrencias.nota (que é a nota grudada num
-- compromisso específico — post-it que some quando a ocorrência é
-- tratada/excluída), notas_painel são notas autônomas criadas direto
-- pelo botão "+ Nova nota" no Painel de Notas. Servem como recados
-- soltos do dia-a-dia da operação, vinculados ao comprador ativo no
-- momento da criação.

CREATE TABLE IF NOT EXISTS notas_painel (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  comprador_id UUID        REFERENCES compradores(id) ON DELETE SET NULL,
  texto        TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notas_painel_tenant_comprador
  ON notas_painel (tenant_id, comprador_id);

-- ============================================================
-- 2. RLS — isolamento por tenant feito na aplicação (padrão do projeto)
-- ============================================================
-- Mesma convenção do resto do schema: USING (true) e o backend/frontend
-- filtra por tenant_id em toda query. Ver CLAUDE.md > Arquitetura.

ALTER TABLE notas_painel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_notas_painel"
  ON notas_painel
  FOR ALL
  USING (true);

-- ============================================================
-- 3. Grants para REST funcionar via Supabase
-- ============================================================
-- Sem isso, o cliente JS recebe 401/403 ao chamar /rest/v1/notas_painel.

GRANT ALL ON notas_painel TO authenticated, anon, service_role;
