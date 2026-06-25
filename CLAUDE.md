# CLAUDE.md

Sistema web multi-tenant SaaS para gestão de agenda de compras de farmácias.

## Deploy

### Produção (`main` → deploy automático)

| Projeto Vercel | URL | Pasta |
|---|---|---|
| agenda-compras-cliente | `https://agenda-compras-cliente.vercel.app` | `frontend/` |
| agenda-compras-admin   | `https://agenda-compras-admin.vercel.app`   | `frontend_admin/` |
| agenda-de-compras-api  | `https://agenda-de-compras-api.vercel.app`  | `backend/` |

### Staging (`staging` → deploy automático em preview)

| Projeto Vercel | URL | Pasta |
|---|---|---|
| agenda-compras-cliente | `https://agenda-compras-cliente-git-staging-andrevannis-projects.vercel.app` | `frontend/` |
| agenda-compras-admin   | `https://agenda-compras-admin-git-staging-andrevannis-projects.vercel.app`   | `frontend_admin/` |
| agenda-de-compras-api  | `https://agenda-de-compras-api-git-staging-andrevannis-projects.vercel.app`  | `backend/` |

### Fluxo de trabalho

```
1. Desenvolver na branch staging
2. Testar nas URLs de staging acima
3. Quando aprovado: merge staging → main → produção automática
```

⚠️ **O staging usa o mesmo Supabase da produção** — não criar/deletar dados reais durante testes. Usar o tenant Service Farma (`c2f65634-b7e0-47f0-8937-94446540701a`) para testes.

Supabase: `fnwsorhflueunqzkwsxu.supabase.co`

