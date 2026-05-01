-- ================================================================
-- DADOS DE TESTE — Service Farma — Abril/Maio 2026
-- Rodar no SQL Editor do Supabase
-- No final, copie o tenant_id exibido para usar no cron
-- ================================================================

DO $$
DECLARE
  v_tenant_id        UUID;
  v_comp1_id         UUID;  -- André (gestor)
  v_comp2_id         UUID;  -- Maria
  v_cat_agenda_id    UUID;
  v_cat_reuniao_id   UUID;
  v_cat_pessoal_id   UUID;
  f1 UUID; f2 UUID; f3 UUID; f4 UUID; f5 UUID; f6 UUID; f7 UUID; f8 UUID;
BEGIN

-- ── 1. Tenant ──────────────────────────────────────────────────
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'service-farma';
  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants (nome, slug, status, plano)
    VALUES ('Service Farma', 'service-farma', 'ativo', 'basico')
    RETURNING id INTO v_tenant_id;
  END IF;
  UPDATE tenants SET envio_relatorio_ativo = true WHERE id = v_tenant_id;

-- ── 2. Feriado 1/5 ─────────────────────────────────────────────
  INSERT INTO feriados (tenant_id, data, nome, tipo)
  SELECT v_tenant_id, '2026-05-01', 'Dia do Trabalho', 'nacional'
  WHERE NOT EXISTS (
    SELECT 1 FROM feriados WHERE tenant_id = v_tenant_id AND data = '2026-05-01'
  );

-- ── 3. Categorias ──────────────────────────────────────────────
  INSERT INTO categorias_agenda (tenant_id, nome, cor, icone)
  VALUES (v_tenant_id, 'Agenda de Compras', '#F59E0B', 'truck')
  ON CONFLICT (tenant_id, nome) DO NOTHING
  RETURNING id INTO v_cat_agenda_id;
  IF v_cat_agenda_id IS NULL THEN
    SELECT id INTO v_cat_agenda_id FROM categorias_agenda
    WHERE tenant_id = v_tenant_id AND nome = 'Agenda de Compras';
  END IF;

  INSERT INTO categorias_agenda (tenant_id, nome, cor, icone)
  VALUES (v_tenant_id, 'Reunião', '#10B981', 'calendar')
  ON CONFLICT (tenant_id, nome) DO NOTHING
  RETURNING id INTO v_cat_reuniao_id;
  IF v_cat_reuniao_id IS NULL THEN
    SELECT id INTO v_cat_reuniao_id FROM categorias_agenda
    WHERE tenant_id = v_tenant_id AND nome = 'Reunião';
  END IF;

  INSERT INTO categorias_agenda (tenant_id, nome, cor, icone)
  VALUES (v_tenant_id, 'Pessoal', '#6366F1', 'user')
  ON CONFLICT (tenant_id, nome) DO NOTHING
  RETURNING id INTO v_cat_pessoal_id;
  IF v_cat_pessoal_id IS NULL THEN
    SELECT id INTO v_cat_pessoal_id FROM categorias_agenda
    WHERE tenant_id = v_tenant_id AND nome = 'Pessoal';
  END IF;

-- ── 4. Compradores ─────────────────────────────────────────────
  SELECT id INTO v_comp1_id FROM compradores
  WHERE tenant_id = v_tenant_id AND email = 'andre@servicefarma.far.br';
  IF v_comp1_id IS NULL THEN
    INSERT INTO compradores (tenant_id, nome_comprador, email, is_gestor, receber_auditoria, receber_agenda_proximo)
    VALUES (v_tenant_id, 'André Vanni', 'andre@servicefarma.far.br', true, true, true)
    RETURNING id INTO v_comp1_id;
  ELSE
    UPDATE compradores
    SET is_gestor = true, receber_auditoria = true, receber_agenda_proximo = true
    WHERE id = v_comp1_id;
  END IF;

  SELECT id INTO v_comp2_id FROM compradores
  WHERE tenant_id = v_tenant_id AND nome_comprador = 'Maria Costa (Teste)';
  IF v_comp2_id IS NULL THEN
    INSERT INTO compradores (tenant_id, nome_comprador, email, is_gestor, receber_auditoria, receber_agenda_proximo)
    VALUES (v_tenant_id, 'Maria Costa (Teste)', 'maria.teste@servicefarma.far.br', false, true, true)
    RETURNING id INTO v_comp2_id;
  END IF;

