-- schema_v12_audit_log.sql
-- Log de auditoria para eventos de fornecedor (criação, exclusão, alterações de campos).
-- Eventos de agenda de compras já ficam em agenda_ocorrencias.observacao (JSON).

CREATE TABLE IF NOT EXISTS audit_log (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  comprador_id     uuid REFERENCES compradores(id) ON DELETE SET NULL,
  tipo_objeto      text NOT NULL DEFAULT 'fornecedor',
  objeto_id        uuid,
  objeto_nome      text,
  acao             text NOT NULL,
  campos_alterados jsonb,
  executor_role    text,
  executor_nome    text,
  created_at       timestamptz DEFAULT now()
);

-- acao possíveis: 'criacao', 'exclusao', 'alteracao'
-- campos_alterados: { "nome_campo": { "de": valor_anterior, "para": valor_novo } }

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
  ON audit_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_objeto
  ON audit_log(tenant_id, tipo_objeto, objeto_id);

-- RLS — mesmo padrão das demais tabelas do sistema
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log tenant access" ON audit_log;
CREATE POLICY "audit_log tenant access" ON audit_log
  FOR ALL
  USING (app.user_belongs_to_tenant(tenant_id))
  WITH CHECK (app.user_belongs_to_tenant(tenant_id));