## Variáveis de ambiente (Vercel — projeto `agenda-de-compras-api`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ | Connection string PostgreSQL do Supabase |
| `SUPABASE_URL` | ✅ | `https://fnwsorhflueunqzkwsxu.supabase.co` |
| `SUPABASE_ANON_KEY` | ✅ | Chave pública do Supabase (publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Chave secreta do Supabase (admin) — ⚠️ rotacionar se exposta |
| `ADMIN_API_TOKEN` | ✅ | Token legado para `X-Admin-Token` (fallback) |
| `SMTP_PASSWORD` | ✅ | Senha SMTP de `comercial@servicefarma.far.br` (fallback quando `RESEND_API_KEY` não configurado) |
| `RESEND_API_KEY` | ✅ | API Key do Resend.com — provider principal de e-mail (domínio `servicefarma.far.br` verificado em mai/2026) |
| `PORTAL_ADMIN_EMAIL` | ✅ | `andre@servicefarma.far.br` (usado no "Abrir Portal") |
| `PORTAL_ADMIN_PASSWORD` | ✅ | Senha Supabase Auth do `andre@servicefarma.far.br` |
| `FRONTEND_URL` | ✅ | `https://agenda-compras-cliente.vercel.app` (usado no redirect `/portal` e e-mails) |
| `CRON_SECRET` | ✅ | Token de autenticação do cron de relatório diário (`agenda-cron-2026-sfx`) |

## Arquitetura

```
Routes (backend/app/api/v1/) → Services (backend/app/services/) → DB session (SQLAlchemy)
```

- **Frontend cliente** chama Supabase REST direto via `fetchSupabase()`. FastAPI só para auth JWT e operações admin.
- **Multi-tenancy**: todo registro tem `tenant_id`. Queries SEMPRE filtram por `tenant_id`. RLS no Supabase usa `USING (true)` — isolamento é via aplicação.
- **Migrations**: scripts SQL versionados em `backend/db/` (`schema_v1.sql` → `schema_v14_*.sql`). Sem Alembic.
- **CORS**: `CORSMiddleware` em `main.py` com `allow_origins=["*"]`, `allow_credentials=False` — correto para APIs que usam Bearer token (não cookies). `backend/vercel.json` também adiciona headers CORS via `"headers"` top-level como camada dupla de garantia. Não usar `allow_credentials=True` com `allow_origins` específicos — conflita com os headers do Vercel e bloqueia o preflight.

## Regras de desenvolvimento (obrigatórias)

- **Ao final de cada sessão, atualizar o menu "🆕 Versões"** — toda mudança visível ao usuário (nova funcionalidade, correção de bug, melhoria de UX) precisa virar uma entrada nova no topo do array `VERSOES` em **DOIS arquivos sincronizados**: [frontend/script_state.js](frontend/script_state.js) (fonte do menu Versões do cliente) e [backend/app/data/versoes.py](backend/app/data/versoes.py) (espelho em Python lido pelo endpoint `/api/v1/admin/versoes/list`, que alimenta a seção "Notas de Versão" do painel admin para disparo de email). Bump o `sw.js` (ex.: `agenda-compras-v50` → `v51`) e use o mesmo número como `versao` na entrada. Formato: `{ versao, dataHora ("DD/MM/AAAA — manhã/tarde"), notas: [linhas explicativas curtas] }`. **NUNCA citar nome de cliente, fornecedor, comprador ou pessoa real nas notas** — usar formulações genéricas ("foi reportado que…", "compradores relataram…"). Notas são lidas pelos usuários finais e por destinatários externos cadastrados no admin — devem ser claras, no idioma deles, sem jargão técnico. Mudanças puramente de backend/infra que não alteram comportamento visível não precisam de entrada.
- **Nunca alterar código de risco sem autorização explícita do usuário** — descrever o que será feito e aguardar confirmação antes de executar. Isso inclui: fluxo de autenticação, isolamento de tenant, sessionStorage/localStorage, qualquer arquivo que afete dados de clientes reais.
- **Sempre bumpar o Service Worker** (`frontend/sw.js` — `agenda-compras-vN`) junto com qualquer commit que altere JS ou CSS do frontend. Idem para `frontend_admin/sw.js` (`agenda-admin-vN`). Sem bump, o browser serve cache antigo e as correções não chegam aos usuários.
- **Ambiente de staging é prioridade máxima** — toda feature ou correção deve ser testada em staging antes de ir para produção (`main`). Ainda a implementar.
- **Toda nova tabela em migration DEVE incluir GRANT + RLS explícitos** — a partir de **30/out/2026** o Supabase deixa de conceder acesso automático à Data API (PostgREST/supabase-js/GraphQL) para tabelas novas do schema `public` em projetos existentes (mudança anunciada em mai/2026; novos projetos já desde 30/mai/2026). Sem `GRANT` explícito, o frontend (`fetchSupabase()`) recebe erro `42501` e a tabela fica invisível. **Tabelas existentes mantêm os grants atuais — nada quebra retroativamente**; a regra vale só para tabelas criadas em migrations futuras (`schema_v19+`). Padrão obrigatório ao final de todo `CREATE TABLE` em `backend/db/`: `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` + `CREATE POLICY ... USING (true);` (isolamento é por aplicação via `tenant_id`) + `GRANT ALL ON x TO authenticated, anon, service_role;`. Referência de bom padrão: [schema_v17_notas_painel.sql](backend/db/schema_v17_notas_painel.sql) e [schema_v18_versoes_notificacao.sql](backend/db/schema_v18_versoes_notificacao.sql). ⚠️ O alerta crítico recorrente do Security Advisor (`rls_disabled_in_public`) que chega por e-mail é de **outro projeto** (`financeiro_a3` / `vocjuslpariejxitzdfc`), NÃO da Agenda (`fnwsorhflueunqzkwsxu`).
- **Variáveis CSS inexistentes no `frontend/styles.css`**: `--surface-alt`, `--border` e `--card-bg` não estão definidas — usar `--panel-soft`, `--line` e `--panel` respectivamente. Usar fallback hardcoded claro (ex.: `#f8fafc`) nessas variáveis causa texto ilegível no tema escuro.
- **`id` duplicado no HTML causa feedback invisível**: nunca reutilizar o mesmo `id` em mais de um elemento — `document.getElementById` retorna sempre o primeiro, mesmo que o segundo seja o visível (ex.: elemento dentro de modal). Bug real: `importPreviewBox` duplicado fazia feedback da importação aparecer fora do modal.
- **`loadCategorias` cria "Agenda de Compras" automaticamente**: se o tenant não tiver nenhuma categoria no banco, `loadCategorias` insere a categoria "Agenda de Compras" (cor `#F59E0B`) via upsert. Essa é a categoria fundamental do sistema — todos os fornecedores são associados a ela. Nunca remover esse comportamento.
- **`backfillMissingPendingOccurrences` só processa `missingCategoria` com UUID real**: IDs mock (ex.: `"cat-compras"` do fallback catch) não têm FK válida no banco e causariam loop infinito de GETs sem PATCH efetivo a cada carregamento. A função valida o formato UUID antes de incluir fornecedores sem `categoria_id` no backfill.
- **`loginBuyer` exibe a mensagem real do backend em caso de erro** (`script_data.js` — `catch (error) { setFeedback(error.message ...) }`). Nunca trocar por `catch {}` silencioso: o "modo legado" (linhas 585-624, comparação de senha em texto plano) é vestígio pré-JWT e não funciona mais — engolir o erro fazia o usuário ver "Acesso não localizado" enganoso quando o motivo real era senha errada, comprador não cadastrado, API down, etc. Causou 1 semana de bloqueio da diretora da Drogaria SV (mai/2026). `fetchApi` já lança `Error(data.detail)` no `script_utils.js:77` — basta repassar `error.message`.

## Estrutura do frontend cliente (`frontend/`)

Arquivos JS carregados em ordem no `index.html` — escopo global compartilhado (não são ES modules):

| Arquivo | Conteúdo |
|---|---|
| `script_state.js` | Estado global, constantes, mocks, refs DOM, `storageKeys`, `defaultSettings` |
| `script_utils.js` | `fetchSupabase()`, `fetchApi()`, `refreshJWT()`, `_store()`, utilitários de data/cálculo, `renderBuyers()`, `editBuyer()` |
| `script_render.js` | Render tabelas, fornecedores, compradores, `saveBuyer()`, `renderCompromissos()`, `deleteCompromisso()` |
| `script_forms.js` | Formulários (saveSupplier), importação CSV/Excel, exportação, `ensureBuyerSelection()`, `renderAuditDashboard()`, `loadEmailLog()` |
| `script_data.js` | `loadPortalData()`, `loadClientMetaOnly()` (carga leve só de tenants+clientes sem JWT), `loginBuyer()` (chama `loadCategorias` + `loadPortalData` após auth), `bindEvents()`, configurações |
| `script_main.js` | `bootstrap()` com gate de sessão (sem JWT/tenant não carrega agenda/fornecedores/categorias, só abre login), auth, calendário, categorias, PWA install, `refreshJWT` interval, `saveNewEvent()`, `deleteGenericEvent()` |

Outros arquivos estáticos:

| Arquivo | Descrição |
|---|---|
| `vercel.json` | Configuração Vercel: `buildCommand: null`, `outputDirectory: "."`, `framework: null` — força deploy como site estático |
| `sw.js` | Service Worker v43 — cache dos assets, registrado em `index.html` e `instalar.html` |
| `manifest.json` | PWA manifest com ícones PNG 192×512 |
| `icon-192.png` / `icon-512.png` | Ícones PWA gerados do `.ico` original |
| `instalar.html` | Página de primeiro acesso: define senha → loga → mostra guia de instalação |
| `instalar_atalho.bat` | Instalador Windows autossuficiente — cria atalho na área de trabalho |
| `instalar_atalho.ps1` | Versão estendida do instalador (com download de ícone) |

## Estrutura do frontend admin (`frontend_admin/`)

`vercel.json` presente: `buildCommand: null`, `outputDirectory: "."`, `framework: null` — força deploy como site estático.

Arquivo único `script.js` (não dividido). Painel administrativo:

- Login com e-mail + senha via `POST /api/v1/admin/auth/login` → JWT em `localStorage['agenda_admin_jwt']`
- Seções: Base Operacional (tenants), Clientes, Vigências, Admins, **Log de E-mails**, Ajuda, Conexão
- **Admins — inscrições de relatório**: cada card de admin tem botão **📧 Relatórios** → modal com checklist de tenants; admin inscrito recebe cópia consolidada (gestor) do relatório diário daquele tenant; qualquer admin pode gerenciar suas próprias inscrições; `editAdminReportSubs()` / `saveAdminReportSubs()` em `script.js`
- **Admins — gestão (Convidar/Revogar/Excluir)**: controles sempre visíveis para qualquer admin autenticado; autorização master-only (`MASTER_EMAIL = andre@servicefarma.far.br`) aplicada exclusivamente no backend (`require_master_admin`). Não usar guarda frontend para visibilidade desses controles.
- **Clientes — logomarca**: o upload no formulário **Cadastrar cliente** (`#logoFile`) só roda na criação. Para um cliente **já cadastrado**, cada card tem botão **"Adicionar logo" / "Trocar logo"** (rótulo muda conforme já exista `logo_url`) — `trocarLogo(clienteId)` em `script.js` abre um `<input type=file>` dinâmico, sobe via `uploadLogo()` (bucket Storage `logos`) e grava `logo_url` por PATCH em `clientes.observacoes` via `buildObservacoes()` (mesmo padrão de `definirSenhaAuditoria` — preserva `audit_password` e demais metadados)
- **SW admin**: `frontend_admin/sw.js` — `agenda-admin-v14`; bumpar junto com qualquer alteração de JS/CSS do painel admin
- `fetchAdmin()` envia JWT admin no header `Authorization: Bearer` (com fallback para `X-Admin-Token`)
- Tenants ordenados **alfabeticamente** por `nome`
- Cada card de tenant tem toggle **"Envio de relatório diário"** — PATCH imediato em `tenants.envio_relatorio_ativo`
- **Log de E-mails**: seção com tabela de `relatorio_log` filtrada por período (7/30/90 dias) e base operacional; chips ✅/❌; `loadEmailLog()` em `script.js`

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
| `agenda_duracao_compromissos` | local | Duração padrão em minutos para novos compromissos (padrão 30) |
| `agenda_duracao_agenda` | local | Duração padrão em minutos para ocorrências de agenda (padrão 30) |

`_store(key)` lê `sessionStorage` primeiro, depois `localStorage` — permite isolamento por aba (admin "Abrir Portal" usa sessionStorage para não contaminar outras abas).

## Roles de acesso no portal cliente

| Role (`loggedPortalRole`) | Quem | Permissões |
|---|---|---|
| `buyer` | Comprador logado | Ver/tratar agenda da própria carteira; enviar convites; editar campos de qualquer comprador exceto senha; editar própria senha |
| `admin_client` | E-mail responsável do tenant | Tudo do buyer + editar/excluir qualquer comprador; auditoria completa; configurações de notificação |
| `admin_portal` | Admin via "Abrir Portal" | Acesso total — bypass do login; sessão em sessionStorage |

### Permissões na seção Compradores

| Ação | `buyer` | `admin_client` / `admin_portal` |
|---|---|---|
| Editar campos (nome, telefone, email, foto) | ✅ qualquer comprador | ✅ |
| Editar senha | ✅ próprio registro apenas | ✅ qualquer |
| Excluir comprador | ❌ | ✅ |
| Enviar convite | ✅ | ✅ |
| Definir is_gestor / notificações por e-mail | ❌ | ✅ |

## Compradores — campos de notificação e papel

| Campo | Tipo | Descrição |
|---|---|---|
| `is_gestor` | boolean | **Escopo, não gatilho.** Quando o comprador recebe o relatório, vê dados de TODOS os compradores do tenant (consolidado) em vez de só a própria carteira. **Sozinho NÃO dispara envio.** |
| `receber_auditoria` | boolean | **Gatilho de envio.** Inclui no e-mail a seção "Tratamentos do dia anterior" + KPIs do mês |
| `receber_agenda_proximo` | boolean | **Gatilho de envio.** Inclui no e-mail as seções "Itens em atraso" + "Agenda do próximo dia útil" |

- ⚠️ **`is_gestor` NÃO faz o e-mail ser enviado** — apesar do nome, ele só define o escopo do conteúdo. O cron seleciona o comprador apenas se `receber_auditoria=true OR receber_agenda_proximo=true` (ver `WHERE` em `relatorio_service.enviar_relatorios_tenant`). Caso real (29/mai/2026): gestora não recebia porque os dois flags de "Receber e-mail" estavam desligados — `is_gestor=true` sozinho nunca disparou. Os rótulos no portal ([frontend/index.html](frontend/index.html), `compradorIsGestor`/`compradorReceberAuditoria`/`compradorReceberAgenda`) foram reescritos nessa data para deixar isso explícito.
- Gestor sempre recebe dados de todos os compradores, independente dos flags individuais dos outros
- Não-gestor recebe apenas os dados da própria carteira
- Campos editáveis apenas por `admin_client` / `admin_portal` no formulário de comprador

## Backend — arquivos por responsabilidade

| Arquivo | Prefixo | Descrição |
|---|---|---|
| `api/v1/auth.py` | `/api/v1/auth` | Login comprador, definir senha (primeiro acesso) |
| `api/v1/admin_auth.py` | `/api/v1/admin/auth` | Login admin, listar/convidar/revogar/excluir admins |
| `api/v1/admin_portal.py` | `/api/v1/admin` | `POST /abrir-portal/{tenant_id}` — JWT cacheado 55 min |
| `api/v1/admin_clientes.py` | `/api/v1/admin/clientes` | CRUD de clientes comerciais (usa SQLAlchemy + PostgreSQL direto) |
| `api/v1/admin_licencas.py` | `/api/v1/admin/licencas` | CRUD de vigências/licenças (usa Supabase client) |
| `api/v1/admin_auth.py` | `/api/v1/admin/auth/report-subscriptions` | GET/PUT inscrições de relatório por admin (usa Supabase client) |
| `api/v1/admin_compradores_invite.py` | `/api/v1/admin/compradores` | Envio de convite pelo admin |
| `api/v1/admin_email_log.py` | `/api/v1/admin/email-log` | Log de relatórios enviados — consulta `relatorio_log` com join em tenants/compradores |
| `api/v1/portal_compradores.py` | `/api/v1/portal/compradores` | Envio de convite pelo portal cliente (requer JWT) |
| `api/v1/portal_audit_log.py` | `/api/v1/portal/audit-log` | Grava evento em `audit_log` via SERVICE_ROLE — contorna RLS que bloqueava buyers |
| `api/v1/agenda.py` | `/api/v1/agenda` | Listar próximas/atrasadas, sugerir data, tratar ocorrência |
| `api/v1/cron.py` | `/api/v1/cron` | Endpoint de cron — dispara relatórios diários |
| `api/v1/redirect.py` | `/portal` | Redirect 302 para `FRONTEND_URL` (URL estável do instalador) |
| `services/agenda_service.py` | — | Lógica de tratamento: cálculo de datas, parâmetros |
| `services/email_service.py` | — | `send_html()` — usa Resend se `RESEND_API_KEY` configurado, fallback para SMTP porta 465; inclui `text/plain` automático via `_html_to_text()`; suporta `attachments` (PDF). `_send_via_resend` tem **throttle ≤4/s** (`_resend_throttle`, gate thread-safe com espaçamento mínimo de 0,25s) + **retry com backoff** (0,5/1/2s) só em erro 429 — ver "Rate limit do Resend" abaixo |
| `services/relatorio_service.py` | — | Monta e envia relatório diário (HTML + PDF anexo) |
| `services/pdf_service.py` | — | Gera PDF com ReportLab (padrão visual SFI) |
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
- `GET /api/v1/admin/email-log?dias=30&tenant_id=` — histórico de relatórios enviados (relatorio_log)
- `GET /api/v1/admin/auth/report-subscriptions?admin_email=` — lista tenant_ids que o admin recebe por e-mail
- `PUT /api/v1/admin/auth/report-subscriptions` — salva inscrições `{admin_email, tenant_ids[]}`

### Portal cliente (JWT)
- `POST /api/v1/portal/compradores/{id}/enviar-convite` — convite enviado pelo portal
- `POST /api/v1/portal/audit-log` — grava evento em `audit_log` (tenant_id derivado do JWT); usado por `logAuditEvent()` no frontend

### Agenda (JWT)
- `GET /api/v1/agenda/proximas?tenant_id=&comprador_id=`
- `GET /api/v1/agenda/atrasadas?tenant_id=&comprador_id=`
- `GET /api/v1/agenda/{id}/sugestao`
- `POST /api/v1/agenda/{id}/tratar`

### Cron (header `X-Cron-Secret` ou `Authorization: Bearer {CRON_SECRET}`)
- `GET /api/v1/cron/relatorio-diario` — chamado pelo Vercel Cron (00:00 UTC = 21:00 BRT, seg-sex); schedule `0 0 * * 2-6` UTC
- `POST /api/v1/cron/relatorio-diario` — chamada manual; aceita `?tenant_id=`, `?data_ref=`, `?admin_only=true` (envia só para admins inscritos, sem disparar compradores) e `?comprador_id=` (envio pontual a UM único comprador para validação — pula os demais compradores e as cópias de admin)

### Redirect (público)
- `GET /portal` — redirect 302 para `FRONTEND_URL`

## Relatório Diário por E-mail

### Fluxo
1. Vercel Cron dispara `GET /api/v1/cron/relatorio-diario` toda noite às **21h BRT** (00:00 UTC, seg-sex) — schedule `0 0 * * 2-6` UTC (ter–sáb UTC = seg–sex BRT)
2. `relatorio_service.py` busca tenants com `envio_relatorio_ativo = true`
3. Para cada tenant, busca compradores com `receber_auditoria = true` ou `receber_agenda_proximo = true`
4. Monta HTML rico + gera PDF com ReportLab (`pdf_service.py`)
5. Envia e-mail via SMTP com PDF anexo; registra em `relatorio_log`
6. Após compradores, busca admins inscritos em `admin_report_subscriptions` e envia cópia consolidada (gestor) para cada um; registra em `relatorio_log` com `tipo='admin_copia'`

### Inscrições de relatório para admins
- Tabela `admin_report_subscriptions(admin_email, tenant_id)` — criada em `schema_v14`
- Admin se inscreve via Painel Admin → Admins → botão **📧 Relatórios** → checklist de tenants
- Cópia enviada sempre no nível gestor (dados consolidados de todos os compradores do tenant)
- Teste sem afetar compradores: `POST /api/v1/cron/relatorio-diario?tenant_id=X&admin_only=true` com `X-Cron-Secret`
- Envio pontual a 1 comprador (validar entrega sem disparar para os outros): `POST /api/v1/cron/relatorio-diario?tenant_id=X&comprador_id=Y&data_ref=AAAA-MM-DD` com `X-Cron-Secret` (adicionado em 29/mai/2026 — `comprador_id` em `enviar_relatorios_tenant`; pula demais compradores e admins)
- ⚠️ Ao criar a tabela via SQL, rodar `GRANT ALL ON admin_report_subscriptions TO authenticated, anon, service_role;` para garantir acesso via Supabase client

### Estrutura do PDF (6 seções — reestruturado em mai/2026)
1. **Cabeçalho** (hero band): tenant, destinatário, data
2. **⚠️ Itens em Atraso**: PENDENTE com `data_prevista < próximo dia útil` — destaque vermelho
3. **📅 Agenda do Próximo Dia Útil**: A) Agenda de Compras (fornecedor_id IS NOT NULL) + B) Outros Compromissos (fornecedor_id IS NULL)
4. **📋 Tratamentos do Dia Anterior**: detalhado — obs. + justificativa em itálico roxo quando presente
5. **📊 KPIs Mês Corrente**: Total / Realizadas / Atrasadas / Pendentes
6. **📊 KPIs Mês Anterior**: mesma estrutura (comparativo)

