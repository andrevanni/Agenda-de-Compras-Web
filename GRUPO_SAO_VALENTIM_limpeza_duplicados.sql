-- ============================================================
-- DROGARIA SV — Limpeza de eventos genéricos duplicados
-- Rodar no SQL Editor do Supabase
-- ============================================================
-- Remove duplicatas de ocorrências PENDENTES sem fornecedor
-- (eventos genéricos: Conciliação, Verificação, Análise, etc.)
-- mantendo o registro mais antigo de cada grupo.
--
-- Critério de duplicata: mesmo tenant + título + data + comprador + hora_inicio
-- ============================================================

-- ── Passo 1: PREVIEW — listar grupos duplicados antes de deletar ──
SELECT
  titulo,
  data_prevista,
  hora_inicio,
  comprador_id,
  COUNT(*) AS qtd,
  ARRAY_AGG(id ORDER BY created_at) AS ids
FROM agenda_ocorrencias
WHERE status = 'PENDENTE'
  AND fornecedor_id IS NULL
  AND tenant_id = 'f0d557c6-9dd9-4e80-96e0-2094da4a40ff'
GROUP BY tenant_id, titulo, data_prevista, comprador_id, hora_inicio
HAVING COUNT(*) > 1
ORDER BY data_prevista, hora_inicio, titulo;


-- ── Passo 2: DELETE — remove duplicatas mantendo o mais antigo de cada grupo ──
-- (Rodar somente após conferir o resultado do Passo 1)

DELETE FROM agenda_ocorrencias
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY tenant_id, titulo, data_prevista, comprador_id, hora_inicio
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM agenda_ocorrencias
    WHERE status = 'PENDENTE'
      AND fornecedor_id IS NULL
      AND tenant_id = 'f0d557c6-9dd9-4e80-96e0-2094da4a40ff'
  ) sub
  WHERE rn > 1
);


-- ── Passo 3: VERIFICAÇÃO — checar se ainda há duplicatas ──
SELECT
  titulo,
  data_prevista,
  hora_inicio,
  COUNT(*) AS qtd
FROM agenda_ocorrencias
WHERE status = 'PENDENTE'
  AND fornecedor_id IS NULL
  AND tenant_id = 'f0d557c6-9dd9-4e80-96e0-2094da4a40ff'
GROUP BY tenant_id, titulo, data_prevista, comprador_id, hora_inicio
HAVING COUNT(*) > 1;
-- Se vier vazio, está tudo limpo.
