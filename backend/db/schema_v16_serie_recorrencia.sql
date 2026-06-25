-- schema_v16_serie_recorrencia.sql
-- Adiciona suporte a "série" de ocorrências para edição/exclusão em massa.
-- Aplicar após schema_v15_tratamento_pedido.sql

-- ============================================================
-- 1. Coluna serie_id em agenda_ocorrencias
-- ============================================================
-- UUID compartilhado por todas as ocorrências criadas no mesmo
-- "Novo Evento" (multi-data e/ou multi-comprador). Usado para
-- edição/exclusão em massa pelo frontend.
--
-- NULL em:
--   - ocorrências legado (criadas antes desta migration);
--   - itens da Agenda de Compras automática (fornecedor_id IS NOT NULL),
--     que continuam sendo geridos individualmente pela lógica de tratamento;
--   - eventos criados como ocorrência única (1 data × 1 comprador).

ALTER TABLE agenda_ocorrencias
  ADD COLUMN IF NOT EXISTS serie_id UUID;

-- ============================================================
-- 2. Índice de performance para queries por série
-- ============================================================
-- Usado em PATCH/DELETE em massa pelo frontend
-- (?serie_id=eq.X&tenant_id=eq.Y...).
-- Índice parcial (WHERE serie_id IS NOT NULL) economiza espaço,
-- já que ocorrências legado ficam fora.

CREATE INDEX IF NOT EXISTS idx_agenda_ocorrencias_serie
  ON agenda_ocorrencias (tenant_id, serie_id)
  WHERE serie_id IS NOT NULL;