### Gestor vs. comprador normal
- `is_gestor = true`: recebe dados de **todos** os compradores do tenant (dados gerais — carregados uma vez, reutilizados)
- `is_gestor = false`: recebe apenas dados da **própria carteira** (queries filtradas por `comprador_id`)

### Ativação
1. Portal Admin → Base Operacional → toggle **"Envio de relatório diário"** no tenant
2. Portal Cliente → Compradores → marcar checkboxes de notificação no comprador
3. Cron roda automaticamente; teste manual via `POST /api/v1/cron/relatorio-diario` com `X-Cron-Secret: agenda-cron-2026-sfx`

### Log de envios
- Tabela `relatorio_log` no Supabase
- Visível em Portal Cliente → ⚙️ Configurações → "📧 Log de E-mails Enviados"
- Filtro por 7 / 30 / 90 dias; chips ✅ Enviado / ❌ Erro

## Auditoria da Operação

- Protegida por senha (`clientMeta.audit_password`); acesso para `admin_client` e `admin_portal`
- **Escopo**: apenas Agenda de Compras + cadastro de Fornecedores + cadastro de Compradores
- **Filtros**: período (30 dias / última semana / último mês / personalizado) + filtro por comprador
- **KPIs de Agenda**: Eventos, Cumpridas, Postergadas, Aumentos, Reduções, Antecipadas
- **Gráficos Chart.js** (CDN `chart.js@4.4.4`):
  - Linha temporal (tendência diária do período — pulado se >90 dias)
  - Doughnut (distribuição Cumpridas/Postergadas/Antecipadas)
  - Barra horizontal por comprador
  - Heatmap dia da semana (HTML/CSS puro, sem plugin)
  - Top 5 fornecedores (ranking de postergadas/aumentos/reduções)
- **Recomendações inteligentes** (seção rotulada `💡` — antes era "Inteligência artificial", renomeada em mai/2026 porque é heurística determinística, não IA real): resumo executivo, risco de atraso, comprador sobrecarregado, pressão/enxugar estoque, carteira sem dono, fornecedor com parâmetro instável (≥4 ajustes), parâmetro alto demais (>60% antecipadas), padrão semanal (atrasos concentrados num dia), execução fora da carteira
- **Exportação Excel**: botão "📤 Exportar" via SheetJS — exporta entradas filtradas
- **Seção "Eventos de Cadastro"**: tabela de `audit_log` filtrada por período — criações, exclusões e alterações de fornecedores e compradores com chips coloridos (verde/amarelo/vermelho)
- **Justificativa**: ao tratar agenda, o modal exibe resumo dinâmico do que será auditado + botão "Sim/Não" para justificativa livre; texto gravado em `observacao.justificativa`; exibido em itálico roxo na tabela de auditoria
- **📦 Deu pedido? (obrigatório desde mai/2026 — modal dedicado)**: ao clicar em "Tratar Agenda" no modal de detalhe, abre um **modal separado** (`pedidoModal` em [frontend/index.html](frontend/index.html); funções `openPedidoModal`/`setupPedidoModalHandlers`/`confirmarPedidoEContinuar`/`getPedidoModalData` em [frontend/script_render.js](frontend/script_render.js)). O comprador escolhe entre **✓ SIM** (botão verde grande) ou **✗ NÃO** (vermelho grande). Sim → informa quantidade (inteiro) + valor (R$ com máscara automática). Não → seleciona motivo (`NAO_DEU_PEDIDO_MINIMO` / `FORNECEDOR_NAO_CUMPRIU` / `INDEFINICAO_COMERCIAL` / `OUTROS`) + detalhe opcional. Botão **"✓ Confirmar e Tratar Agenda"** no rodapé valida e dispara o PATCH em `agenda_ocorrencias` (chama `tratarAgendaAtual(pedido)` passando os dados como argumento — não há mais `getPedidoData` lendo do modal de detalhe). Validação client-side no `pedidoModal` + validação SQL (CHECK constraint do schema_v15) garantem consistência. Campos em colunas reais de `agenda_ocorrencias`, não em JSON. Aparece como coluna "Pedido" na auditoria por comprador, alimenta os KPIs "Taxa de pedido" e "Valor total", e vai para a exportação Excel + PDF do relatório diário. **Histórico de design (26/mai/2026)**: primeira versão era bloco inline no próprio modal de detalhe — gerou confusão visual (4 botões "Sim/Não" no mesmo modal, 2 do pedido + 2 da justificativa). Refatorado para modal dedicado a pedido do usuário.
- `renderAuditDashboard()` em `script_forms.js`; `classifyAuditEvent()`, `aggregateAuditMetrics()`, `updateAuditSummary()` em `script_render.js`
- `state.auditLogs` carregado em `loadPortalData()` (500 registros mais recentes de `audit_log`)

## Audit Log — eventos de cadastro (`audit_log`)

