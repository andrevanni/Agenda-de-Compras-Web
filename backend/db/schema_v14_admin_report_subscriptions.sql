-- schema_v14: inscrições de admins para receber cópias dos relatórios diários por tenant

CREATE TABLE IF NOT EXISTS admin_report_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email text       NOT NULL,
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (admin_email, tenant_id)
);

-- Adiciona 'admin_copia' ao CHECK constraint de relatorio_log.tipo
ALTER TABLE relatorio_log DROP CONSTRAINT IF EXISTS relatorio_log_tipo_check;
ALTER TABLE relatorio_log ADD CONSTRAINT relatorio_log_tipo_check
  CHECK (tipo IN ('auditoria', 'agenda_proximo', 'consolidado_gestor', 'convite', 'admin_copia'));