-- ── 5. Fornecedores ────────────────────────────────────────────
  -- (frequencia_revisao: 7=semanal, 14=quinzenal, 28=mensal)
  -- frequencia_revisao válida: 1=mensal, 2=quinzenal, 4=semanal, 8=2x/semana, 12=3x/semana
  INSERT INTO fornecedores (tenant_id, codigo_fornecedor, nome_fornecedor, frequencia_revisao, parametro_estoque, lead_time_entrega, comprador_id, data_primeiro_pedido)
  VALUES (v_tenant_id, 'F001', 'EMS Distribuidora',      4,  8,  2, v_comp1_id, '2024-01-08')
  ON CONFLICT DO NOTHING RETURNING id INTO f1;
  IF f1 IS NULL THEN SELECT id INTO f1 FROM fornecedores WHERE tenant_id = v_tenant_id AND codigo_fornecedor = 'F001'; END IF;

  INSERT INTO fornecedores (tenant_id, codigo_fornecedor, nome_fornecedor, frequencia_revisao, parametro_estoque, lead_time_entrega, comprador_id, data_primeiro_pedido)
  VALUES (v_tenant_id, 'F002', 'Eurofarma Laboratórios', 2, 14, 3, v_comp1_id, '2024-01-15')
  ON CONFLICT DO NOTHING RETURNING id INTO f2;
  IF f2 IS NULL THEN SELECT id INTO f2 FROM fornecedores WHERE tenant_id = v_tenant_id AND codigo_fornecedor = 'F002'; END IF;

  INSERT INTO fornecedores (tenant_id, codigo_fornecedor, nome_fornecedor, frequencia_revisao, parametro_estoque, lead_time_entrega, comprador_id, data_primeiro_pedido)
  VALUES (v_tenant_id, 'F003', 'Hypera Pharma',          4,  8,  2, v_comp1_id, '2024-01-08')
  ON CONFLICT DO NOTHING RETURNING id INTO f3;
  IF f3 IS NULL THEN SELECT id INTO f3 FROM fornecedores WHERE tenant_id = v_tenant_id AND codigo_fornecedor = 'F003'; END IF;

  INSERT INTO fornecedores (tenant_id, codigo_fornecedor, nome_fornecedor, frequencia_revisao, parametro_estoque, lead_time_entrega, comprador_id, data_primeiro_pedido)
  VALUES (v_tenant_id, 'F004', 'Takeda Farmacêutica',    1, 30, 5, v_comp2_id, '2024-02-01')
  ON CONFLICT DO NOTHING RETURNING id INTO f4;
  IF f4 IS NULL THEN SELECT id INTO f4 FROM fornecedores WHERE tenant_id = v_tenant_id AND codigo_fornecedor = 'F004'; END IF;

  INSERT INTO fornecedores (tenant_id, codigo_fornecedor, nome_fornecedor, frequencia_revisao, parametro_estoque, lead_time_entrega, comprador_id, data_primeiro_pedido)
  VALUES (v_tenant_id, 'F005', 'Roche Diagnóstica',      2, 16, 4, v_comp2_id, '2024-01-15')
  ON CONFLICT DO NOTHING RETURNING id INTO f5;
  IF f5 IS NULL THEN SELECT id INTO f5 FROM fornecedores WHERE tenant_id = v_tenant_id AND codigo_fornecedor = 'F005'; END IF;

  INSERT INTO fornecedores (tenant_id, codigo_fornecedor, nome_fornecedor, frequencia_revisao, parametro_estoque, lead_time_entrega, comprador_id, data_primeiro_pedido, hora_inicio, hora_fim)
  VALUES (v_tenant_id, 'F006', 'Mantecorp Industria',    4,  8,  2, v_comp1_id, '2024-01-08', '09:00', '09:30')
  ON CONFLICT DO NOTHING RETURNING id INTO f6;
  IF f6 IS NULL THEN SELECT id INTO f6 FROM fornecedores WHERE tenant_id = v_tenant_id AND codigo_fornecedor = 'F006'; END IF;

  INSERT INTO fornecedores (tenant_id, codigo_fornecedor, nome_fornecedor, frequencia_revisao, parametro_estoque, lead_time_entrega, comprador_id, data_primeiro_pedido, hora_inicio, hora_fim)
  VALUES (v_tenant_id, 'F007', 'Pfizer Brasil',          2, 16, 3, v_comp2_id, '2024-01-15', '10:00', '10:30')
  ON CONFLICT DO NOTHING RETURNING id INTO f7;
  IF f7 IS NULL THEN SELECT id INTO f7 FROM fornecedores WHERE tenant_id = v_tenant_id AND codigo_fornecedor = 'F007'; END IF;

  INSERT INTO fornecedores (tenant_id, codigo_fornecedor, nome_fornecedor, frequencia_revisao, parametro_estoque, lead_time_entrega, comprador_id, data_primeiro_pedido)
  VALUES (v_tenant_id, 'F008', 'Cimed Indústria',        4,  8,  2, v_comp2_id, '2024-01-08')
  ON CONFLICT DO NOTHING RETURNING id INTO f8;
  IF f8 IS NULL THEN SELECT id INTO f8 FROM fornecedores WHERE tenant_id = v_tenant_id AND codigo_fornecedor = 'F008'; END IF;