- Tabela criada em `schema_v12_audit_log.sql`; RLS com `app.user_belongs_to_tenant(tenant_id)`
- **Backend grava log** (desde mai/2026): `logAuditEvent()` em `script_utils.js` chama `POST /api/v1/portal/audit-log` (FastAPI usa SERVICE_ROLE e contorna a RLS). Antes era INSERT direto no Supabase REST e a RLS bloqueava silenciosamente quando o usuário era buyer (sem entrada em `tenant_users`), perdendo todos os logs de compradores.
- **Fornecedores**: `logAuditEvent()` em `script_utils.js` chamado por `saveSupplier()` (criação + diff de campos) e `deleteSupplier()` (exclusão com snapshot)
- **Compradores**: chamado por `saveBuyer()` (criação + diff nome/email) e `deleteBuyer()` (exclusão)
- Campos logados: `tipo_objeto`, `objeto_id`, `objeto_nome`, `acao` (criacao/alteracao/exclusao), `campos_alterados` (jsonb com `{de, para}`), `executor_role`, `executor_nome`
- **Não** loga outros objetos (categorias, feriados, etc.)

## Modal Novo Evento / Edição

- Acessível pelo botão **"+ Novo Evento"** no Calendário e na seção Compromissos
- **Modo criação**: título "Novo Evento", recorrência visível, sem botão Excluir
- **Modo edição**: título "Editar Evento", recorrência oculta, botão 🗑️ Excluir visível — aberto ao clicar em evento genérico no calendário
- Clicar em evento de **Agenda de Compras** no calendário abre o detalhe com as regras próprias (inalterado)
- **PATCH** na ocorrência existente ao salvar em modo edição; **DELETE** com confirmação ao excluir
- **Série + edição/exclusão em massa** (desde mai/2026, [schema_v16](backend/db/schema_v16_serie_recorrencia.sql)): toda criação com `total > 1` (recorrência ou multi-comprador) recebe um `serie_id` UUID compartilhado em `agenda_ocorrencias.serie_id` ([script_main.js `saveNewEvent`](frontend/script_main.js)). No modo edição, quando a ocorrência tem `serie_id`, um radio "Aplicar mudanças a" aparece com 3 escopos: **Só esta** (PATCH/DELETE por id — comportamento legado), **Esta e as próximas** (filtro `serie_id=eq.X&data_prevista=gte.Y`), **Toda a série** (filtro só por `serie_id`). Ocorrências legado (sem `serie_id`) só têm "Só esta" — o radio fica oculto. Edição em massa NÃO replica `data_prevista` (cada ocorrência tem a sua), `nota` (post-it ad-hoc, ver abaixo), nem `comprador_id` (intencional — para trocar carteira, edita uma por vez). Exclusão em massa pede confirmação com contagem (`Excluir 14 ocorrência(s) da série?`).
- `saveNewEvent()`, `deleteGenericEvent()` e `getEditScope()` em `script_main.js`; `newEventEditId` (hidden input) controla o modo, `newEventEditScopeWrap` esconde/mostra o radio
- **Botão "Salvar Evento" desabilitado durante o POST** — evita duplo clique criando ocorrências duplicadas; reabilitado no `finally`
- **Categoria**: "Agenda de Compras" excluída do dropdown
- **Compradores**: checkboxes em grid; botões Todos/Nenhum; comprador logado pré-marcado na criação
- **Multi-comprador**: cria uma ocorrência por comprador × data (só no modo criação)
- **Recorrência**: Diária, Semanal, Quinzenal, Mensal (só no modo criação)
- **Duração padrão**: calculada via `addMinutesToTime()` com `getSettings().duracaoPadraoCompromissos`
- **Nota é post-it (não replica)**: o campo `nota` do modal é gravado apenas na **1ª ocorrência** (1ª data × 1º comprador) da criação; as demais (recorrência ou multi-comprador) ficam com `nota=null`. Justificativa: o Painel de Notas é um post-it ad-hoc por ocorrência — replicar a nota em N ocorrências polui o painel (caso real: 105 cards duplicados em mai/2026, limpos via SQL retroativo). Para adicionar nota a uma ocorrência específica, abrir o evento no calendário e editar. Não confundir com `observacao` (que continua replicando — é a descrição do evento).

## Painel de Notas (`#painel`)

Duas fontes de post-it coexistem, agrupadas por comprador:

1. **Nota-de-ocorrência** (`agenda_ocorrencias.nota`) — grudada num compromisso específico. Aparece no card com **título do fornecedor/evento + data + horário**. Some quando a ocorrência é tratada ou excluída. Criada/editada pelo modal de detalhe da Agenda de Compras (botão **💾 Salvar nota** salva sem precisar tratar — [script_main.js `saveAgendaNota`](frontend/script_main.js)) ou pelo modal de Novo Evento. Remoção: X no card → PATCH `nota=null` ([script_main.js `removeNota`](frontend/script_main.js)).
2. **Nota livre** (`notas_painel`, [schema_v17](backend/db/schema_v17_notas_painel.sql)) — post-it autônomo, sem vínculo com agenda. Aparece com **📌 Post-it + data**. Persiste até ser excluída. Criada pelo botão **+ Nova nota** no header do painel (prompt simples), vinculada ao comprador ativo no momento da criação (fallback: comprador logado). Editada inline clicando no texto do card (textarea aparece; salva no `blur`, descarta com `Esc`, confirma com `Ctrl+Enter`; texto vazio = deleta automaticamente). Funções `createNotaLivre`, `turnNotaLivreEditable`, `saveNotaLivreEdit`, `deleteNotaLivre` em [script_main.js](frontend/script_main.js).

Painel filtra pelo `activeBuyerId` (ambas as fontes). Renderização única em [`renderPainel`](frontend/script_main.js) — primeiro lista as notas-de-ocorrência do grupo, depois as livres. `state.notasLivres` carregado em `loadPortalData`.

⚠️ Não confundir com a **Nota do Fornecedor** (`fornecedores.notas_relacionamento`, schema_v4) — essa é permanente, 1 por fornecedor, editada na tela de Fornecedores via `supplierNotesModal`. Não tem nada a ver com Painel de Notas.

## Seção Compromissos (`id="compromissos"`)

- Menu **🗒️ Compromissos** na sidebar do portal cliente
- Lista compromissos genéricos (`agenda_ocorrencias` com `fornecedor_id IS NULL` e categoria ≠ "Agenda de Compras") do comprador ativo, ordenados por `data_prevista` + `hora_inicio`
- Header tem botão **+ Novo Evento** e toggle **"Mostrar concluídos"** (default off — só pendentes; on — pendentes + concluídos juntos, concluídos riscados visualmente)
- Colunas: Data, Título, Categoria (pill), Horário, Comprador, Ações
- **Ciclo PENDENTE ↔ REALIZADA** (desde mai/2026, sem migration — usa o `status` já existente):
  - PENDENTE → botões **"✓ Concluir"** (verde) + **Excluir**. Concluir faz PATCH `status=REALIZADA, data_realizacao=hoje` e move in-place do `state.agenda` para `state.auditOccurrences` (sem reload pesado). Funções `concluirCompromisso` em [script_render.js](frontend/script_render.js).
  - REALIZADA → botões **"↩ Desfazer"** + **Excluir**. Desfazer faz PATCH `status=PENDENTE, data_realizacao=null` e move de volta. Função `reabrirCompromisso`.
  - Exclusão funciona em qualquer status.
- **Calendário visual riscado**: `buildCalendarEvents` ([script_main.js](frontend/script_main.js)) inclui compromissos REALIZADAs genéricos com `classNames: ['fc-event-concluido']` (CSS: `opacity .55 + text-decoration line-through`) e prefixo "✓ " no título. Agenda de Compras (fornecedor) tem fluxo próprio (Tratar Agenda) e suas REALIZADAs **continuam fora do calendário** para não poluir.
- Para fornecedor (Agenda de Compras) o ciclo é outro: "Tratar Agenda" com modal de pedido. Não há botão Concluir no fornecedor.

## Seleção de comprador (`ensureBuyerSelection`)

- Chamada apenas em `bootstrap()` — não roda em re-renders
- Para `role='buyer'`: **sempre** define `activeBuyerId = loggedBuyerId` ao abrir o portal (não preserva trocas entre sessões)
- Para `role='admin_client'`: tenta localizar o comprador pelo e-mail do admin; fallback para `activeBuyerId` ou primeiro da lista
- Troca de comprador pelo select da sidebar: grava em `localStorage` → `renderTables()` + `refreshCalendar()`

## Configurações do Portal (`⚙️ Configurações`)

- Botão no menu lateral (não mais no topo)
- **Campos**: URL Supabase, chave publishable, tenant UUID, URL backend, dias do calendário, duração padrão compromissos/agenda, logomarca
- **Log de E-mails**: tabela de `relatorio_log` filtrada por período (7/30/90 dias); botão Atualizar
- `populateSettings()` / `saveSettings()` em `script_forms.js`; `loadEmailLog()` em `script_forms.js`

## Tela de Fornecedores

