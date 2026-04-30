-- schema_v10_gestor_notificacoes.sql
-- Adiciona preferências de notificação e papel de gestor nos compradores.
-- Cria tabela de log de envios de relatórios.

ALTER TABLE compradores
  ADD COLUMN IF NOT EXISTS is_gestor             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS receber_auditoria     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS receber_agenda_proximo boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS relatorio_log (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  comprador_id    uuid REFERENCES compradores(id) ON DELETE SET NULL,
  tipo            text NOT NULL CHECK (tipo IN ('auditoria', 'agenda_proximo', 'consolidado_gestor')),
  data_referencia date NOT NULL,
  email_destino   text NOT NULL,
  status          text NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'erro')),
  erro_mensagem   text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relatorio_log_tenant_data
  ON relatorio_log(tenant_id, data_referencia DESC);