-- ── 6. Limpar ocorrências de teste anteriores ──────────────────
  DELETE FROM agenda_ocorrencias
  WHERE tenant_id = v_tenant_id;

-- ── 7. ABRIL — Realizadas (tratadas) ──────────────────────────

  -- F001 André — cumprida no prazo (sem justificativa)
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f1, v_comp1_id, '2026-04-07', '2026-04-07', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Tratado pela tela","ajuste_proxima_data_dias":0,"incremento_parametro_dias":0,"parametro_compra_anterior":12,"novo_parametro_compra":12,"executor_role":"buyer","executor_display_name":"André Vanni"}');

  -- F001 André — postergada 3 dias COM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f1, v_comp1_id, '2026-04-14', '2026-04-14', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Pedido postergado","ajuste_proxima_data_dias":3,"incremento_parametro_dias":3,"parametro_compra_anterior":12,"novo_parametro_compra":15,"executor_role":"buyer","executor_display_name":"André Vanni","justificativa":"Representante informou que não teria estoque disponível nesta semana — aguardamos chegada de lote na quinta-feira."}');

  -- F002 André — cumprida, aumento de parâmetro (sem justificativa)
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f2, v_comp1_id, '2026-04-08', '2026-04-09', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Tratado com 1 dia de atraso","ajuste_proxima_data_dias":0,"incremento_parametro_dias":1,"parametro_compra_anterior":20,"novo_parametro_compra":21,"executor_role":"buyer","executor_display_name":"André Vanni"}');

  -- F002 André — antecipada 2 dias COM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f2, v_comp1_id, '2026-04-22', '2026-04-22', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Antecipado","ajuste_proxima_data_dias":-2,"incremento_parametro_dias":-2,"parametro_compra_anterior":21,"novo_parametro_compra":19,"executor_role":"buyer","executor_display_name":"André Vanni","justificativa":"Promoção relâmpago do fornecedor com validade até sexta — aproveitar o preço e antecipar o pedido."}');

  -- F003 André — cumprida no prazo
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f3, v_comp1_id, '2026-04-07', '2026-04-07', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Tratado pela tela","ajuste_proxima_data_dias":0,"incremento_parametro_dias":0,"parametro_compra_anterior":10,"novo_parametro_compra":10,"executor_role":"buyer","executor_display_name":"André Vanni"}');

  -- F003 André — postergada 5 dias COM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f3, v_comp1_id, '2026-04-14', '2026-04-17', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Postergado","ajuste_proxima_data_dias":5,"incremento_parametro_dias":8,"parametro_compra_anterior":10,"novo_parametro_compra":18,"executor_role":"buyer","executor_display_name":"André Vanni","justificativa":"Estoque ainda suficiente para mais uma semana — evitar compra com validade curta do lote atual."}');

  -- F004 Maria — cumprida 2 dias atrasada
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f4, v_comp2_id, '2026-04-03', '2026-04-05', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Atraso de 2 dias","ajuste_proxima_data_dias":0,"incremento_parametro_dias":2,"parametro_compra_anterior":35,"novo_parametro_compra":37,"executor_role":"buyer","executor_display_name":"Maria Costa (Teste)"}');

  -- F004 Maria — adiada COM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f4, v_comp2_id, '2026-04-30', NULL, 'ADIADA', v_cat_agenda_id,
    '{"note":"Adiado — aguardando tabela de preços","justificativa":"Fornecedor avisou reajuste de tabela para maio — aguardar nova tabela antes de fechar pedido."}');

  -- F005 Maria — cumprida no prazo
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f5, v_comp2_id, '2026-04-09', '2026-04-09', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Tratado pela tela","ajuste_proxima_data_dias":0,"incremento_parametro_dias":0,"parametro_compra_anterior":18,"novo_parametro_compra":18,"executor_role":"buyer","executor_display_name":"Maria Costa (Teste)"}');

  -- F005 Maria — postergada 7 dias SEM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f5, v_comp2_id, '2026-04-23', '2026-04-25', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Postergado","ajuste_proxima_data_dias":7,"incremento_parametro_dias":9,"parametro_compra_anterior":18,"novo_parametro_compra":27,"executor_role":"buyer","executor_display_name":"Maria Costa (Teste)"}');

  -- F006 André — cumprida no prazo
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao, hora_inicio, hora_fim)
  VALUES (v_tenant_id, f6, v_comp1_id, '2026-04-08', '2026-04-08', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Tratado pela tela","ajuste_proxima_data_dias":0,"incremento_parametro_dias":0,"parametro_compra_anterior":10,"novo_parametro_compra":10,"executor_role":"buyer","executor_display_name":"André Vanni"}',
    '09:00', '09:30');

  -- F006 André — antecipada COM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao, hora_inicio, hora_fim)
  VALUES (v_tenant_id, f6, v_comp1_id, '2026-04-15', '2026-04-14', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Antecipado 1 dia","ajuste_proxima_data_dias":-1,"incremento_parametro_dias":-1,"parametro_compra_anterior":10,"novo_parametro_compra":9,"executor_role":"buyer","executor_display_name":"André Vanni","justificativa":"Representante passará pela farmácia na segunda, antecipei o pedido para não perder a visita."}',
    '09:00', '09:30');

  -- F007 Maria — cumprida 1 dia atrasada
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao, hora_inicio, hora_fim)
  VALUES (v_tenant_id, f7, v_comp2_id, '2026-04-10', '2026-04-11', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Atraso 1 dia","ajuste_proxima_data_dias":0,"incremento_parametro_dias":1,"parametro_compra_anterior":19,"novo_parametro_compra":20,"executor_role":"buyer","executor_display_name":"Maria Costa (Teste)"}',
    '10:00', '10:30');

  -- F007 Maria — postergada COM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao, hora_inicio, hora_fim)
  VALUES (v_tenant_id, f7, v_comp2_id, '2026-04-24', '2026-04-25', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Postergado 3 dias","ajuste_proxima_data_dias":3,"incremento_parametro_dias":4,"parametro_compra_anterior":20,"novo_parametro_compra":24,"executor_role":"buyer","executor_display_name":"Maria Costa (Teste)","justificativa":"Pedido mínimo aumentado pelo fornecedor — necessário aguardar demanda adicional para atingir o volume mínimo."}',
    '10:00', '10:30');

  -- F008 Maria — cumprida no prazo
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f8, v_comp2_id, '2026-04-07', '2026-04-07', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Tratado pela tela","ajuste_proxima_data_dias":0,"incremento_parametro_dias":0,"parametro_compra_anterior":9,"novo_parametro_compra":9,"executor_role":"buyer","executor_display_name":"Maria Costa (Teste)"}');

  -- F008 Maria — adiada SEM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f8, v_comp2_id, '2026-04-28', NULL, 'ADIADA', v_cat_agenda_id,
    '{"note":"Aguardando retorno do fornecedor"}');

