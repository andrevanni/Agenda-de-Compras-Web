# CLAUDE.md

Sistema web multi-tenant SaaS para gestão de agenda de compras de farmácias.

## Deploy (produção, push para `main` → deploy automático)

| Projeto Vercel | URL | Pasta |
|---|---|---|
| agenda-compras-cliente | `https://agenda-compras-cliente.vercel.app` | `frontend/` |
| agenda-compras-admin   | `https://agenda-compras-admin.vercel.app`   | `frontend_admin/` |
| agenda-de-compras-api  | `https://agenda-de-compras-api.vercel.app`  | `backend/` |

Supabase: `fnwsorhflueunqzkwsxu.supabase.co`

## Arquitetura

```
Routes (backend/app/api/v1/) → Services (backend/app/services/) → DB session (SQLAlchemy)
```

- **Frontend cliente** chama Supabase REST direto via `fetchSupabase()`. FastAPI só para auth JWT e operações admin.
- **Multi-tenancy**: todo registro tem `tenant_id`. Queries SEMPRE filtram por `tenant_id`. RLS no Supabase usa `USING (true)` — isolamento é via aplicação.
- **Migrations**: scripts SQL versionados em `backend/db/` (`schema_v1.sql` → `schema_v9_*.sql`). Sem Alembic.

## Estrutura do frontend cliente (`frontend/`)

`script.js` foi dividido em 6 arquivos (carregados em ordem no `index.html`):

| Arquivo | Conteúdo |
|---|---|
| `script_state.js` | Estado global, constantes, mocks, refs DOM |
| `script_utils.js` | Utilitários, datas, cálculos, `fetchSupabase`/`fetchApi`, `_store()` |
| `script_render.js` | Render tabelas, fornecedores, compradores |
| `script_forms.js` | Formulários (saveSupplier, saveBuyer), importação CSV/Excel, exportação |
| `script_data.js` | `loadPortalData`, bindEvents, configurações |
| `script_main.js` | Auth, calendário, categorias, bootstrap |

Compartilham escopo global (não são ES modules) — qualquer função em qualquer arquivo está disponível em todos os outros.

## Convenções críticas

- `tenant_id` obrigatório em toda query — nunca implícito.
- SQL raw com `sqlalchemy.text()` no backend. Não usar ORM declarativo.
- Schemas Pydantic em `backend/app/schemas/` são os contratos.
- Frontend usa `fetchSupabase()` para CRUD direto, `fetchApi()` para auth e operações admin.
- `fetchApi()` envia automaticamente o JWT no header `Authorization: Bearer`.
- `agenda_ocorrencias.observacao` = JSON estruturado de auditoria. `agenda_ocorrencias.nota` = texto livre (post-it no painel).
- Upsert via PostgREST: `?on_conflict=` para evitar duplicate key.

## Tabelas principais

- `tenants` — bases operacionais
- `compradores` — usuários: `user_id` (Supabase Auth), `email`, `senha_hash` (legado)
- `fornecedores` + `fornecedor_dias_compra` — inclui `hora_inicio`/`hora_fim` (horário padrão de visita/pedido)
- `agenda_ocorrencias` — campos: `titulo`, `data_prevista`, `hora_inicio`, `hora_fim`, `categoria_id`, `nota`, `observacao`, `recorrencia` (JSONB), `status`, `fornecedor_id`, `comprador_id`
- `categorias_agenda` — nome + cor por tenant
- `feriados` — `data`, `nome`, `tipo` (nacional/personalizado) por tenant
- `clientes` + `clientes_licencas` — comercial; `tenant_licencas` — operacional

## Endpoints chave

- `POST /api/v1/auth/login` / `definir-senha` — público
- `POST /api/v1/auth/login` — login comprador via Supabase Auth (senha no Supabase, não mais texto plano)
- `POST /api/v1/admin/auth/login` — JWT admin (requer `app_metadata.role == "admin"`)
- `POST /api/v1/admin/compradores/{id}/enviar-convite` — convite via Supabase Auth + SMTP (admin)
- `POST /api/v1/portal/compradores/{id}/enviar-convite` — convite enviado pelo portal do cliente (requer JWT)
- `POST /api/v1/admin/abrir-portal/{tenant_id}` — JWT para simular cliente

