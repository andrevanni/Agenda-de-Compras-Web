-- schema_v6_notas_painel.sql
-- Adiciona campo nota em agenda_ocorrencias para o painel de post-its por comprador.

ALTER TABLE agenda_ocorrencias
  ADD COLUMN IF NOT EXISTS nota TEXT;