-- ── 8. ABRIL — Atrasadas (PENDENTE com data passada) ──────────

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id)
  VALUES (v_tenant_id, f3, v_comp1_id, '2026-04-28', 'PENDENTE', v_cat_agenda_id);

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id)
  VALUES (v_tenant_id, f5, v_comp2_id, '2026-04-29', 'PENDENTE', v_cat_agenda_id);

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id)
  VALUES (v_tenant_id, f8, v_comp2_id, '2026-04-21', 'PENDENTE', v_cat_agenda_id);

-- ── 9. ABRIL 30 — Realizadas (dia de referência do relatório) ─

  -- F001 André — cumprida ontem (30/04) SEM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f1, v_comp1_id, '2026-04-30', '2026-04-30', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Tratado pela tela","ajuste_proxima_data_dias":0,"incremento_parametro_dias":0,"parametro_compra_anterior":15,"novo_parametro_compra":15,"executor_role":"buyer","executor_display_name":"André Vanni"}');

  -- F002 André — cumprida ontem COM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f2, v_comp1_id, '2026-04-30', '2026-04-30', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Postergado 5 dias","ajuste_proxima_data_dias":5,"incremento_parametro_dias":5,"parametro_compra_anterior":19,"novo_parametro_compra":24,"executor_role":"buyer","executor_display_name":"André Vanni","justificativa":"Farmácia com estoque elevado após promoção da semana passada — adiando o pedido para não onerar o caixa antes do fechamento do mês."}');

  -- F006 André — cumprida ontem SEM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao, hora_inicio, hora_fim)
  VALUES (v_tenant_id, f6, v_comp1_id, '2026-04-30', '2026-04-30', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Tratado pela tela","ajuste_proxima_data_dias":0,"incremento_parametro_dias":0,"parametro_compra_anterior":9,"novo_parametro_compra":9,"executor_role":"buyer","executor_display_name":"André Vanni"}',
    '09:00', '09:30');

  -- F004 Maria — cumprida ontem COM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao)
  VALUES (v_tenant_id, f4, v_comp2_id, '2026-04-28', '2026-04-30', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"2 dias de atraso","ajuste_proxima_data_dias":0,"incremento_parametro_dias":2,"parametro_compra_anterior":37,"novo_parametro_compra":39,"executor_role":"buyer","executor_display_name":"Maria Costa (Teste)","justificativa":"Tabela de preços chegou apenas hoje — foi necessário aguardar para confirmar os valores antes de fechar."}');

  -- F007 Maria — cumprida ontem SEM justificativa
  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, data_realizacao, status, categoria_id, observacao, hora_inicio, hora_fim)
  VALUES (v_tenant_id, f7, v_comp2_id, '2026-04-30', '2026-04-30', 'REALIZADA', v_cat_agenda_id,
    '{"type":"agenda_treatment","note":"Tratado pela tela","ajuste_proxima_data_dias":0,"incremento_parametro_dias":0,"parametro_compra_anterior":24,"novo_parametro_compra":24,"executor_role":"buyer","executor_display_name":"Maria Costa (Teste)"}',
    '10:00', '10:30');

