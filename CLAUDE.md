# CLAUDE.md

Sistema web multi-tenant SaaS para gestão de agenda de compras de farmácias.

## Deploy (produção, push para `main` → deploy automático)

| Projeto Vercel | URL | Pasta |
|---|---|---|
| agenda-compras-cliente | `https://agenda-compras-cliente.vercel.app` | `frontend/` |
| agenda-compras-admin   | `https://agenda-compras-admin.vercel.app`   | `frontend_admin/` |
| agenda-de-compras-api  | `https://agenda-de-compras-api.vercel.app`  | `backend/` |

Supabase: `fnwsorhflueunqzkwsxu.supabase.co`

## Variáveis de ambiente (Vercel — projeto `agenda-de-compras-api`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ | Connection string PostgreSQL do Supabase |
| `SUPABASE_URL` | ✅ | `https://fnwsorhflueunqzkwsxu.supabase.co` |
| `SUPABASE_ANON_KEY` | ✅ | Chave pública do Supabase (publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Chave secreta do Supabase (admin) — ⚠️ rotacionar se exposta |
| `ADMIN_API_TOKEN` | ✅ | Token legado para `X-Admin-Token` (fallback) |
| `SMTP_PASSWORD` | ✅ | Senha SMTP de `comercial@servicefarma.far.br` |
| `PORTAL_ADMIN_EMAIL` | ✅ | `andre@servicefarma.far.br` (usado no "Abrir Portal") |
| `PORTAL_ADMIN_PASSWORD` | ✅ | Senha Supabase Auth do `andre@servicefarma.far.br` |
| `FRONTEND_URL` | ✅ | `https://agenda-compras-cliente.vercel.app` (usado no redirect `/portal` e e-mails) |

## Arquitetura

```
Routes (backend/app/api/v1/) → Services (backend/app/services/) → DB session (SQLAlchemy)
```

- **Frontend cliente** chama Supabase REST direto via `fetchSupabase()`. FastAPI só para auth JWT e operações admin.
- **Multi-tenancy**: todo registro tem `tenant_id`. Queries SEMPRE filtram por `tenant_id`. RLS no Supabase usa `USING (true)` — isolamento é via aplicação.
- **Migrations**: scripts SQL versionados em `backend/db/` (`schema_v1.sql` → `schema_v9_*.sql`). Sem Alembic.

## Estrutura do frontend cliente (`frontend/`)

Arquivos JS carregados em ordem no `index.html` — escopo global compartilhado (não são ES modules):

| Arquivo | Conteúdo |
|---|---|
| `script_state.js` | Estado global, constantes, mocks, refs DOM, `storageKeys`, `defaultSettings` |
| `script_utils.js` | `fetchSupabase()`, `fetchApi()`, `refreshJWT()`, `_store()`, utilitários de data/cálculo |
| `script_render.js` | Render tabelas, fornecedores, compradores, `fetchSupabase` (definido aqui) |
| `script_forms.js` | Formulários (saveSupplier, saveBuyer), importação CSV/Excel, exportação, `ensureBuyerSelection()` |
| `script_data.js` | `loadPortalData()`, `loginBuyer()`, `bindEvents()`, configurações |
| `script_main.js` | `bootstrap()`, auth, calendário, categorias, PWA install, `refreshJWT` interval |

Outros arquivos estáticos:

| Arquivo | Descrição |
|---|---|
| `sw.js` | Service Worker v10 — cache dos assets, registrado em `index.html` e `instalar.html` |
| `manifest.json` | PWA manifest com ícones PNG 192×512 |
| `icon-192.png` / `icon-512.png` | Ícones PWA gerados do `.ico` original |
| `instalar.html` | Página de primeiro acesso: define senha → loga → mostra guia de instalação |
| `instalar_atalho.bat` | Instalador Windows autossuficiente — cria atalho na área de trabalho |
| `instalar_atalho.ps1` | Versão estendida do instalador (com download de ícone) |

## Estrutura do frontend admin (`frontend_admin/`)

Arquivo único `script.js` (não dividido). Painel administrativo:

- Login com e-mail + senha via `POST /api/v1/admin/auth/login` → JWT em `localStorage['agenda_admin_jwt']`
- Seções: Base Operacional (tenants), Clientes, Vigências, Admins, Ajuda, Conexão
- `fetchAdmin()` envia JWT admin no header `Authorization: Bearer` (com fallback para `X-Admin-Token`)
- Tenants ordenados **alfabeticamente** por `nome`

## storageKeys — portal cliente (`localStorage` / `sessionStorage`)

| Chave | Storage | Descrição |
|---|---|---|
| `agenda_jwt` | session→local | JWT do comprador logado |
| `agenda_refresh_token` | session→local | Refresh token Supabase (renovação automática) |
| `agenda_cliente_tenant_id` | session→local | UUID do tenant ativo |
| `agenda_cliente_logged_buyer_id` | session→local | UUID do comprador logado |
| `agenda_cliente_active_buyer_id` | session→local | UUID do comprador ativo (filtro visual) |
| `agenda_cliente_logged_portal_role` | session→local | Role: `buyer`, `admin_client` ou `admin_portal` |
| `agenda_cliente_logged_portal_email` | local | E-mail do usuário logado |
| `agenda_cliente_supabase_url` | local | URL customizada do Supabase (opcional) |
| `agenda_cliente_supabase_key` | local | Chave anon customizada (opcional) |
| `agenda_api_base_url` | local | URL customizada do backend (opcional) |
| `agenda_cliente_logo_url` | local | Data URL da logomarca do cliente |
| `agenda_ui_theme` | local | `light` ou `dark` |
| `agenda_sidebar_collapsed` | local | Estado da sidebar |
| `agenda_calendar_weekdays` | local | Dias exibidos no calendário |
| `agenda_pwa_installed` | local | Flag para não reabrir modal PWA após instalação |

`_store(key)` lê `sessionStorage` primeiro, depois `localStorage` — permite isolamento por aba (admin "Abrir Portal" usa sessionStorage para não contaminar outras abas).

## Roles de acesso no portal cliente

| Role (`loggedPortalRole`) | Quem | Permissões |
|---|---|---|
| `buyer` | Comprador logado | Ver/tratar agenda da própria carteira; enviar convites |
| `admin_client` | E-mail responsável do tenant | Ver todos os compradores; tratar qualquer carteira; auditoria |
| `admin_portal` | Admin via "Abrir Portal" | Acesso total — bypass do login; sessão em sessionStorage |

## Backend — arquivos por responsabilidade

| Arquivo | Prefixo | Descrição |
|---|---|---|
| `api/v1/auth.py` | `/api/v1/auth` | Login comprador, definir senha (primeiro acesso) |
| `api/v1/admin_auth.py` | `/api/v1/admin/auth` | Login admin, listar/convidar/revogar/excluir admins |
| `api/v1/admin_portal.py` | `/api/v1/admin` | `POST /abrir-portal/{tenant_id}` — JWT cacheado 55 min |
| `api/v1/admin_clientes.py` | `/api/v1/admin/clientes` | CRUD de clientes comerciais (usa SQLAlchemy + PostgreSQL direto) |
| `api/v1/admin_licencas.py` | `/api/v1/admin/licencas` | CRUD de vigências/licenças (usa Supabase client) |
| `api/v1/admin_compradores_invite.py` | `/api/v1/admin/compradores` | Envio de convite pelo admin |
| `api/v1/portal_compradores.py` | `/api/v1/portal/compradores` | Envio de convite pelo portal cliente (requer JWT) |
| `api/v1/agenda.py` | `/api/v1/agenda` | Listar próximas/atrasadas, sugerir data, tratar ocorrência |
| `api/v1/redirect.py` | `/portal` | Redirect 302 para `FRONTEND_URL` (URL estável do instalador) |
| `services/agenda_service.py` | — | Lógica de tratamento: cálculo de datas, parâmetros |
| `services/email_service.py` | — | `send_html()` via SMTP SSL |
| `services/admin_clientes_service.py` | — | Queries SQL de clientes (raw SQL com `sqlalchemy.text()`) |
| `db/supabase_client.py` | — | `get_supabase()` — cliente Supabase fresco por request |
| `core/config.py` | — | Pydantic Settings — lê variáveis de ambiente |
| `core/admin_auth.py` | — | `require_admin`, `require_master_admin` dependencies |

## Endpoints completos

### Públicos
- `POST /api/v1/auth/login` — login comprador; retorna `access_token` + `refresh_token` + `tenant_id` + `comprador_id`
- `POST /api/v1/auth/definir-senha` — define senha no primeiro acesso via token Supabase; retorna `access_token` + `refresh_token`

### Admin (JWT `Authorization: Bearer` ou `X-Admin-Token`)
- `POST /api/v1/admin/auth/login` — login admin (requer `app_metadata.role == "admin"`)
- `GET /api/v1/admin/auth/admins` — lista admins
- `POST /api/v1/admin/auth/convidar` — convida novo admin (só master)
- `PATCH /api/v1/admin/auth/admins/{id}/revogar` — revoga acesso (só master)
- `DELETE /api/v1/admin/auth/admins/{id}` — exclui admin (só master)
- `POST /api/v1/admin/abrir-portal/{tenant_id}` — JWT para simular cliente
- `GET/POST/PATCH/DELETE /api/v1/admin/clientes` — CRUD comercial
- `GET/POST/PATCH/DELETE /api/v1/admin/licencas` — CRUD vigências
- `POST /api/v1/admin/compradores/{id}/enviar-convite` — convite via e-mail

### Portal cliente (JWT)
- `POST /api/v1/portal/compradores/{id}/enviar-convite` — convite enviado pelo portal

### Agenda (JWT)
- `GET /api/v1/agenda/proximas?tenant_id=&comprador_id=`
- `GET /api/v1/agenda/atrasadas?tenant_id=&comprador_id=`
- `GET /api/v1/agenda/{id}/sugestao`
- `POST /api/v1/agenda/{id}/tratar`

### Redirect (público)
- `GET /portal` — redirect 302 para `FRONTEND_URL`

## Fluxo de convite de comprador

1. Portal cliente → botão "Convite" → `POST /api/v1/portal/compradores/{id}/enviar-convite` com JWT
2. Backend gera link Supabase Auth (`type=recovery` ou `type=invite`) com `redirect_to = {FRONTEND_URL}/instalar.html`; grava `user_id` + `app_metadata` no comprador
3. E-mail enviado com dois CTAs: **"Criar minha senha"** (link 24h) + **"Baixar instalador do atalho"** (bat Windows)
4. Comprador clica no link → `instalar.html` → define senha → JWT + `refresh_token` + role `buyer` + `loggedBuyerId` + `activeBuyerId` salvos em localStorage → redirect automático para o portal
5. No portal, o comprador já aparece selecionado como ativo

## Instalador Windows (`frontend/instalar_atalho.bat`)

- Arquivo `.bat` autossuficiente (não baixa nada além do atalho)
- Detecta Edge (prioridade) ou Chrome nos caminhos padrão de `%ProgramFiles(x86)%` e `%ProgramFiles%`
- Cria `Agenda de Compras.lnk` na área de trabalho com `--app=URL --no-first-run`
- URL do atalho: `https://agenda-de-compras-api.vercel.app/portal` (redirect estável)
- Para mudar o destino do portal: atualizar `FRONTEND_URL` no Vercel — atalhos existentes continuam funcionando
- `instalar_atalho.ps1`: versão estendida com download de ícone e mensagens coloridas

## Autenticação JWT — Refresh Automático

- Login e `definir-senha` retornam `access_token` + `refresh_token`
- `refresh_token` salvo em `_store(storageKeys.refreshToken)` (sessionStorage ou localStorage conforme contexto)
- `refreshJWT()` em `script_utils.js`: `POST {supabaseUrl}/auth/v1/token?grant_type=refresh_token`; atualiza ambos os tokens; retorna `true/false`
- `fetchApi()` com retry em 401: chama `refreshJWT()` e repete a request; só lança erro se refresh falhar
- `setInterval(refreshJWT, 50 * 60 * 1000)` em `bootstrap()` — renova a cada 50 min em background
- **Compradores** (`role=buyer`): sessão ativa o dia todo sem re-login
- **Admin "Abrir Portal"** (`role=admin_portal`): JWT em sessionStorage, expira em 1h — abrir portal novamente no admin renova

## Isolamento de tenant por aba (admin "Abrir Portal")

- `abrirPortal(tenantId)` no admin abre `window.open("", "_blank")` **antes** do `await` (evita popup blocker)
- JWT e `tenant_id` gravados em `sessionStorage` da nova aba → `_store()` lê session primeiro
- Cada aba tem sessionStorage independente — abrir Velanes não contamina a aba do SV
- Feedback mostra nome do cliente: `"Gerando acesso ao portal de 'Grupo X'..."`
- JWT do "Abrir Portal" cacheado 55 min em memória no backend (`_portal_jwt_cache`)

## Service Worker e PWA

- Cache: `agenda-compras-v10` — bumpar ao alterar JS/CSS (Hard refresh não bypassa o SW no Chrome)
- SW registrado em `index.html` e `instalar.html` com `navigator.serviceWorker.register('/sw.js')`
- ASSETS do SW: os 6 `script_*.js`, `index.html`, `instalar.html`, `styles.css`, `manifest.json`, `icon-*.png`, fontes, FullCalendar
- Modal "Instale o app": detecta browser via `userAgent` e mostra instruções específicas (Edge / Chrome / iOS)
- `showPwaInstallModal()` exposta globalmente — chamada pelo botão "📲 Reinstalar Atalho" na sidebar
- `beforeinstallprompt` capturado em `script_main.js`: abre modal automaticamente se `agenda_pwa_installed` não estiver no localStorage

## Tela de Fornecedores

- **Exportar**: botão "📤 Exportar" — Excel via SheetJS com base completa
- **Busca**: filtro em tempo real por código ou nome (`renderSuppliers` com filtro)
- **Importação CSV**: `parseSuppliersCsv` pula linhas sem código/nome; progresso em tempo real; campo Comprador é opcional
- Upsert via PostgREST com `?on_conflict=codigo_fornecedor`

## Frequências de revisão (regras de negócio)

| Valor | Dias compra | Intervalo |
|---|---|---|
| 1, 2, 4 | 1 dia | 28/14/7 dias |
| 8 | 2 dias | próximo dia permitido |
| 12 | 3 dias | próximo dia permitido |

Lógica duplicada em `backend/app/services/agenda_service.py` e `frontend/script_render.js` (`tratarAgendaAtual`) — manter sincronizados.

## Feriados

- Importação de feriados nacionais via BrasilAPI com timeout de 10s
- Aparecem no calendário: fundo amarelo + chip laranja com nome
- Alerta ao criar evento ou tratar agenda em feriado (não bloqueia)
- `isFeriado(dateIso)` e `getFeriado(dateIso)` em `script_main.js`

## Horário do fornecedor

- `fornecedores.hora_inicio` / `hora_fim` — horário padrão de visita/pedido
- Propagados ao criar/sincronizar ocorrências pendentes
- Alerta de conflito de horário ao tratar agenda
- `checkEventConflict()` em `script_main.js` verifica via Supabase REST

## Migrations SQL (`backend/db/`)

| Arquivo | Conteúdo |
|---|---|
| `schema_v1.sql` | Tabelas base: tenants, compradores, fornecedores, agenda_ocorrencias |
| `schema_v2_supabase_admin.sql` | Integração Supabase Auth, policies RLS |
| `schema_v3_clientes_validade.sql` | Tabelas clientes, clientes_licencas |
| `schema_v4_fornecedor_notas.sql` | Campo notas no fornecedor |
| `schema_v5_categorias_calendario.sql` | categorias_agenda, campos de calendário em ocorrências |
| `schema_v5_fix_rls_categorias.sql` | Fix de policies RLS em categorias |
| `schema_v6_notas_painel.sql` | Campo `nota` em agenda_ocorrencias (post-it) |
| `schema_v7_auth_licencas.sql` | Campo `user_id` em compradores, tabela tenant_licencas |
| `schema_v8_feriados.sql` | Tabela feriados |
| `schema_v9_fornecedor_horario.sql` | Campos `hora_inicio`/`hora_fim` em fornecedores |

## Pendências

- `SUPABASE_SERVICE_ROLE_KEY` no Vercel foi sinalizado como potencialmente exposto em abr/2026 — rotacionar quando possível (impacta envio de convites).
- `PORTAL_ADMIN_PASSWORD` precisa ser exatamente a senha de `andre@servicefarma.far.br` no Supabase Auth.
- Script `GRUPO_SAO_VALENTIM_setup.sql` não é idempotente — se rodado novamente duplica dados.
