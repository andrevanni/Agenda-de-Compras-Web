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
- **Migrations**: scripts SQL versionados em `backend/db/` (`schema_v1.sql` → `schema_v7_*.sql`). Sem Alembic.

## Estrutura do frontend cliente (`frontend/`)

`script.js` foi dividido em 6 arquivos (carregados em ordem no `index.html`):

| Arquivo | Conteúdo |
|---|---|
| `script_state.js` | Estado global, constantes, mocks, refs DOM |
| `script_utils.js` | Utilitários, datas, cálculos, `fetchSupabase`/`fetchApi` |
| `script_render.js` | Render tabelas, fornecedores, compradores |
| `script_forms.js` | Formulários (saveSupplier, saveBuyer), importação CSV/Excel |
| `script_data.js` | `loadPortalData`, bindEvents, configurações |
| `script_main.js` | Auth, calendário, categorias, bootstrap |

Compartilham escopo global (não são ES modules) — qualquer função em qualquer arquivo está disponível em todos os outros.

## Convenções críticas

- `tenant_id` obrigatório em toda query — nunca implícito.
- SQL raw com `sqlalchemy.text()` no backend. Não usar ORM declarativo.
- Schemas Pydantic em `backend/app/schemas/` são os contratos.
- Frontend usa `fetchSupabase()` para CRUD direto, `fetchApi()` para auth e operações admin.
- `agenda_ocorrencias.observacao` = JSON estruturado de auditoria. `agenda_ocorrencias.nota` = texto livre (post-it no painel).
- Upsert via PostgREST: `?on_conflict=` para evitar duplicate key.

## Tabelas principais

- `tenants` — bases operacionais
- `compradores` — usuários: `user_id` (Supabase Auth), `email`, `senha_hash` (legado)
- `fornecedores` + `fornecedor_dias_compra`
- `agenda_ocorrencias` — campos: `titulo`, `data_prevista`, `hora_inicio`, `hora_fim`, `categoria_id`, `nota`, `observacao`, `recorrencia` (JSONB), `status`, `fornecedor_id`, `comprador_id`
- `categorias_agenda` — nome + cor por tenant
- `clientes` + `clientes_licencas` — comercial; `tenant_licencas` — operacional

## Endpoints chave

- `POST /api/v1/auth/login` / `definir-senha` — público
- `POST /api/v1/admin/auth/login` — JWT admin (requer `app_metadata.role == "admin"`)
- `POST /api/v1/admin/compradores/{id}/enviar-convite` — convite via Supabase Auth + SMTP
- `POST /api/v1/admin/abrir-portal/{tenant_id}` — JWT para simular cliente

Todos os endpoints admin aceitam JWT (`Authorization: Bearer`) OU `X-Admin-Token` (fallback).

## Frequências de revisão (regras de negócio)

| Valor | Dias compra | Intervalo |
|---|---|---|
| 1, 2, 4 | 1 dia | 28/14/7 dias |
| 8 | 2 dias | próximo dia permitido |
| 12 | 3 dias | próximo dia permitido |

Lógica de tratamento duplicada: `backend/app/services/agenda_service.py` e `frontend/script_main.js` (`tratarAgendaAtual`).

## Pendências

- Senha de compradores ainda em texto plano como fallback.
- `PORTAL_ADMIN_PASSWORD` (env Vercel) precisa ser exatamente a senha de `andre@servicefarma.far.br` no Supabase Auth.