-- ── 10. MAIO 4 — Próximo dia útil (Agenda de Compras) ─────────
  -- (1/5 = feriado, 2-3/5 = fim de semana → próximo dia útil = 04/05)

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id, hora_inicio, hora_fim)
  VALUES (v_tenant_id, f1, v_comp1_id, '2026-05-04', 'PENDENTE', v_cat_agenda_id, NULL, NULL);

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id, hora_inicio, hora_fim)
  VALUES (v_tenant_id, f3, v_comp1_id, '2026-05-04', 'PENDENTE', v_cat_agenda_id, NULL, NULL);

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id, hora_inicio, hora_fim)
  VALUES (v_tenant_id, f6, v_comp1_id, '2026-05-04', 'PENDENTE', v_cat_agenda_id, '09:00', '09:30');

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id, hora_inicio, hora_fim)
  VALUES (v_tenant_id, f7, v_comp2_id, '2026-05-04', 'PENDENTE', v_cat_agenda_id, '10:00', '10:30');

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id, hora_inicio, hora_fim)
  VALUES (v_tenant_id, f8, v_comp2_id, '2026-05-04', 'PENDENTE', v_cat_agenda_id, NULL, NULL);

-- ── 11. MAIO 4 — Outros Compromissos (não são agenda de compras)

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id, titulo, hora_inicio, hora_fim)
  VALUES (v_tenant_id, NULL, v_comp1_id, '2026-05-04', 'PENDENTE', v_cat_reuniao_id,
    'Reunião de abertura de mês com equipe', '08:00', '09:00');

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id, titulo, hora_inicio, hora_fim)
  VALUES (v_tenant_id, NULL, v_comp2_id, '2026-05-04', 'PENDENTE', v_cat_pessoal_id,
    'Treinamento sistema de compras', '14:00', '16:00');

-- ── 12. MAIO — demais pendentes ───────────────────────────────

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id)
  VALUES (v_tenant_id, f2, v_comp1_id, '2026-05-06', 'PENDENTE', v_cat_agenda_id);

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id)
  VALUES (v_tenant_id, f4, v_comp2_id, '2026-05-07', 'PENDENTE', v_cat_agenda_id);

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id)
  VALUES (v_tenant_id, f5, v_comp2_id, '2026-05-08', 'PENDENTE', v_cat_agenda_id);

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id)
  VALUES (v_tenant_id, f1, v_comp1_id, '2026-05-11', 'PENDENTE', v_cat_agenda_id);

  INSERT INTO agenda_ocorrencias (tenant_id, fornecedor_id, comprador_id, data_prevista, status, categoria_id)
  VALUES (v_tenant_id, f3, v_comp1_id, '2026-05-11', 'PENDENTE', v_cat_agenda_id);

  RAISE NOTICE 'Dados inseridos com sucesso para o tenant: %', v_tenant_id;

END $$;

-- ── SAÍDA: copie o tenant_id para usar no cron ────────────────
SELECT id AS tenant_id, nome FROM tenants WHERE slug = 'service-farma';