- **Exportar**: botão "📤 Exportar" — Excel via SheetJS com base completa
- **Busca**: filtro em tempo real por código ou nome (`renderSuppliers` com filtro)
- **Filtro por comprador (default desde v53 — 28/mai/2026)**: a tabela abre mostrando apenas fornecedores do `activeBuyerId`. Botão **"Mostrar todos"** ao lado do campo de busca alterna pra base completa; flag `suppliersShowAll` (módulo-level em [script_utils.js](frontend/script_utils.js)) é **em memória** — reseta a cada reload/sessão, intencional. Quando o select da sidebar troca o comprador ativo, `renderTables()` chama `renderSuppliers()` de novo e a tabela acompanha (a menos que o usuário tenha clicado "Mostrar todos"). Tratamento de `UNASSIGNED_BUYER_VALUE`: filtra suppliers sem `comprador_id`. Toggle bindado em [script_data.js](frontend/script_data.js) junto com o listener da busca.
- **Importação CSV**: `parseSuppliersCsv` pula linhas sem código/nome; progresso em tempo real; campo Comprador é opcional
- Upsert via PostgREST com `?on_conflict=codigo_fornecedor`
- **Preservação do comprador ao editar (v57 — 01/jun/2026)**: o formulário de fornecedor é uma **seção inline**, não um modal isolado. `renderBuyerSelect()` ([script_utils.js](frontend/script_utils.js)) reconstrói o `innerHTML` do select `fornecedorComprador` em todo `renderTables()` (ex.: troca de comprador ativo na sidebar). Antes da v57 isso **zerava a seleção em andamento** do form, gravando `comprador_id=null` ao salvar — o fornecedor saía da carteira, sumia da lista (filtrada por comprador) e o mesmo código batia na unicidade `(tenant_id, codigo_fornecedor)` → erro "já existe cadastrado". Caso real: mesclagem de fornecedor genérico+similar num cadastro único (jun/2026). **Duas defesas, não remover:** (1) `renderBuyerSelect` captura `fornecedorCompradorSelect.value` antes de repovoar e restaura se a opção ainda existir; (2) `saveSupplier` ([script_render.js](frontend/script_render.js)) exibe `confirm()` antes de gravar um fornecedor que **tinha** comprador ficando **sem nenhum** selecionado. **Importante:** a v57 previne o problema daqui pra frente, mas **não conserta registros já desvinculados** — esses precisam de reatribuição manual (Mostrar todos → editar → selecionar comprador) ou UPDATE no banco.

## Frequências de revisão (regras de negócio)

| Valor | Dias compra | Intervalo entre pedidos | Mínimo de `parametro_estoque` |
|---|---|---|---|
| 1 | 1 dia | 28 dias (mensal) | 28 dias |
| 2 | 1 dia | 14 dias (quinzenal) | 14 dias |
| 4 | 1 dia | 7 dias (semanal) | 7 dias |
| 8 | 2 dias | próximo dia permitido (2×/semana) | 4 dias |
| 12 | 3 dias | próximo dia permitido (3×/semana) | 3 dias |

- `DIAS_POR_FREQUENCIA` (dias de compra obrigatórios) e `INTERVALO_DIAS_FREQUENCIA` (intervalo fixo entre pedidos — só 1/2/4) em [script_state.js](frontend/script_state.js) e [backend/app/services/agenda_service.py](backend/app/services/agenda_service.py).
- `PARAMETRO_MINIMO_FREQUENCIA = { 1: 28, 2: 14, 4: 7, 8: 4, 12: 3 }` em [script_state.js](frontend/script_state.js) — usado na validação ao salvar fornecedor ([script_render.js `saveSupplier`](frontend/script_render.js)) e no auto-ajuste do import CSV ([script_forms.js](frontend/script_forms.js)).
- Hint dinâmico abaixo do input "Parâmetro Estoque" mostra o mínimo atual e fica vermelho quando o valor digitado é inferior — `updateParametroEstoqueHint()` em [script_forms.js](frontend/script_forms.js), disparada por listeners em `fornecedorFrequencia` (change) e `fornecedorParametroEstoque` (input).
- Lógica de tratamento de agenda duplicada em `backend/app/services/agenda_service.py` e `frontend/script_render.js` (`tratarAgendaAtual`) — manter sincronizados.

## Incremento de parâmetro ao tratar agenda

`incrementoTotal = Math.max(0, incrementoTratamentoBase) + incrementoAjuste`

| Variável | Cálculo | Regra |
|---|---|---|
| `incrementoTratamentoBase` | `diffDays(data_prevista, hoje)` = `data_prevista − hoje` | Positivo = antecipado (conta); Negativo = atrasado (**não conta**) |
| `incrementoAjuste` | `diffDays(dataEscolhida, dataSugerida)` | Sempre conta — positivo = postergou próxima data; negativo = antecipou |
| `incrementoTotal` | `Math.max(0, base) + ajuste` | Aplicado ao `parametro_compra` e registrado no `observacao` da ocorrência |

- **Atraso no tratamento não infla o parâmetro** — só o ajuste explícito da próxima data conta.
- **Antecipação do tratamento conta**: agenda para amanhã tratada hoje → `base = +1` → parâmetro sobe 1 dia.
- Lógica implementada em `script_render.js` (`openAgendaDetail`, `updateAgendaAdjustment`, `tratarAgendaAtual`).

## Feriados

- Importação de feriados nacionais via BrasilAPI com timeout de 10s
- Aparecem no calendário: fundo amarelo + chip laranja com nome
- Alerta ao criar evento ou tratar agenda em feriado (não bloqueia)
- `isFeriado(dateIso)` e `getFeriado(dateIso)` em `script_main.js`
- Considerados no cálculo do próximo dia útil em `relatorio_service.py`

## Horário do fornecedor

- `fornecedores.hora_inicio` / `hora_fim` — horário padrão de visita/pedido
- Propagados ao criar/sincronizar ocorrências pendentes
- Alerta de conflito de horário ao tratar agenda
- `checkEventConflict()` em `script_main.js` verifica via Supabase REST (exclui o próprio evento ao editar)

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
- `loggedBuyerId`, `activeBuyerId` e `loggedPortalEmail` recebem `setItem("", "")` em sessionStorage (nunca `removeItem`) — evita fallthrough do `_store()` para localStorage com dados de sessão anterior
- Feedback mostra nome do cliente: `"Gerando acesso ao portal de 'Grupo X'..."`
- JWT do "Abrir Portal" cacheado 55 min em memória no backend (`_portal_jwt_cache`)
- **Limpeza forçada de sessão**: acessar `/?limpar=1` limpa todo o localStorage/sessionStorage e redireciona para login (útil quando usuário herdou sessão errada de outro tenant)
- **Overlay de carregamento**: `index.html` exibe tela preta "Carregando..." até `loadPortalData()` completar — impede flash de dados de sessão anterior; removido em `try/finally` no `bootstrap()` para nunca travar

## Service Worker e PWA

- Cache cliente: `agenda-compras-v62` — bumpar ao alterar JS/CSS do `frontend/` (Hard refresh não bypassa o SW no Chrome **nem no Safari**)
- Cache admin: `agenda-admin-v14` — bumpar ao alterar JS/CSS do `frontend_admin/`
- **Estratégia NETWORK-FIRST (desde v62 / jun/2026)**: o handler `fetch` tenta a rede primeiro e só cai no cache offline. Substituiu o `cache-first` antigo, que causava um estado "Frankenstein" — mistura de arquivos de versões diferentes presos no cache (ex.: `index.html` novo + `script_state.js` velho → menu aparece mas dados/Versões quebram). Não voltar para cache-first.
- **Instalação RESILIENTE (desde v62)**: `install` faz `addAll` só dos assets **locais** (mesmo domínio, sempre 200) e os assets de **CDN externa** (fontes, FullCalendar) via `Promise.allSettled` best-effort. Motivo: com `cache.addAll([...CDN])` num passo único, se uma CDN falhasse (comum no **Safari**), o `addAll` rejeitava, a versão nova **nunca instalava/ativava** e o usuário ficava preso na antiga — causa real de "atualização não chega" (jun/2026, validação da Eficiência). **Nunca** colocar URL de CDN externa no `addAll` obrigatório.
- **Recuperação de cache preso**: `/?limpar=1` agora faz **reset nuclear** — além de limpar storage, **desregistra todos os Service Workers e apaga todos os caches** (`navigator.serviceWorker.getRegistrations()` + `caches.keys()`), depois recarrega. É o procedimento oficial quando um usuário fica preso numa versão antiga.
- SW registrado em `index.html` e `instalar.html` com `navigator.serviceWorker.register('/sw.js')`
- ASSETS do SW: os 6 `script_*.js`, `index.html`, `instalar.html`, `styles.css`, `manifest.json`, `icon-*.png`, fontes, FullCalendar
- Modal "Instale o app": detecta browser via `userAgent` e mostra instruções específicas (Edge / Chrome / iOS)
- `showPwaInstallModal()` exposta globalmente — chamada pelo botão "📲 Reinstalar Atalho" na sidebar
- **Nunca usar `client.navigate()` no activate do SW**: causa perda de sessão no fluxo "Abrir Portal" — o JWT é gravado em sessionStorage durante o bootstrap, e um reload forçado pelo SW pode interromper esse processo antes da gravação completar. Usar apenas `skipWaiting` + `clients.claim`.
- **Bug corrigido (mai/2026)**: `response.clone()` no handler `fetch` do SW deve ser chamado **de forma síncrona** antes de qualquer `.then()` assíncrono — chamar após `caches.open()` causa "Response body is already used" e pode servir assets corrompidos
- `beforeinstallprompt` capturado em `script_main.js`: abre modal automaticamente se `agenda_pwa_installed` não estiver no localStorage

## Fluxo de convite de comprador

1. Portal cliente → botão "Convite" → `POST /api/v1/portal/compradores/{id}/enviar-convite` com JWT
2. Backend gera link Supabase Auth (`type=recovery` ou `type=invite`) com `redirect_to = {FRONTEND_URL}/instalar.html`; grava `user_id` + `app_metadata` no comprador
3. E-mail enviado com dois CTAs: **"Criar minha senha"** (link 24h) + **"Baixar instalador do atalho"** (bat Windows)
4. Comprador clica no link → `instalar.html` → define senha → **limpa todo o localStorage de sessão anterior** (evita contaminação de outro tenant) → JWT + `refresh_token` + role `buyer` + `loggedBuyerId` + `activeBuyerId` salvos em localStorage → redirect automático para o portal
5. No portal, o comprador já aparece selecionado como ativo

