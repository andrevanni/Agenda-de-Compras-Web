-- schema_v18_versoes_notificacao.sql
-- Notificação de novas versões do sistema por email.
-- A LISTA DE VERSÕES NÃO VIVE NO BANCO — ela é hardcoded no código
-- (frontend/script_state.js para o cliente, backend/app/data/versoes.py
-- para o admin). Esta migration só cria as tabelas necessárias para
-- gerenciar destinatários e logar disparos.
--
-- Aplicar após schema_v17_notas_painel.sql

-- ============================================================
-- 1. Destinatários da notificação de versão
-- ============================================================
-- Lista fechada de contatos (externos ao sistema) que recebem o
-- changelog quando uma versão é "anunciada" pelo admin. NÃO são
-- compradores nem admins do SaaS — são pessoas avulsas que o
-- master admin quer manter informadas (sócios, gestores externos,
-- equipe comercial, etc).

CREATE TABLE IF NOT EXISTS versoes_destinatarios (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  nome        TEXT,
  ativo       BOOLEAN     NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_versoes_destinatarios_ativo
  ON versoes_destinatarios (ativo);

-- ============================================================
-- 2. Histórico de envios
-- ============================================================
-- Cada disparo gera N linhas (uma por destinatário). Permite ver
-- quem recebeu o quê e reenviar quando necessário (basta clicar
-- "Enviar email" de novo na mesma versão).

CREATE TABLE IF NOT EXISTS versoes_envios (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  versao          TEXT        NOT NULL,
  email_destino   TEXT        NOT NULL,
  status          TEXT        NOT NULL CHECK (status IN ('enviado', 'erro')),
  erro_mensagem   TEXT,
  enviado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_versoes_envios_versao
  ON versoes_envios (versao, enviado_em DESC);

-- ============================================================
-- 3. RLS (isolamento na aplicação, padrão do projeto)
-- ============================================================

ALTER TABLE versoes_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE versoes_envios       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_versoes_destinatarios"
  ON versoes_destinatarios FOR ALL USING (true);

CREATE POLICY "open_versoes_envios"
  ON versoes_envios FOR ALL USING (true);

-- ============================================================
-- 4. Grants para REST funcionar via Supabase
-- ============================================================

GRANT ALL ON versoes_destinatarios TO authenticated, anon, service_role;
GRANT ALL ON versoes_envios        TO authenticated, anon, service_role;
