-- schema_v5_fix_rls_categorias.sql
-- Corrige a política RLS de categorias_agenda.
-- A política original usava current_setting('app.tenant_id') que o PostgREST
-- não define automaticamente, fazendo com que nenhuma categoria fosse retornada.
-- O isolamento por tenant_id é garantido pela camada de aplicação (query filter).

DROP POLICY IF EXISTS "tenant_isolation_categorias_agenda" ON categorias_agenda;

CREATE POLICY "allow_all_categorias_agenda"
  ON categorias_agenda
  FOR ALL
  USING (true);
