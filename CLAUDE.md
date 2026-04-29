# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexto do Projeto

Sistema web multi-tenant SaaS para gestão de agenda de compras de farmácias. Evolução de um sistema desktop legado.

## Deploy atual (produção)

| Projeto Vercel | URL | Pasta no repo |
|---|---|---|
| agenda-compras-cliente | `https://agenda-compras-cliente.vercel.app` | `frontend/` |
| agenda-compras-admin | `https://agenda-compras-admin.vercel.app` | `frontend_admin/` |
| agenda-de-compras-api | `https://agenda-de-compras-api.vercel.app` | `backend/` |

Push para `main` → deploy automático nos três projetos.

## Comandos

### Backend local

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # editar com credenciais reais
uvicorn app.main:app --reload
```

API em `http://localhost:8000`. Docs em `/docs` e `/redoc`.

### Testar endpoints

```bash
curl http://localhost:8000/health
curl -H "X-Admin-Token: <token>" http://localhost:8000/api/v1/admin/clientes
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"senha"}'
```

## Arquitetura

### Camadas do backend

```
Routes  (backend/app/api/v1/)          ← valida schema Pydantic
  └── Services (backend/app/services/) ← lógica de negócio, SQL raw via text()
        └── DB session (SQLAlchemy)    ← PostgreSQL/Supabase
```

### Fluxo do frontend cliente

O `frontend/` **não passa pelo FastAPI para leitura de dados** — chama Supabase REST direto via `fetchSupabase()`. O FastAPI é usado para:
- Auth JWT (`/api/v1/auth/login`, `/api/v1/auth/definir-senha`)
- Envio de convites e abrir-portal (admin)

Quando Supabase falha → fallback para dados mockados locais.

### Fluxo de autenticação (Opção A — user_id em compradores)

```
Admin envia convite → POST /api/v1/admin/compradores/{id}/enviar-convite
  → Supabase Auth gera link → e-mail enviado via SMTP
  → Comprador clica link → /instalar.html#access_token=...
  → POST /api/v1/auth/definir-senha → JWT retornado
  → Portal carregado com JWT no localStorage
```

Login subsequente:
```
loginBuyer() → tenta POST /api/v1/auth/login (JWT)
  → se API não configurada → fallback: compara senha_hash em texto plano
```

### Multi-tenancy

Cada registro tem `tenant_id`. Isolamento duplo:
1. **Aplicação**: todas as queries incluem `WHERE tenant_id = :tenant_id`
2. **Banco**: RLS ativo no Supabase (políticas com `USING (true)` — filtro pela aplicação)

### Banco de dados — schemas versionados

Scripts SQL em `backend/db/` — aplicar em ordem no Supabase:

| Arquivo | O que adiciona |
|---|---|
| `schema_v1.sql` | Tabelas base multi-tenant |
| `schema_v2_supabase_admin.sql` | RLS, `tenant_users`, painel admin |
| `schema_v3_clientes_validade.sql` | `clientes` e `clientes_licencas` |
| `schema_v4_fornecedor_notas.sql` | `notas_relacionamento` em fornecedores |
| `schema_v5_categorias_calendario.sql` | `categorias_agenda` + campos `hora_inicio`, `hora_fim`, `titulo`, `categoria_id`, `recorrencia` em `agenda_ocorrencias` |
| `schema_v5_fix_rls_categorias.sql` | Corrige RLS de `categorias_agenda` (troca current_setting por USING true) |
| `schema_v6_notas_painel.sql` | Campo `nota` em `agenda_ocorrencias` |
| `schema_v7_auth_licencas.sql` | Campo `user_id` em `compradores` + tabela `tenant_licencas` |

**RLS importante:** todas as policies usam `USING (true)` — isolamento feito via filtro de `tenant_id` na query. O schema `app` do Supabase requer `GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role`.

### Fixes de RLS aplicados em produção (SQL Editor)

```sql
-- Corrige tenants (app.user_belongs_to_tenant bloqueava acesso anon)
DROP POLICY IF EXISTS "tenant read access" ON tenants;
DROP POLICY IF EXISTS "tenant update access" ON tenants;
CREATE POLICY "allow_all_tenants" ON tenants FOR ALL USING (true);

-- Libera clientes e clientes_licencas
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_clientes" ON clientes FOR ALL USING (true);
ALTER TABLE clientes_licencas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_clientes_licencas" ON clientes_licencas FOR ALL USING (true);

-- Libera schema app
GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role;
```

### Tabelas principais

