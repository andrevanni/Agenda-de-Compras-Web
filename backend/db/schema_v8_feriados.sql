-- ============================================================
-- schema_v8_feriados.sql
-- Tabela de feriados por tenant
-- Rodar no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS feriados (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data       date        NOT NULL,
  nome       text        NOT NULL,
  tipo       text        NOT NULL DEFAULT 'personalizado', -- 'nacional' | 'personalizado'
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feriados_tenant_data
  ON feriados (tenant_id, data);

ALTER TABLE feriados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_feriados" ON feriados FOR ALL USING (true);

GRANT ALL ON feriados TO anon, authenticated, service_role;