**Convites são registrados em `relatorio_log`** com `tipo='convite'` — visíveis no Log de E-mails do painel admin. Para verificar se um convite foi processado: checar `compradores.user_id` (preenchido na hora do envio). Se o e-mail não chegou mas `user_id` está preenchido e o log mostra `enviado`, o problema é entrega (reputação do servidor SMTP / filtro Gmail).

## Instalador Windows (`frontend/instalar_atalho.bat`)

- Arquivo `.bat` autossuficiente (não baixa nada, sem cold start)
- Detecta Edge ou Chrome em `%ProgramFiles%`, `%ProgramFiles(x86)%` e `%LocalAppData%`
- Cria `Agenda de Compras.lnk` em `%USERPROFILE%\Desktop` (funciona em qualquer idioma do Windows)
- Abre com `--app=https://agenda-compras-cliente.vercel.app --no-first-run` (modo app sem barra do browser)
- URL aponta diretamente para o frontend — sem passar pelo backend (evita cold start de 30-60s)
- `instalar_atalho.ps1`: versão estendida com download de ícone e mensagens coloridas
- O e-mail de convite inclui botão verde **"Baixar instalador do atalho"** em ambos os endpoints de convite

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
| `schema_v10_gestor_notificacoes.sql` | Colunas `is_gestor`, `receber_auditoria`, `receber_agenda_proximo` em compradores; tabela `relatorio_log` |
| `schema_v11_relatorio_flag.sql` | Campo `envio_relatorio_ativo` em tenants |
| `schema_v12_audit_log.sql` | Tabela `audit_log` para eventos de fornecedor e comprador; RLS com `app.user_belongs_to_tenant` |
| `schema_v13_relatorio_log_convite.sql` | Adiciona `'convite'` ao CHECK constraint do campo `tipo` em `relatorio_log` |
| `schema_v14_admin_report_subscriptions.sql` | Tabela `admin_report_subscriptions(admin_email, tenant_id)` para inscrições de relatório por admin; adiciona `'admin_copia'` ao CHECK constraint de `relatorio_log.tipo` |
| `schema_v15_tratamento_pedido.sql` | Colunas `pedido_realizado` (bool), `pedido_quantidade` (int), `pedido_valor` (numeric), `pedido_motivo_nao` (CHECK), `pedido_motivo_detalhe` (text) em `agenda_ocorrencias`; CHECK de coerência (se Sim → qtd+valor obrigatórios; se Não → motivo obrigatório); índice por `(tenant_id, pedido_realizado)` |
| `schema_v16_serie_recorrencia.sql` | Coluna `serie_id` (UUID nullable) em `agenda_ocorrencias` para agrupar ocorrências criadas no mesmo "Novo Evento"; índice parcial `(tenant_id, serie_id) WHERE serie_id IS NOT NULL`. Usado pelo radio de escopo "Esta / Esta e as próximas / Toda a série" no modal de edição |
| `schema_v17_notas_painel.sql` | Tabela `notas_painel(id, tenant_id, comprador_id, texto, created_at, updated_at)` para post-its livres no Painel de Notas, desvinculados de `agenda_ocorrencias`. RLS `USING (true)` + GRANT pra `authenticated/anon/service_role`. Coexiste com a nota de ocorrência (cada uma com fluxo próprio) |

## DATABASE_URL — Conexão com Supabase (⚠️ crítico)

O Vercel (região gru1/São Paulo) **não suporta IPv6**, mas o host direto do Supabase (`db.fnwsorhflueunqzkwsxu.supabase.co:5432`) resolve apenas IPv6. Usar sempre o **Connection Pooler** (IPv4):

```
postgresql+psycopg://postgres.fnwsorhflueunqzkwsxu:[SENHA]@aws-0-us-west-2.pooler.supabase.com:6543/postgres?prepare_threshold=0
```

- Host pooler: `aws-0-us-west-2.pooler.supabase.com` (região us-west-2)
- Porta: `6543` (transaction pooler)
- Username: `postgres.fnwsorhflueunqzkwsxu` (formato Supavisor: `postgres.{project_ref}`)
- `prepare_threshold=0` em vez de `pgbouncer=true` — correto para psycopg3 (dialect `postgresql+psycopg`)
- Após trocar: salvar no Vercel → Settings → Environment Variables → Redeploy

## Tenant de Teste — Service Farma

- `tenant_id`: `c2f65634-b7e0-47f0-8937-94446540701a`
- Dados inseridos por `backend/db/test_data_service_farma.sql` (mai/2026)
- 2 compradores: André Vanni (gestor, `andre@servicefarma.far.br`) e Maria Costa
- 8 fornecedores: EMS, Eurofarma, Hypera, Takeda, Roche, Mantecorp, Pfizer, Cimed
- `envio_relatorio_ativo = true`
- Cron manual: `POST /api/v1/cron/relatorio-diario?tenant_id=c2f65634-b7e0-47f0-8937-94446540701a&data_ref=2026-04-30` com `X-Cron-Secret: agenda-cron-2026-sfx`

## Pendências

### Entregue em 06/jun/2026 (commits `c63d23f`, `e3abaa1`)

- **Botão "Trocar/Adicionar logo" em cliente já cadastrado** (commit `c63d23f`, SW admin v13→v14): faltava o controle — a logo só podia ser definida no cadastro inicial. Cada card de cliente no painel admin (Base Operacional → Clientes) ganhou botão ao lado de "Senha da auditoria"; `trocarLogo()` em [frontend_admin/script.js](frontend_admin/script.js) reaproveita `uploadLogo()` e grava `logo_url` por PATCH em `clientes.observacoes`. **Não conserta logos de clientes pré-existentes** — só dá a ferramenta pra trocar daqui pra frente.

- **Rate limit do Resend no cron diário** (commit `e3abaa1`): o Log de E-mails acusava várias falhas com `Too many requests. You can only make 5 requests per second` (38 ocorrências, 25 nos últimos 7 dias, sempre às 00:00 UTC = horário do cron). **Causa:** a paralelização com `ThreadPoolExecutor(5)` (commit `23ba1c6`, feita pra resolver o timeout do Total Socorro) destravou o teto de **5 req/s da conta Resend** — os workers disparavam em rajada, o Resend devolvia 429, e como não havia retry o e-mail simplesmente não era entregue. **Fix (B+C) em [email_service.py](backend/app/services/email_service.py) `_send_via_resend`:** (B) throttle thread-safe (`_resend_throttle`) espaça o início de cada disparo em ≥0,25s → ≤4/s mantendo o paralelismo; (C) retry com backoff exponencial (0,5/1/2s, até 4 tentativas) só quando `_is_rate_limit_error` detecta 429 — erros reais (ex.: `550` caixa inexistente) propagam normais. Protege cron **e** convites (qualquer envio Resend). Custo: ~0,25s/e-mail (~12,5s para 50 e-mails, dentro do `maxDuration`). Validado em teste local: 12 disparos com pico de 4/s. **A outra falha do log (3× `maria.teste@…` 550, mai/2026) era só endereço de teste inexistente — não é bug.**

### Entregue em 27/mai/2026 (segunda leva — commits `a4a8c6e`, `ceb4687`, `4a09e62`, `d68478f`, `23ba1c6`, `67dfcfe`, `190fe05`, `e2732cd`, `e805100`, `86b0aca`)

Resolução do incidente Total Socorro + 4 sugestões do cliente:

- **Cron diário cortado pelo timeout (Total Socorro sem relatório)** — investigação revelou que o cron rodava com `maxDuration` default de 60s do Vercel e a ordem dos tenants no `SELECT` era indefinida (sem `ORDER BY`). Em 27/mai, drogaria_sv + velanes consumiram ~53s e total_socorro caiu fora silenciosamente. Disparo manual cobriu o dia (`POST /cron/relatorio-diario?tenant_id=…&data_ref=2026-05-26`, 2 emails). Duas tentativas de subir `maxDuration` migrando `vercel.json` para o formato `functions` quebraram o build (mensagem "pattern doesn't match any Serverless Functions" — formato exige Framework Preset Python no dashboard, não "Other"). Solução adotada: **paralelizar o envio no código** com `ThreadPoolExecutor(max_workers=5)` em [relatorio_service.py](backend/app/services/relatorio_service.py). 3 fases: (1) montar payloads em série — DB session não é thread-safe; (2) `send_html` em paralelo; (3) `_log_envio` em série. Throughput ~5x. 14 emails atuais caem de ~50s para ~14s; teto novo ~150 emails em ~30s ainda cabe nos 60s default. `ORDER BY nome` mantido para ordem determinística. (commit `23ba1c6`) ⚠️ **Efeito colateral descoberto em 06/jun/2026**: essa paralelização estourava o teto de 5 req/s da conta Resend (429 sem retry). Corrigido com throttle ≤4/s + retry/backoff em `email_service.py` — ver "Entregue em 06/jun/2026" acima.

- **#1 Editar/excluir série de recorrência em massa** (commit `67dfcfe`, [schema_v16](backend/db/schema_v16_serie_recorrencia.sql)): coluna `serie_id` UUID em `agenda_ocorrencias` agrupa ocorrências criadas no mesmo "Novo Evento" com recorrência/multi-comprador. Modal de edição ganha radio **"Aplicar mudanças a"** com 3 escopos (Só esta / Esta e as próximas / Toda a série) com contagens — só aparece se a ocorrência tem `serie_id` (legado continua só com "Só esta"). PATCH/DELETE em massa via filtros Supabase REST. Edição em massa não replica `data_prevista` (cada uma tem a sua), `nota` (post-it ad-hoc) nem `comprador_id` (intencional). Exclusão pede confirmação com contagem.

