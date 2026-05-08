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

## Regras de desenvolvimento (obrigatórias)

- **Nunca alterar código de risco sem autorização explícita do usuário** — descrever o que será feito e aguardar confirmação antes de executar. Isso inclui: fluxo de autenticação, isolamento de tenant, sessionStorage/localStorage, qualquer arquivo que afete dados de clientes reais.
- **Sempre bumpar o Service Worker** (`frontend/sw.js` — `agenda-compras-vN`) junto com qualquer commit que altere JS ou CSS do frontend. Sem bump, o browser serve cache antigo e as correções não chegam aos usuários.
- **Ambiente de staging é prioridade máxima** — toda feature ou correção deve ser testada em staging antes de ir para produção (`main`). Ainda a implementar.

## Estrutura do frontend cliente (`frontend/`)

Arquivos JS carregados em ordem no `index.html` — escopo global compartilhado (não são ES modules):

| Arquivo | Conteúdo |
|---|---|
| `script_state.js` | Estado global, constantes, mocks, refs DOM, `storageKeys`, `defaultSettings` |
| `script_utils.js` | `fetchSupabase()`, `fetchApi()`, `refreshJWT()`, `_store()`, utilitários de data/cálculo, `renderBuyers()`, `editBuyer()` |
| `script_render.js` | Render tabelas, fornecedores, compradores, `saveBuyer()`, `renderCompromissos()`, `deleteCompromisso()` |
| `script_forms.js` | Formulários (saveSupplier), importação CSV/Excel, exportação, `ensureBuyerSelection()`, `renderAuditDashboard()`, `loadEmailLog()` |
| `script_data.js` | `loadPortalData()`, `loginBuyer()`, `bindEvents()`, configurações — login via modal salva `tenant_id` + recarrega `loadPortalData()` após autenticação |
| `script_main.js` | `bootstrap()`, auth, calendário, categorias, PWA install, `refreshJWT` interval, `saveNewEvent()`, `deleteGenericEvent()` |

Outros arquivos estáticos:

| Arquivo | Descrição |
|---|---|
| `sw.js` | Service Worker v13 — cache dos assets, registrado em `index.html` e `instalar.html` |
| `manifest.json` | PWA manifest com ícones PNG 192×512 |
| `icon-192.png` / `icon-512.png` | Ícones PWA gerados do `.ico` original |
| `instalar.html` | Página de primeiro acesso: define senha → loga → mostra guia de instalação |
| `instalar_atalho.bat` | Instalador Windows autossuficiente — cria atalho na área de trabalho |
| `instalar_atalho.ps1` | Versão estendida do instalador (com download de ícone) |

## Estrutura do frontend admin (`frontend_admin/`)

Arquivo único `script.js` (não dividido). Painel administrativo:

- Login com e-mail + senha via `POST /api/v1/admin/auth/login` → JWT em `localStorage['agenda_admin_jwt']`
- Seções: Base Operacional (tenants), Clientes, Vigências, Admins, **Log de E-mails**, Ajuda, Conexão
- **Admins — inscrições de relatório**: cada card de admin tem botão **📧 Relatórios** → modal com checklist de tenants; admin inscrito recebe cópia consolidada (gestor) do relatório diário daquele tenant; qualquer admin pode gerenciar suas próprias inscrições; `editAdminReportSubs()` / `saveAdminReportSubs()` em `script.js`
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
| `is_gestor` | boolean | Recebe relatório consolidado de todos os compradores do tenant |
| `receber_auditoria` | boolean | Recebe e-mail com auditoria do dia anterior |
| `receber_agenda_proximo` | boolean | Recebe e-mail com agenda do próximo dia útil |

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
| `api/v1/agenda.py` | `/api/v1/agenda` | Listar próximas/atrasadas, sugerir data, tratar ocorrência |
| `api/v1/cron.py` | `/api/v1/cron` | Endpoint de cron — dispara relatórios diários |
| `api/v1/redirect.py` | `/portal` | Redirect 302 para `FRONTEND_URL` (URL estável do instalador) |
| `services/agenda_service.py` | — | Lógica de tratamento: cálculo de datas, parâmetros |
| `services/email_service.py` | — | `send_html()` — usa Resend se `RESEND_API_KEY` configurado, fallback para SMTP porta 465; inclui `text/plain` automático via `_html_to_text()`; suporta `attachments` (PDF) |
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

