-- ============================================================
-- DROGARIA SV — Destro & Destro
-- Setup inicial no Supabase — rodar no SQL Editor
-- tenant_id: f0d557c6-9dd9-4e80-96e0-2094da4a40ff
-- ============================================================

DO $$
DECLARE
  v_tenant_id        uuid := 'f0d557c6-9dd9-4e80-96e0-2094da4a40ff';
  v_cat_operacional  uuid;
  d                  date;
BEGIN

  -- ── 1. Compradores (senha_hash = 123456, alterar depois) ──
  INSERT INTO compradores (tenant_id, nome_comprador, email, senha_hash)
  VALUES
    (v_tenant_id, 'Willian',  'willian@gsvalentim.com.br',  '123456'),
    (v_tenant_id, 'Pedro',    'pedro@gsvalentim.com.br',    '123456'),
    (v_tenant_id, 'Lívia',    'livia@gsvalentim.com.br',    '123456'),
    (v_tenant_id, 'Rose',     'rose@gsvalentim.com.br',     '123456'),
    (v_tenant_id, 'Paula',    'paula@gsvalentim.com.br',    '123456'),
    (v_tenant_id, 'Ezequiel', 'ezequiel@gsvalentim.com.br', '123456'),
    (v_tenant_id, 'Thiago',   'thiago@gsvalentim.com.br',   '123456')
  ON CONFLICT (tenant_id, email) DO NOTHING;

  -- ── 2. Categorias extras ──────────────────────────────────
  INSERT INTO categorias_agenda (tenant_id, nome, cor)
  VALUES
    (v_tenant_id, 'Propagados',          '#8B5CF6'),
    (v_tenant_id, 'Genéricos/Similares', '#06B6D4'),
    (v_tenant_id, 'Perfumaria',          '#EC4899')
  ON CONFLICT DO NOTHING;

  -- ── 3. ID da categoria Operacional ───────────────────────
  SELECT id INTO v_cat_operacional
  FROM categorias_agenda
  WHERE tenant_id = v_tenant_id AND nome = 'Operacional'
  LIMIT 1;

  -- ── 4. Tarefas operacionais diárias (4 semanas) ──────────
  FOR d IN
    SELECT generate_series('2026-05-04'::date, '2026-05-29'::date, '1 day'::interval)::date
  LOOP
    IF EXTRACT(DOW FROM d) BETWEEN 1 AND 5 THEN

      -- 08:00 Conciliação de Compra
      INSERT INTO agenda_ocorrencias (tenant_id, titulo, data_prevista, hora_inicio, hora_fim, status, categoria_id)
      VALUES (v_tenant_id, 'Conciliação de Compra', d, '08:00', '08:30', 'PENDENTE', v_cat_operacional);

      -- 08:30 Verificação de Nota s/ Pedido
      INSERT INTO agenda_ocorrencias (tenant_id, titulo, data_prevista, hora_inicio, hora_fim, status, categoria_id)
      VALUES (v_tenant_id, 'Verificação de Nota s/ Pedido', d, '08:30', '09:00', 'PENDENTE', v_cat_operacional);

      -- 14:00 Análise de Estoque
      INSERT INTO agenda_ocorrencias (tenant_id, titulo, data_prevista, hora_inicio, hora_fim, status, categoria_id)
      VALUES (v_tenant_id, 'Análise de Estoque', d, '14:00', '14:30', 'PENDENTE', v_cat_operacional);

      -- 16:00 Falteiro após 16h
      INSERT INTO agenda_ocorrencias (tenant_id, titulo, data_prevista, hora_inicio, hora_fim, status, categoria_id)
      VALUES (v_tenant_id, 'Falteiro após 16h', d, '16:00', '17:00', 'PENDENTE', v_cat_operacional);

      -- Terça (2) e Quinta (4): Marcar Visitas
      IF EXTRACT(DOW FROM d) IN (2, 4) THEN
        INSERT INTO agenda_ocorrencias (tenant_id, titulo, data_prevista, hora_inicio, hora_fim, status, categoria_id)
        VALUES (v_tenant_id, 'Marcar Visitas com Representantes', d, '10:00', '11:00', 'PENDENTE', v_cat_operacional);
      END IF;

      -- Quinta (4): Transferência de Excesso
      IF EXTRACT(DOW FROM d) = 4 THEN
        INSERT INTO agenda_ocorrencias (tenant_id, titulo, data_prevista, hora_inicio, hora_fim, status, categoria_id)
        VALUES (v_tenant_id, 'Transferência de Excesso s/ Venda', d, '15:00', '16:00', 'PENDENTE', v_cat_operacional);
      END IF;

    END IF;
  END LOOP;

  RAISE NOTICE 'Setup concluído — Drogaria SV (tenant: %)', v_tenant_id;
END $$;