- **#2 Botão Concluir compromissos + visual riscado + histórico** (commit `86b0aca`, sem migration): seção Compromissos ganha toggle **"Mostrar concluídos"** (default off) e botões **✓ Concluir** (PATCH `status=REALIZADA`)  / **↩ Desfazer** (PATCH `status=PENDENTE`). Compromissos REALIZADAs genéricos aparecem no calendário com classe CSS `.fc-event-concluido` (opacity .55 + line-through) e prefixo ✓ no título. Carga ajustada em [script_data.js](frontend/script_data.js) — SELECT de REALIZADAs passou a incluir `titulo/hora/categoria/serie_id`. Escopo restrito a compromissos genéricos (sem fornecedor); Agenda de Compras mantém fluxo próprio (Tratar Agenda).

- **#3 Calendário não atualizava após tratar agenda** (commit `e2732cd`, fix 1 linha): `tratarAgendaAtual` chamava `loadPortalData({silent:true})` mas esqueceu de chamar `refreshCalendar()` depois — `loadPortalData` faz `renderTables` mas não atualiza FullCalendar. Resultado: usuário precisava fechar/reabrir a tela pra ver a próxima ocorrência. Fix em [script_render.js:670](frontend/script_render.js#L670) com comentário pra evitar regressão.

- **#4 Salvar nota sem tratar agenda + Post-it livre no Painel** (commits `190fe05` e `e805100`, [schema_v17](backend/db/schema_v17_notas_painel.sql)):
  - Botão **💾 Salvar nota** no modal de detalhe da Agenda de Compras — PATCH só do campo `nota`, sem mexer em status. Funciona em PENDENTE e REALIZADA (corrigir nota de algo já tratado também). Atualização local de `state.agenda`/`state.auditOccurrences` + `renderPainel()` sem reload pesado. SELECT de REALIZADAs ganhou `nota` (era omitido — nota perdida ao recarregar). Funciona inclusive corrigindo a nota de uma agenda já tratada.
  - Botão **+ Nova nota** no header do Painel cria post-its livres na tabela `notas_painel` (id, tenant_id, comprador_id, texto, timestamps). Edição inline ao clicar no card (textarea aparece; `blur`/`Ctrl+Enter` salvam, `Esc` descarta, texto vazio deleta). Coexiste com nota-de-ocorrência no mesmo painel (📌 vs título-do-fornecedor+data).

- **Ajuda do portal atualizada**: itens "Painel de Notas", "Compromissos" e "Calendário" reescritos cobrindo as novas funcionalidades. SW v47 → v49 ao longo da sessão.

### Entregue em 27/mai/2026 (commits `691c1a9`, `ed11db2`)

- **Vazamento de tenant no bootstrap fechado** (commit `691c1a9`): código antigo carregava Service Farma ao fundo da tela de login porque (a) `defaultSettings.tenantId` estava hardcoded em Service Farma e (b) `loadCategorias` + `loadPortalData` rodavam ANTES de checar JWT, então qualquer `tenant_id` residual em localStorage carregava dados operacionais (agenda, fornecedores, categorias) na renderização. Mudanças: `tenantId: ""` em `defaultSettings`; gate de bootstrap (`if (hasJwt && hasTenant) load all else loadClientMetaOnly + login`) — nova função `loadClientMetaOnly()` carrega só `tenants`+`clientes` sem operacionais, preserva UX de admin_client em primeiro acesso; `loginBuyer` passa a chamar `loadCategorias` após auth (evita resíduo de `state.categorias` do tenant anterior); SW v41→v42. Validado em produção em aba anônima: modal de login limpo, sem fundo de SF. Trade-off conhecido: admin_client de tenant **novo** (sem `admin_password` definido em `clientes.observacoes`) em primeiro acesso direto pelo portal não detecta automaticamente — workaround: usar "Abrir Portal" do painel admin ou setar via SQL.

- **Senha do Caio Destro Andrade (Drogaria SV) — 27/mai/2026**: padrão Raquel idênctico, resolvido com a mesma receita SQL.

- **Parâmetro mínimo de estoque por frequência com aviso proativo** (commit `ed11db2`): regra antiga validava `parametro_estoque < frequencia` (compara estoque-em-dias com código de frequência — escalas diferentes, resultado contraintuitivo: exigia 1 dia para mensal e 12 dias para 3×/semana). Substituída pela nova constante `PARAMETRO_MINIMO_FREQUENCIA = { 1: 28, 2: 14, 4: 7, 8: 4, 12: 3 }` (mínimo = intervalo real entre pedidos). Hint dinâmico abaixo do input "Parâmetro Estoque" mostra o mínimo da frequência atual; vermelho quando valor digitado é inferior. Validação ao salvar com mensagem específica. Auto-ajuste do import CSV também respeita a nova regra. SW v42→v43.

### Entregue em 26/mai/2026 (commits `a678580`, `010869c`, `5dd3f9b`, `130154c`)

- **Modal Novo Evento — tema claro**: grid de compradores ficava invisível por causa de variáveis CSS inexistentes (`--input-bg`, `--border-color`, `--text-muted`). Substituídas por `--panel-soft`/`--line`/`--text`/`--muted`. (Commit `a678580`)
- **Nota como post-it**: `saveNewEvent` em `script_main.js` agora grava `nota` apenas na 1ª ocorrência (1ª data × 1º comprador) — antes replicava em todas as recorrências/multi-comprador, poluindo o Painel de Notas. SQL retroativo limpou 105 ocorrências afetadas (2 grupos: "Pedido geral de perfumaria" e "Pedido sugestão Gen"). (Commit `a678580`)
- **Log de auditoria de buyer**: criado endpoint `POST /api/v1/portal/audit-log` no backend; `logAuditEvent` no frontend passa por ele em vez de POST direto ao Supabase. Antes, RLS da `audit_log` (que checa `tenant_users`) bloqueava silenciosamente todos os logs de buyers — ninguém percebia porque `catch {}` engolia. Afetava todos os tenants, não só o caso da Livia que motivou a investigação. (Commit `010869c`)
- **Dashboard de Auditoria — 3 gráficos novos**: linha temporal (tendência diária), heatmap dia da semana (4 métricas × 7 dias com intensidade), Top 5 fornecedores (postergadas/aumentos/reduções). (Commit `5dd3f9b`)
- **"Inteligência artificial" → "💡 Recomendações inteligentes"**: nome era enganoso (é heurística determinística, não IA). Heurísticas expandidas de 6 para 10 padrões. (Commit `5dd3f9b`)
- **📦 "Deu pedido?" obrigatório no tratamento de agenda**: novo bloco no modal de "Tratar Agenda" que captura se houve pedido (Sim → quantidade + valor R$ com máscara automática; Não → motivo entre 4 opções + detalhe opcional). Validação client-side bloqueia o tratamento sem resposta. Dados gravados em colunas reais (`schema_v15_tratamento_pedido.sql` — migration rodada em 26/mai/2026). Auditoria ganha coluna "Pedido" + 2 KPIs novos (Taxa de pedido / Valor total). Exportação Excel ganha 5 colunas. PDF e email do relatório diário ganham 3ª linha de KPIs. Ajuda do portal cliente atualizada. Disparo de teste para `andre@servicefarma.far.br` (tenant SV) em 26/mai/2026 retornou `sent:1, errors:0`. (Commit `130154c`)
- **📦 Refatoração: "Deu pedido?" vira modal dedicado** (26/mai/2026, ainda no mesmo dia): a primeira versão era bloco inline no modal de detalhe, mas gerava confusão visual (4 pares "Sim/Não" no mesmo modal — pedido + justificativa). Movido para `pedidoModal` separado que abre ao clicar "Tratar Agenda". Botões muito maiores (verde/vermelho), título grande "📦 Deu pedido?", rodapé com "Voltar" e "✓ Confirmar e Tratar Agenda". Também adicionado botão "✕ Fechar" grande no rodapé do `agendaDetailModal` (além do X do canto). (Commit `7d9b4c0`)

### Próxima sessão (prioridade máxima)

1. **Validar o fluxo "Deu pedido?" em produção** — após `andre@servicefarma.far.br` tratar agendas reais com o novo bloco, conferir: (a) PATCH grava as 5 colunas novas corretamente, (b) coluna "Pedido" aparece na Auditoria por comprador com ✅/❌, (c) KPIs "Taxa de pedido" e "Valor total" no summary atualizam, (d) PDF do relatório diário mostra a 3ª linha de KPIs com valores reais (não mais zerados). Disparo de validação: `POST /api/v1/cron/relatorio-diario?tenant_id=f0d557c6-9dd9-4e80-96e0-2094da4a40ff&admin_only=true` com `X-Cron-Secret: agenda-cron-2026-sfx`.

