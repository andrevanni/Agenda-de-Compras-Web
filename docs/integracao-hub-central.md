# Integração Agenda de Compras ↔ Hub Central (Painel Admin A3)

> **Estado (2026-07-25): ESPELHO + SSO NO AR.** O Hub lê a Agenda a cada 15 min e o card "Abrir" loga direto no portal do cliente **como comprador, com refresh token — a sessão dura o dia todo** (timer de 50 min do front renova). Hub: `https://painel-admin-a3.vercel.app`.

## Espelho (Pull) — o Hub só lê, nunca escreve aqui

- Endpoint dedicado: **`GET /api/v1/admin/espelho`** (`X-Admin-Token`, env `ADMIN_API_TOKEN`) — devolve tenants (nome de exibição = `clientes.nome_fantasia` c/ fallback `tenants.nome`), compradores (com `user_id` = tem auth) e **licenças comerciais (`clientes_licencas` — a fonte real; `tenant_licencas` é legado morto)**.
- Leitor no Hub: `lib/sync/leitura-agenda.ts`. Envs no Hub: `SF_AGENDA_{BASE_URL,ADMIN_TOKEN,SUPABASE_URL,SUPABASE_ANON}`.
- **Compradores são DELETE físico** aqui → o espelho desativa no Hub quem sumir da lista (reconciliação por ausência).
- **Licença ativa** (regra espelhada): `status IN (ativo, implantacao)` + sem `bloqueado_manual` + fim nulo ou futuro; vale a de maior fim. ⚠️ **Cliente sem licença cadastrada aqui fica sem vigência no Hub** (card "Quero conhecer" + SSO bloqueado) — cadastrar a vigência no painel admin da Agenda é o que acende o card.

## Convites — modo BOAS-VINDAS (self-service preservado, decisão do André 2026-07-25)

O fluxo do cliente NÃO muda: o gestor cria o comprador no portal e o convite **da Agenda** continua sendo o que define a senha. O Hub envia (só p/ quem **tem auth** na origem) um **e-mail de boas-vindas SEM senha**: "entre no Portal com o mesmo e-mail e senha que você já usa na Agenda" — a ativação self-service do Hub prova a senha neste GoTrue. Comprador sem auth (convite pendente/legado) espelha em silêncio e fica pra convite manual no painel do Hub.

## SSO (card "Abrir" do Hub → portal logado)

- Callback: `GET /sso/callback` (backend `agenda-de-compras-api`, catch-all do vercel.json). Troca o code no central, casa e-mail → `compradores`, **vigência bloqueante** (fail-open só em falha de rede), sessão nativa GoTrue (`generate_link`+`verify_otp`, **ES256 — nunca mintar JWT**), e entrega ao portal: `{frontend}/?jwt=&refresh=&tenant_id=&comprador_id=&email=`.
- Front (`script_main.js`, bootstrap): com `comprador_id` → sessão de **buyer** em `localStorage` + refresh token (dura o dia); sem → fluxo `admin_portal` antigo (sessionStorage; agora zera o refresh para não roubar identidade de comprador).
- Botão "Entrar com Service Farma" no modal de login do portal. Envs aqui: `SF_CENTRAL_URL`, `SF_SSO_CLIENT_ID`, `SF_SSO_CLIENT_SECRET` (client `sf_agenda_…` no central).
- ⚠️ Alterou `script_*.js`? **Bump do `sw.js`** (cache `agenda-compras-vNN`), senão o cliente não recebe.

## Pontos de atenção

1. Não renomear `GET /api/v1/admin/espelho` nem os campos sem atualizar `lib/sync/leitura-agenda.ts` no Hub; rotação do `ADMIN_API_TOKEN` exige atualizar `SF_AGENDA_ADMIN_TOKEN` na Vercel do Hub.
2. Tenants novos caem na fila "Clientes a vincular" do Hub — vincular = decidir trazer (e dar boas-vindas a) os compradores daquele cliente.
3. O tenant **"Service Farma" é teste** — nunca vincular.
