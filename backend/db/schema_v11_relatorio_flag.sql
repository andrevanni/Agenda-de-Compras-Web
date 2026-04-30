-- schema_v11_relatorio_flag.sql
-- Adiciona flag de habilitação de envio de relatório diário por tenant.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS envio_relatorio_ativo boolean DEFAULT false;
