-- schema_v19_relatorio_semanal_log.sql
-- Adiciona os tipos do relatório SEMANAL ao CHECK de relatorio_log.tipo.
-- Alteração aditiva e segura (superset dos valores atuais) — tabela existente,
-- não requer GRANT/RLS novos.

ALTER TABLE relatorio_log DROP CONSTRAINT IF EXISTS relatorio_log_tipo_check;
ALTER TABLE relatorio_log ADD CONSTRAINT relatorio_log_tipo_check
  CHECK (tipo IN (
    'auditoria', 'agenda_proximo', 'consolidado_gestor', 'convite', 'admin_copia',
    'semanal_gestor', 'semanal_auditoria', 'semanal_admin_copia'
  ));
