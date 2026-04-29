-- ============================================================
-- schema_v9_fornecedor_horario.sql
-- Adiciona horário padrão de visita/pedido ao fornecedor
-- Rodar no SQL Editor do Supabase
-- ============================================================

ALTER TABLE fornecedores
  ADD COLUMN IF NOT EXISTS hora_inicio time DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hora_fim     time DEFAULT NULL;
