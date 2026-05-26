-- schema_v15_tratamento_pedido.sql
-- Adiciona captura de dados de pedido ao tratamento da agenda.
-- Quando o comprador trata uma agenda, agora precisa informar se houve pedido:
--   - Se SIM: quantidade total (inteiro) + valor total (R$)
--   - Se NÃO: motivo (enum CHECK) + detalhe opcional (texto livre)
-- Tratamentos anteriores ficam com pedido_realizado = NULL e aparecem como "—" na auditoria.

ALTER TABLE agenda_ocorrencias
  ADD COLUMN IF NOT EXISTS pedido_realizado      BOOLEAN,
  ADD COLUMN IF NOT EXISTS pedido_quantidade     INTEGER,
  ADD COLUMN IF NOT EXISTS pedido_valor          NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS pedido_motivo_nao     TEXT,
  ADD COLUMN IF NOT EXISTS pedido_motivo_detalhe TEXT;

-- Constraint do motivo (apenas valores válidos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'agenda_ocorrencias_pedido_motivo_nao_check'
      AND table_name = 'agenda_ocorrencias'
  ) THEN
    ALTER TABLE agenda_ocorrencias
      ADD CONSTRAINT agenda_ocorrencias_pedido_motivo_nao_check
      CHECK (pedido_motivo_nao IS NULL OR pedido_motivo_nao IN (
        'NAO_DEU_PEDIDO_MINIMO',
        'FORNECEDOR_NAO_CUMPRIU',
        'INDEFINICAO_COMERCIAL',
        'OUTROS'
      ));
  END IF;
END $$;

-- Constraint de coerência: se pedido_realizado = true, qtd e valor são obrigatórios.
-- Se pedido_realizado = false, motivo é obrigatório.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'agenda_ocorrencias_pedido_coerencia_check'
      AND table_name = 'agenda_ocorrencias'
  ) THEN
    ALTER TABLE agenda_ocorrencias
      ADD CONSTRAINT agenda_ocorrencias_pedido_coerencia_check
      CHECK (
        pedido_realizado IS NULL
        OR (pedido_realizado = TRUE  AND pedido_quantidade IS NOT NULL AND pedido_valor IS NOT NULL)
        OR (pedido_realizado = FALSE AND pedido_motivo_nao IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agenda_pedido_realizado
  ON agenda_ocorrencias(tenant_id, pedido_realizado);