- `tenants` — bases operacionais (isolamento de dados por cliente)
- `compradores` — usuários operacionais: `user_id` (Supabase Auth), `email`, `senha_hash` (legado)
- `fornecedores` — com `frequencia_revisao`, `lead_time_entrega`, `notas_relacionamento`
- `fornecedor_dias_compra` — dias da semana por fornecedor
- `agenda_ocorrencias` — trilha central: `titulo`, `data_prevista`, `hora_inicio`, `hora_fim`, `categoria_id`, `nota`, `recorrencia` (JSONB), `status`
- `categorias_agenda` — categorias com nome e cor por tenant
- `clientes` — dados comerciais do tenant (razão social, CNPJ, e-mail responsável)
- `clientes_licencas` — validade/plano por cliente comercial
- `tenant_licencas` — validade/plano por base operacional

## Endpoints da API

### Auth (público)
- `POST /api/v1/auth/login` — email + senha → JWT + tenant_id + comprador_id
- `POST /api/v1/auth/definir-senha` — access_token + nova_senha → JWT (primeiro acesso)

### Admin (requer `X-Admin-Token`)
- `GET/POST/PATCH /api/v1/admin/clientes` — CRUD de clientes comerciais
- `GET/POST/PATCH/DELETE /api/v1/admin/licencas` — validade por tenant
- `POST /api/v1/admin/compradores/{id}/enviar-convite` — envia e-mail com link Supabase Auth
- `POST /api/v1/admin/abrir-portal/{tenant_id}` — gera JWT para simular acesso como cliente

## Variáveis de Ambiente (Vercel — projeto agenda-de-compras-api)

```
APP_ENV=production
DATABASE_URL=postgresql+psycopg://postgres.fnwsorhflueunqzkwsxu:SENHA@...pooler.supabase.com:6543/postgres
SUPABASE_URL=https://fnwsorhflueunqzkwsxu.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
ADMIN_API_TOKEN=...                  # token para X-Admin-Token no painel admin
SMTP_HOST=mail.servicefarma.far.br
SMTP_PORT=465
SMTP_USER=comercial@servicefarma.far.br
SMTP_PASSWORD=...
SMTP_FROM_NAME=Agenda de Compras – Service Farma
PORTAL_ADMIN_EMAIL=andre@servicefarma.far.br
PORTAL_ADMIN_PASSWORD=...            # senha do usuário admin no Supabase Auth
FRONTEND_URL=https://agenda-compras-cliente.vercel.app
```

## Frontend — Estrutura do script.js (portal cliente)

~2800 linhas. Principais blocos:

### Estado global (`state`)
- `buyers`, `suppliers`, `agenda`, `auditOccurrences`, `categorias` — dados do Supabase
- `calendarInstance` — instância FullCalendar
- `clientMeta` — JSON dentro de `clientes.observacoes` (logo, senha auditoria, etc.)

### Funções críticas
- `loadPortalData()` — carrega tudo do Supabase em paralelo; fallback para mocks
- `loadCategorias()` — carrega `categorias_agenda`
- `tratarAgendaAtual()` — tratamento de agenda com criação da próxima ocorrência
- `initCalendar()` / `refreshCalendar()` — FullCalendar v6, filtra por comprador ativo
- `saveNewEvent()` — cria evento genérico com recorrência
- `renderPainel()` — post-its de notas agrupados por comprador
- `loginBuyer()` — tenta JWT via FastAPI, fallback texto plano
- `fetchApi()` — wrapper para chamar FastAPI com autenticação
- `fetchSupabase()` — wrapper para Supabase REST

### localStorage keys (`storageKeys`)
- `supabaseUrl`, `supabaseKey`, `tenantId` — conexão Supabase
- `apiBaseUrl` — URL do backend FastAPI (default: `https://agenda-de-compras-api.vercel.app`)
- `jwt` — token JWT após login real
- `activeBuyerId`, `loggedBuyerId`, `loggedPortalRole`, `loggedPortalEmail` — sessão
- `logoUrl`, `theme`, `sidebarCollapsed`, `calendarWeekdays` — preferências visuais

### FullCalendar
- `hiddenDays` — configurável (Seg-Dom, Seg-Sab, Seg-Sex)
- `slotMinTime: "08:00"` / `slotMaxTime: "18:00"`
- `navLinks: true` — clicar no número do dia navega para view Dia
- `selectable: true` — arrastar slot abre modal de novo evento
- `showSection("calendario")` chama `updateSize()` após 50ms para forçar re-render

## Frontend Admin (frontend_admin/)

Usa `fetchSupabase()` para CRUD (Supabase REST direto) e `fetchAdmin()` para operações exclusivas do FastAPI:

```javascript
fetchAdmin(path, options)  // X-Admin-Token no header
```

Seções (ordem lógica): Base Operacional → Clientes → Vigências → Ajuda → Conexão avançada.

Botões por tenant:
- **Abrir Portal** → `POST /api/v1/admin/abrir-portal/{tenant_id}` → abre `agenda-compras-cliente.vercel.app` em nova aba
- **Enviar Convites** → lista compradores → `POST /api/v1/admin/compradores/{id}/enviar-convite`

Configuração em "Conexão avançada": URL Supabase, anon key, URL Backend, Token Admin.
O Token Admin precisa ser configurado manualmente no localStorage (não é hardcoded por segurança).

## Página de Instalação

Disponível em: `https://agenda-compras-cliente.vercel.app/instalar.html`

Fluxo:
1. Captura `access_token` do hash da URL
2. Usuário define nova senha (mín. 6 chars)
3. `POST /api/v1/auth/definir-senha` → JWT retornado
4. JWT + tenant_id salvos no localStorage
5. Redireciona para o portal em 5s

## PWA — Instalação no Desktop/Celular

- `frontend/manifest.json` — metadados do app
- `frontend/sw.js` — service worker com cache offline
- Meta tags no `index.html` para iOS/Android
- Após instalar: ícone na área de trabalho, abre como app standalone

## Categorias de Agenda

Padrão por tenant (inserido pelo schema_v5):
- 🟡 **Agenda de Compras** — `#F59E0B` (fornecedores)
- 🔵 **Pessoal** — `#3B82F6`
- 🟢 **Operacional** — `#10B981`

## Regras de Negócio Críticas

### Frequências de revisão

| Valor | Dias de compra | Intervalo |
|---|---|---|
| 1 | 1 dia | 28 dias |
| 2 | 1 dia | 14 dias |
| 4 | 1 dia | 7 dias |
| 8 | 2 dias | próximo dia permitido |
| 12 | 3 dias | próximo dia permitido |

### Tratamento de ocorrência

1. Marca como REALIZADA + `observacao` (JSON auditoria) + `nota`
2. Calcula próxima data (sugestão ou parâmetro)
3. Idempotência: não duplica pendência do mesmo fornecedor na mesma data
4. Cria nova PENDENTE

Lógica duplicada: `backend/app/services/agenda_service.py` e `frontend/script.js` (`tratarAgendaAtual`).

## Sidebar Recolhível (portal cliente)

- Default: colapsada (62px, só ícones emoji)
- Expandida: 284px com labels
- Toggle ⋮/✕ no topo da sidebar
- Estado: `localStorage.sidebarCollapsed`
- `toggleSidebar()` chama `calendarInstance.updateSize()` após 230ms

## Painel de Notas

`agenda_ocorrencias.nota` — diferente de `fornecedores.notas_relacionamento`.
- Adicionada ao tratar agenda ou criar evento genérico
- Renderizada em `renderPainel()` como post-its por comprador
- Botão ✕ remove via PATCH no Supabase

## Convenções

- `tenant_id` obrigatório em todo acesso a dados — nunca implícito
- SQL raw com `sqlalchemy.text()` no backend — não usar ORM declarativo
- Schemas Pydantic em `backend/app/schemas/` são os contratos
- Migrations: scripts SQL versionados em `backend/db/` — não usar Alembic
- Upsert via PostgREST: `?on_conflict=` para evitar duplicate key
- `observacao` em `agenda_ocorrencias` = JSON estruturado de auditoria — usar `nota` para texto livre
- Frontend usa `fetchSupabase()` para leitura/escrita; `fetchApi()` para auth e operações admin

## Pendências conhecidas

1. **Auth do painel admin** — atualmente usa `X-Admin-Token` fixo configurado no localStorage. Pendência: migrar para Supabase Auth com `role: "admin"` no `app_metadata`, com tela de login no admin e fluxo de convite igual ao dos compradores. Somente o master (andre@servicefarma.far.br) pode criar/revogar admins via Supabase Auth.

2. **PWA do painel admin** — painel admin ainda não tem manifest.json + sw.js. Adicionar para permitir instalação no desktop.

3. **Senha dos compradores ainda em texto plano como fallback** — migração completa depende do backend estar acessível e do comprador ter feito o fluxo de convite.

4. **`PORTAL_ADMIN_PASSWORD`** — precisa ser exatamente a senha do usuário `andre@servicefarma.far.br` no Supabase Auth para o "Abrir Portal" funcionar.