2. **Justificativa de tratamento não aparece na coluna "Detalhe" da Auditoria por comprador**: usuário relatou em 26/mai/2026 que ao tratar agenda preenchendo a justificativa via botão "Sim" no modal, ela não é renderizada no detalhe da Auditoria. Código de render existe e parece correto ([script_forms.js:919-922](frontend/script_forms.js#L919-L922)) — lê `entry.meta?.justificativa`, classe `.audit-justificativa` existe. Diagnóstico precisa SQL: `SELECT id, observacao::jsonb -> 'justificativa' FROM agenda_ocorrencias WHERE status='REALIZADA' AND observacao::jsonb ? 'justificativa' ORDER BY data_realizacao DESC LIMIT 5;`. Se vazio → bug de gravação. Se preenchido → bug de render/parsing.

3. **Implementar fluxo de staging de verdade** — branch `staging` está 23+ commits atrás de `main` desde 26/mai/2026 (SW v17 vs v38; falta vários fixes de SW, backfill, login, audit log, novo fluxo de pedido, etc.). Toda alteração ainda vai direto para `main` por hábito. Sincronizar staging via `git merge main` num momento controlado, depois decidir: (a) criar projeto Supabase separado para staging, OU (b) reservar tenant exclusivo de teste com variáveis de ambiente apontando para ele; padronizar `staging` como destino obrigatório antes de `main`.

4. **~~Corrigir `defaultSettings.tenantId` hardcoded como Service Farma~~** — ✅ **RESOLVIDO em 27/mai/2026** (commit `691c1a9`). Além do troca direta para `""`, foi implementado gate de bootstrap que impede `loadPortalData` sem JWT — `loadClientMetaOnly` carrega só `tenants`+`clientes` para preservar UX de admin_client em primeiro acesso. Validado em produção em aba anônima.

5. **Investigar falha silenciosa do `instalar.html` / `POST /auth/definir-senha` — ⚠️ URGENTE (3º caso em 9 dias)** — casos Raquel (26/mai), Caio (26-27/mai) e provavelmente Elias (mai/2026) revelaram que o fluxo permite o usuário "concluir" o convite sem efetivamente gravar a senha em `auth.users.encrypted_password`. Padrão observado: `auth.users` criado no envio do convite com `encrypted_password=NULL`, `email_confirmed_at=NULL`, `last_sign_in_at=NULL`. Hipóteses: (a) `sb.auth.admin.update_user_by_id` lançando exceção silenciada, (b) erro de rede interpretado como sucesso, (c) Supabase Auth retornando 200 sem persistir, (d) usuário fechando aba antes do POST completar. Adicionar logging server-side com `print(traceback)` + verificação pós-update (re-fetch do user para confirmar `encrypted_password` foi gravado) + validação client-side antes de redirecionar. Workaround atual: receita SQL direta (ver Caso Raquel/Caio).

6. **`saveSupplier` — feedback inconsistente em falha parcial**: relato pontual em 26/mai/2026 (cadastro do fornecedor "MAM") de "erro mas fornecedor apareceu cadastrado". Não reproduzível depois. Refator defensivo arquivado: isolar passos secundários (`fornecedor_dias_compra`, `persistSupplierNote`, `ensurePendingOccurrenceForSupplier`) em try/catch internos que não propagam — mostrar warnings em vez de erro genérico, e chamar `loadPortalData()` sempre. Implementar quando o erro voltar a aparecer com mensagem capturada.

7. **Adaptação do time ao "Deu pedido?" obrigatório**: como o bloco é obrigatório, compradores que tentarem tratar agenda sem responder vão ver erro vermelho. Avisar o time antes do uso massivo OU, se gerar atrito, considerar deixar o `pedido_realizado` opcional no primeiro momento (basta remover a validação client-side e o CHECK SQL de coerência; mantém as colunas para captura voluntária).

### Outras pendências (sem urgência)

- `SUPABASE_SERVICE_ROLE_KEY` no Vercel foi sinalizado como potencialmente exposto em abr/2026 — rotacionar quando possível (impacta envio de convites + agora o endpoint `/portal/audit-log`): Supabase → Settings → API → Reset `service_role` key → atualizar no Vercel.
- Logo do cliente no PDF: atualmente só aparece a logo Service Farma no rodapé. Para incluir a logo do cliente, é necessário adicionar campo `logo_url` na tabela `tenants` e armazenar URL pública (Supabase Storage).
- Ativar relatório para clientes reais (Grupo São Valentim e Grupo Velanes): apenas configuração operacional — toggle no Admin + checkboxes de notificação nos compradores.
- **Relatório semanal aos domingos**: avaliar envio de um e-mail extra todo domingo com auditoria consolidada da semana anterior (seg–sex). Destinatários: gestores e admins inscritos. Requer nova query agregada no `relatorio_service.py`, nova seção no HTML/PDF e novo tipo no `relatorio_log`. Não urgente.
- **Análise de IA real (Claude API) na Auditoria**: hoje é heurística. Considerar botão "🤖 Analisar com IA" (sob demanda, cacheado por dia/tenant) que chama Claude API para gerar insights em linguagem natural a partir dos `audit_log` e `agenda_ocorrencias` do período. Decidir pricing/limites antes (~$0.01-0.05 por chamada). Decisão adiada em 26/mai/2026.

## Caso Elias (Drogaria SV) — mai/2026

**Histórico:**
1. Elias cadastrado com `elias@servicefarma.far.br` — convite não chegava
2. E-mail alterado para `eliasmoreiraalves.jr@gmail.com`; convite enviado e recebido
3. Elias definiu senha pelo `instalar.html`, mas portal abriu mostrando Service Farma em vez da Drogaria SV
4. Causa raiz: provavelmente `defaultSettings.tenantId` hardcoded na Service Farma + falha silenciosa no `definir-senha`
5. **Segundo convite enviado em 11/mai/2026** (Elias esqueceu a senha) — fluxo `instalar.html` limpa localStorage automaticamente e deve gravar o tenant correto

**Dados confirmados no banco:**

| Campo | Valor |
|---|---|
| `compradores.id` | `67e2920e-2cf6-4e81-9304-92c82abb2ed3` |
| `compradores.email` | `eliasmoreiraalves.jr@gmail.com` |
| `compradores.user_id` | `a5de2a85-248a-4cbf-a64c-6db3eb4f69a1` |
| `compradores.tenant_id` | `f0d557c6-9dd9-4e80-96e0-2094da4a40ff` (Drogaria SV ✓) |

**Se o problema persistir após o novo convite:**
1. Acessar `https://agenda-compras-cliente.vercel.app/?limpar=1`
2. Fazer login com `eliasmoreiraalves.jr@gmail.com` + senha nova
3. Se ainda mostrar Service Farma: DevTools → Application → Local Storage → verificar `agenda_cliente_tenant_id` logo após o login

## Caso Raquel (Drogaria SV — diretora) — 26/mai/2026

**Histórico:**
1. Raquel cadastrada como gestora (`is_gestor=true`) com `radesquel@gmail.com` — convite enviado em 21/mai
2. Dois convites disparados pelo sistema (`relatorio_log.status=enviado` em ambos), nenhum erro de entrega
3. Login falhava sempre com "Acesso não localizado para este cliente" — diretora a 1 semana sem acesso, risco de perda do cliente
4. **Causa raiz**: `auth.users.encrypted_password` vazio (`email_confirmed_at = NULL`, `last_sign_in_at = NULL`) — ela nunca completou `instalar.html`, OU completou mas a definição de senha falhou silenciosamente. O fluxo de convite gera o `auth.users` no momento do envio, mas a senha só é gravada quando o usuário conclui o `instalar.html`. Combinado com o bug do `catch {}` silencioso, ela via mensagem genérica em vez de "E-mail ou senha incorretos"
5. **Resolução em 26/mai/2026**: senha gravada diretamente em `auth.users.encrypted_password` via `crypt(senha, gen_salt('bf', 10))` + `email_confirmed_at = now()` usando conexão pooler (acesso superuser do `postgres.fnwsorhflueunqzkwsxu`). Senha provisória `Raquel2026` — orientada a trocar pelo portal

**Dados confirmados no banco:**

| Campo | Valor |
|---|---|
| `compradores.id` | `7041571b-0369-4f27-ad7e-d88458c58905` |
| `compradores.email` | `radesquel@gmail.com` |
| `compradores.user_id` | `c4ca6535-61d2-4f0f-b3bb-fee1e2b88091` ✓ vinculado |
| `compradores.tenant_id` | `f0d557c6-9dd9-4e80-96e0-2094da4a40ff` (Drogaria SV ✓) |
| `compradores.is_gestor` | `true` |

**Receita de definição de senha direta (quando convite não completa):**

```python
# Conectar via DATABASE_URL do .env (pooler Supabase com usuário postgres)
UPDATE auth.users
SET encrypted_password = crypt('{NOVA_SENHA}', gen_salt('bf', 10)),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id = '{USER_ID}';
```

Equivalente à chamada `sb.auth.admin.update_user_by_id(user_id, {"password": senha, "email_confirm": True})` mas sem precisar de `SUPABASE_SERVICE_ROLE_KEY` — usa apenas o `DATABASE_URL`. `gen_salt('bf', 10)` casa com o cost factor padrão do Supabase Auth.

## Caso Caio (Drogaria SV) — 27/mai/2026

**Histórico:** padrão idêntico ao da Raquel — convite gerado em 26/mai/2026, `auth.users` criado com `encrypted_password` vazio (`email_confirmed_at = NULL`, `last_sign_in_at = NULL`), Caio não conseguiu logar. Resolvido em 27/mai/2026 com a mesma receita SQL (senha provisória `Caio2026`).

**Dados confirmados:**

| Campo | Valor |
|---|---|
| `compradores.id` | `6a8dd378-7922-4484-bd55-8c9e3160cba0` |
| `compradores.email` | `caiodestroandrade@gmail.com` |
| `compradores.user_id` | `73444dab-12f1-4e5c-ab41-71e91d3b244b` ✓ vinculado |
| `compradores.tenant_id` | `f0d557c6-9dd9-4e80-96e0-2094da4a40ff` (Drogaria SV ✓) |

**Observação:** 2º caso idêntico em 2 dias (Raquel 26/mai, Caio 27/mai) reforça a urgência da pendência "investigar falha silenciosa do `instalar.html` / `POST /auth/definir-senha`". O `auth.users` é criado no momento do envio do convite, mas a senha só é gravada quando o usuário completa o `instalar.html` com sucesso. Algum erro silencioso entre essas duas etapas está deixando users com `encrypted_password` vazio sem o usuário perceber.
