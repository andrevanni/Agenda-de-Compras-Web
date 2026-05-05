-- schema_v13_relatorio_log_convite.sql
-- Adiciona 'convite' como tipo válido em relatorio_log.

ALTER TABLE relatorio_log
  DROP CONSTRAINT IF EXISTS relatorio_log_tipo_check;

ALTER TABLE relatorio_log
  ADD CONSTRAINT relatorio_log_tipo_check
  CHECK (tipo IN ('auditoria', 'agenda_proximo', 'consolidado_gestor', 'convite'));