Todos os endpoints admin aceitam JWT (`Authorization: Bearer`) OU `X-Admin-Token` (fallback).

## Fluxo de convite de comprador

1. Portal cliente → botão "Convite" → `POST /api/v1/portal/compradores/{id}/enviar-convite` com JWT
2. Backend gera link Supabase Auth (`type=recovery` ou `type=invite`) com `redirect_to = https://agenda-compras-cliente.vercel.app/instalar.html`
3. Envia e-mail HTML via SMTP (`comercial@servicefarma.far.br`)
4. Comprador clica no link → abre `instalar.html` → define senha → loga automaticamente → guia de instalação PWA
- Se o link abrir na raiz (`/`) em vez de `/instalar.html`, o `bootstrap()` detecta `#access_token` e redireciona automaticamente

## Isolamento de tenant por aba (admin "Abrir Portal")

- Quando admin abre portal via "Abrir Portal", o JWT e tenant_id são gravados em **`sessionStorage`** (não localStorage)
- `_store(key)` em `script_utils.js` lê sessionStorage primeiro, depois localStorage
- Isso isola cada aba — abrir Velanes não contamina a aba do SV aberta simultaneamente
- `abrirPortal()` no admin abre janela em branco **antes** do `await` (evita bloqueio do popup blocker do Chrome)

## Service Worker

- Cache: `agenda-compras-v10` (bumpar versão ao alterar JS/CSS para forçar atualização nos clientes)
- Hard refresh (`Ctrl+Shift+R`) **não** bypassa o service worker no Chrome — só bumpar a versão do cache garante atualização

## Tela de Fornecedores

- **Exportar**: botão "📤 Exportar" baixa base completa em Excel via SheetJS
- **Busca**: campo de texto filtra por código ou nome em tempo real (`renderSuppliers` com filtro)
- **Importação**: `parseSuppliersCsv` pula linhas sem código/nome (retorna null + filter) em vez de lançar erro; progresso exibido em tempo real ("Processando X de N...")
- Campo Comprador no template de importação é **opcional** (não marcado por padrão)

## Frequências de revisão (regras de negócio)

| Valor | Dias compra | Intervalo |
|---|---|---|
| 1, 2, 4 | 1 dia | 28/14/7 dias |
| 8 | 2 dias | próximo dia permitido |
| 12 | 3 dias | próximo dia permitido |

Lógica de tratamento duplicada: `backend/app/services/agenda_service.py` e `frontend/script_render.js` (`tratarAgendaAtual`).

## Feriados

- Seção própria na sidebar do portal cliente
- Importação de feriados nacionais via BrasilAPI (`brasilapi.com.br/api/feriados/v1/{ano}`)
- Feriados aparecem no calendário: fundo amarelo (`display:background`) + chip laranja com nome
- Alerta ao criar evento genérico ou tratar agenda em data de feriado (não bloqueia, só avisa)
- `isFeriado(dateIso)` e `getFeriado(dateIso)` disponíveis em `script_main.js`

## Horário do fornecedor

- `fornecedores.hora_inicio` e `hora_fim` definem o horário padrão de visita/pedido
- Propagados automaticamente ao criar/sincronizar ocorrências pendentes (`ensurePendingOccurrenceForSupplier`, `tratarAgendaAtual`)
- Alerta de conflito de horário ao tratar agenda (se fornecedor tiver hora definida)
- `checkEventConflict()` em `script_main.js` verifica conflito via Supabase REST

## Pendências

- JWT do portal expira em 1h (Supabase padrão) — refresh automático ainda não implementado. Workaround: logout/login.
- `PORTAL_ADMIN_PASSWORD` (env Vercel) precisa ser exatamente a senha de `andre@servicefarma.far.br` no Supabase Auth.
- Script de setup `GRUPO_SAO_VALENTIM_setup.sql` não é idempotente — se rodado novamente duplica dados.
