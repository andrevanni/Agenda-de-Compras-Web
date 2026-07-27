-- schema_v20: backfill de serie_id para séries LEGADAS (criadas antes do
-- schema_v16, 27/mai/2026). Sem serie_id, o radio "Aplicar mudanças a"
-- (Só esta / Esta e as próximas / Toda a série) fica oculto e o comprador
-- só consegue excluir a série uma ocorrência por vez — caso real reportado
-- em 27/jul/2026 (série recorrente sem pergunta de escopo na exclusão).
--
-- Agrupamento: mesmo tenant + comprador + título + DIA de criação, apenas
-- compromissos genéricos (fornecedor_id IS NULL — Agenda de Compras não usa
-- série). Grupos de 1 ocorrência ficam sem serie_id, igual ao comportamento
-- atual do "Novo Evento" (serie_id só quando total > 1).
--
-- Data migration pura (sem DDL) — idempotente: só toca linhas com
-- serie_id IS NULL, então rodar de novo não muda nada.

WITH grupos AS (
    SELECT tenant_id,
           comprador_id,
           titulo,
           created_at::date AS dia_criacao,
           gen_random_uuid() AS novo_serie_id
    FROM agenda_ocorrencias
    WHERE serie_id IS NULL
      AND fornecedor_id IS NULL
      AND titulo IS NOT NULL
    GROUP BY tenant_id, comprador_id, titulo, created_at::date
    HAVING count(*) > 1
)
UPDATE agenda_ocorrencias o
SET serie_id = g.novo_serie_id
FROM grupos g
WHERE o.serie_id IS NULL
  AND o.fornecedor_id IS NULL
  AND o.tenant_id = g.tenant_id
  AND o.comprador_id IS NOT DISTINCT FROM g.comprador_id
  AND o.titulo = g.titulo
  AND o.created_at::date = g.dia_criacao;