### Agenda (JWT)
- `GET /api/v1/agenda/proximas?tenant_id=&comprador_id=`
- `GET /api/v1/agenda/atrasadas?tenant_id=&comprador_id=`
- `GET /api/v1/agenda/{id}/sugestao`
- `POST /api/v1/agenda/{id}/tratar`

### Cron (header `X-Cron-Secret` ou `Authorization: Bearer {CRON_SECRET}`)
- `GET /api/v1/cron/relatorio-diario` — chamado pelo Vercel Cron (00:00 UTC = 21:00 BRT, seg-sex)
- `POST /api/v1/cron/relatorio-diario` — chamada manual; aceita `?tenant_id=`, `?data_ref=` e `?admin_only=true` (envia só para admins inscritos, sem disparar compradores)

### Redirect (público)
- `GET /portal` — redirect 302 para `FRONTEND_URL`

## Relatório Diário por E-mail

### Fluxo
1. Vercel Cron dispara `GET /api/v1/cron/relatorio-diario` toda noite às **21h BRT** (00:00 UTC, seg-sex)
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
- **Gráficos Chart.js**: doughnut (distribuição) + barra horizontal (por comprador) — CDN `chart.js@4.4.4`
- **Recomendações**: análise por comprador (mais postergador), por fornecedor (mais ajustes), carteira sem dono
- **Exportação Excel**: botão "📤 Exportar" via SheetJS — exporta entradas filtradas
- **Seção "Eventos de Cadastro"**: tabela de `audit_log` filtrada por período — criações, exclusões e alterações de fornecedores e compradores com chips coloridos (verde/amarelo/vermelho)
- **Justificativa**: ao tratar agenda, o modal exibe resumo dinâmico do que será auditado + botão "Sim/Não" para justificativa livre; texto gravado em `observacao.justificativa`; exibido em itálico roxo na tabela de auditoria
- `renderAuditDashboard()` em `script_forms.js`; `classifyAuditEvent()`, `aggregateAuditMetrics()`, `updateAuditSummary()` em `script_render.js`
- `state.auditLogs` carregado em `loadPortalData()` (500 registros mais recentes de `audit_log`)

## Audit Log — eventos de cadastro (`audit_log`)

- Tabela criada em `schema_v12_audit_log.sql`; RLS com `app.user_belongs_to_tenant(tenant_id)`
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
- `saveNewEvent()` e `deleteGenericEvent()` em `script_main.js`; `newEventEditId` (hidden input) controla o modo
- **Botão "Salvar Evento" desabilitado durante o POST** — evita duplo clique criando ocorrências duplicadas; reabilitado no `finally`
- **Categoria**: "Agenda de Compras" excluída do dropdown
- **Compradores**: checkboxes em grid; botões Todos/Nenhum; comprador logado pré-marcado na criação
- **Multi-comprador**: cria uma ocorrência por comprador × data (só no modo criação)
- **Recorrência**: Diária, Semanal, Quinzenal, Mensal (só no modo criação)
- **Duração padrão**: calculada via `addMinutesToTime()` com `getSettings().duracaoPadraoCompromissos`

## Seção Compromissos (`id="compromissos"`)

- Menu **🗒️ Compromissos** na sidebar do portal cliente
- Lista todos os `agenda_ocorrencias` com `fornecedor_id IS NULL` e categoria ≠ "Agenda de Compras"
- Filtro pelo comprador ativo (`activeBuyerId`)
- Ordenação crescente por `data_prevista` + `hora_inicio`
- Colunas: Data, Título, Categoria (pill colorida), Horário, Comprador, Excluir
- Exclusão remove do `state.agenda` imediatamente e recarrega o calendário (sem reload completo)
- Botão **+ Novo Evento** no topo da seção

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

- Cache: `agenda-compras-v14` — bumpar ao alterar JS/CSS (Hard refresh não bypassa o SW no Chrome)
- SW registrado em `index.html` e `instalar.html` com `navigator.serviceWorker.register('/sw.js')`
- ASSETS do SW: os 6 `script_*.js`, `index.html`, `instalar.html`, `styles.css`, `manifest.json`, `icon-*.png`, fontes, FullCalendar
- Modal "Instale o app": detecta browser via `userAgent` e mostra instruções específicas (Edge / Chrome / iOS)
- `showPwaInstallModal()` exposta globalmente — chamada pelo botão "📲 Reinstalar Atalho" na sidebar
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

- `SUPABASE_SERVICE_ROLE_KEY` no Vercel foi sinalizado como potencialmente exposto em abr/2026 — rotacionar quando possível (impacta envio de convites): Supabase → Settings → API → Reset `service_role` key → atualizar no Vercel.
- Logo do cliente no PDF: atualmente só aparece a logo Service Farma no rodapé. Para incluir a logo do cliente, é necessário adicionar campo `logo_url` na tabela `tenants` e armazenar URL pública (Supabase Storage).
- Resend.com: integração concluída em mai/2026. Domínio `servicefarma.far.br` verificado. `RESEND_API_KEY` configurada no Vercel. `email_service.py` usa Resend como provider principal com fallback SMTP.
- Ativar relatório para clientes reais (Grupo São Valentim e Grupo Velanes): apenas configuração operacional — toggle no Admin + checkboxes de notificação nos compradores.
- **`defaultSettings.tenantId` hardcoded como Service Farma** (`script_state.js` linha 47): qualquer usuário que abra o portal sem `localStorage` configurado vê a agenda da Service Farma por padrão. Corrigir para `""`. Pendente aprovação.

## Caso em investigação — Elias (Drogaria SV) — mai/2026

**Sintoma:** Elias abre o portal e vê a agenda da Service Farma em vez da Drogaria SV.

**Histórico:**
1. Elias foi cadastrado com e-mail `elias@servicefarma.far.br` — nunca recebia o convite (e-mail enviado, não entregue)
2. Admin alterou o e-mail no cadastro para `eliasmoreiraalves.jr@gmail.com` e enviou novo convite
3. Elias recebeu o convite pelo Gmail, clicou no link, passou pelo `instalar.html` e definiu senha
4. Portal abriu exibindo a agenda da **Service Farma** em vez da Drogaria SV

**Dados confirmados no banco (mai/2026):**

| Campo | Valor |
|---|---|
| `compradores.id` | `67e2920e-2cf6-4e81-9304-92c82abb2ed3` |
| `compradores.email` | `eliasmoreiraalves.jr@gmail.com` |
| `compradores.user_id` | `a5de2a85-248a-4cbf-a64c-6db3eb4f69a1` |
| `compradores.tenant_id` | `f0d557c6-9dd9-4e80-96e0-2094da4a40ff` (Drogaria SV ✓) |
| Auth user antigo (`elias@servicefarma.far.br`) | `d1856c97-4e3e-478e-83c0-557834abbf36` — não linkado a nenhum comprador |

- Só existe **um** comprador com o Gmail em toda a base — na Drogaria SV ✓
- O `user_id = a5de2a85...` também está linkado **somente** ao comprador da Drogaria SV ✓
- Pelo código, o fluxo `instalar.html` → `definir-senha` deveria retornar Drogaria SV e gravar corretamente no `localStorage`

**Causa raiz não confirmada** — todos os dados estão corretos; comportamento não foi possível reproduzir remotamente. A hipótese mais provável é que o `localStorage` ficou com o `tenant_id` errado da Service Farma (possivelmente do `defaultSettings.tenantId` hardcoded, caso `definir-senha` tenha falhado silenciosamente por algum motivo pontual).

**Workaround para quando Elias retornar:**
1. Acessar `https://agenda-compras-cliente.vercel.app/?limpar=1`
2. Fazer login com `eliasmoreiraalves.jr@gmail.com` + senha definida no convite
3. O backend vai retornar o `tenant_id` da Drogaria SV via `user_id = a5de2a85...` ✓
4. Se ainda mostrar Service Farma: abrir DevTools (F12) → Application → Local Storage → verificar `agenda_cliente_tenant_id` imediatamente após o login para identificar se o problema está no backend ou no frontend
