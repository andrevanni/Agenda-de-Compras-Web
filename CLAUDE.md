# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexto do Projeto

Sistema web multi-tenant para gestão de agenda de compras de farmácias. Evolução de um sistema desktop legado, mantido em paralelo durante a transição. O foco é preservar as regras de negócio do desktop e expô-las via API REST, atendendo múltiplos clientes (tenants) com isolamento total de dados.

O frontend é deployado no **Vercel** via GitHub (push → deploy automático). O backend roda separado (não está no Vercel). Qualquer mudança no frontend precisa de `git push` para entrar em produção.

## Comandos

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # editar com credenciais reais
uvicorn app.main:app --reload
```

A API sobe em `http://localhost:8000`. Documentação automática em `/docs` e `/redoc`.

### Testar endpoints

```bash
curl http://localhost:8000/health
curl -H "X-Admin-Token: <token>" http://localhost:8000/api/v1/admin/clientes
curl "http://localhost:8000/api/v1/agenda/proximas?tenant_id=<uuid>&data_inicio=2025-01-01&data_fim=2025-01-31"
```

### Frontend

Abrir diretamente no navegador ou acessar via Vercel:
- `frontend/index.html` — portal do cliente (consome Supabase REST diretamente)
- `frontend_admin/index.html` — painel administrativo (consome FastAPI backend)
- `versao_teste/index.html` — versão funcional com dados mockados

## Arquitetura

### Camadas do backend

```
Routes  (backend/app/api/v1/)          ← recebe request, valida schema Pydantic
  └── Services (backend/app/services/) ← lógica de negócio, SQL raw via text()
        └── DB session (SQLAlchemy)    ← conexão com PostgreSQL/Supabase
```

### Fluxo do frontend

O `frontend/` **não passa pelo FastAPI**. Ele chama o Supabase REST API diretamente via `fetchSupabase()`. O FastAPI backend é usado apenas pelo `frontend_admin/`.

```
frontend/script.js
  └── fetchSupabase(path, options)   ← wrapper sobre fetch() para o Supabase REST
        └── /rest/v1/<tabela>        ← PostgREST do Supabase
```

Quando o Supabase falha, o sistema cai automaticamente em dados mockados locais (`mockBuyers`, `mockSuppliers`, `mockAgenda`).

### Multi-tenancy

Cada registro tem `tenant_id` (UUID). O isolamento é duplo:
1. **Aplicação**: todas as queries incluem `WHERE tenant_id = :tenant_id`
2. **Banco**: RLS ativo no Supabase

O `tenant_id` é passado como parâmetro URL em cada requisição REST.

### Autenticação no frontend

- Login via modal `buyerLoginModal`: compradores usam e-mail + senha (armazenada em `compradores.senha_hash` — **atenção: texto plano, sem hash real**)
- Admin do cliente: e-mail do `clientes.email_responsavel` com senha guardada em `clientes.observacoes` (JSON)
- Roles: `buyer` e `admin_client` salvos em `localStorage`
- Rotas `/api/v1/admin/*` no FastAPI exigem header `X-Admin-Token`

### Banco de dados (schemas versionados)

Scripts SQL em `backend/db/` aplicados em ordem no Supabase:

| Arquivo | O que adiciona |
|---|---|
| `schema_v1.sql` | Tabelas base multi-tenant |
| `schema_v2_supabase_admin.sql` | RLS, `tenant_users`, painel admin |
| `schema_v3_clientes_validade.sql` | `clientes` e `clientes_licencas` |
| `schema_v4_fornecedor_notas.sql` | `notas_relacionamento` em fornecedores |
| `schema_v5_categorias_calendario.sql` | `categorias_agenda` + campos `hora_inicio`, `hora_fim`, `titulo`, `categoria_id`, `recorrencia` em `agenda_ocorrencias` |
| `schema_v6_notas_painel.sql` | Campo `nota` em `agenda_ocorrencias` |

**Atenção**: A tabela `categorias_agenda` usa RLS com policy `allow_tenant_filter` (USING true) — o isolamento é feito pelo filtro `tenant_id` na URL, não por `current_setting`.

### Tabelas principais

- `tenants` — clientes da plataforma
- `fornecedores` — com `frequencia_revisao`, `lead_time_entrega`, `notas_relacionamento`
- `fornecedor_dias_compra` — dias da semana por fornecedor
- `agenda_ocorrencias` — trilha central: `titulo`, `data_prevista`, `hora_inicio`, `hora_fim`, `categoria_id`, `nota`, `recorrencia` (JSONB), `status` (PENDENTE/REALIZADA/CANCELADA/ADIADA)
- `compradores` — usuários operacionais
- `categorias_agenda` — categorias com nome e cor por tenant
- `clientes` — dados comerciais do tenant (separado de `tenants`)

## Regras de Negócio Críticas

### Frequências de revisão de fornecedores

| Valor | Dias de compra | Intervalo |
|---|---|---|
| 1 | 1 dia | 28 dias |
| 2 | 1 dia | 14 dias |
| 4 | 1 dia | 7 dias |
| 8 | 2 dias | próximo dia permitido |
| 12 | 3 dias | próximo dia permitido |

### Tratamento de ocorrência (`tratar_ocorrencia` / `tratarAgendaAtual`)

1. Marca ocorrência como REALIZADA + `data_realizacao` + `observacao` (JSON de auditoria) + `nota`
2. Calcula próxima data (sugestão ou parâmetro explícito)
3. Verifica idempotência: não cria duplicata para o mesmo fornecedor na mesma data
4. Cria nova ocorrência PENDENTE

Esta lógica existe em dois lugares:
- `backend/app/services/agenda_service.py` — via FastAPI
- `frontend/script.js` (`tratarAgendaAtual`) — via Supabase REST direto

## Variáveis de Ambiente

```
DATABASE_URL=postgresql+psycopg://...
ADMIN_API_TOKEN=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_ENV=dev
```

## Frontend — Estrutura do script.js

O arquivo `frontend/script.js` tem ~2700 linhas (após limpeza de duplicatas). Principais seções:

### Estado global (`state`)
- `buyers`, `suppliers`, `agenda`, `auditOccurrences`, `categorias` — dados carregados do Supabase
- `calendarInstance` — instância do FullCalendar
- `clientMeta` — metadados do cliente (logo, senha de auditoria, etc.) em JSON dentro de `clientes.observacoes`

### Funções principais
- `loadPortalData()` — carrega todos os dados do Supabase em paralelo; fallback para mocks em caso de erro
- `loadCategorias()` — carrega `categorias_agenda` do Supabase
- `renderTables()` — re-renderiza todas as seções (agenda, fornecedores, compradores, painel)
- `tratarAgendaAtual()` — fluxo completo de tratamento de agenda com criação da próxima ocorrência
- `initCalendar()` / `refreshCalendar()` — FullCalendar v6 com suporte a categorias, horários e filtro por comprador
- `saveNewEvent()` — cria evento genérico com recorrência
- `renderPainel()` — renderiza post-its de notas agrupados por comprador

### localStorage keys (`storageKeys`)
- `supabaseUrl`, `supabaseKey`, `tenantId` — configuração de conexão
- `activeBuyerId`, `loggedBuyerId`, `loggedPortalRole`, `loggedPortalEmail` — sessão
- `logoUrl`, `theme`, `sidebarCollapsed`, `calendarWeekdays` — preferências visuais

### Configurações do FullCalendar
- `hiddenDays` — configurável via "Personalizar portal" (Seg-Dom, Seg-Sab, Seg-Sex)
- `slotMinTime: "08:00"` / `slotMaxTime: "18:00"` — janela visível padrão
- `navLinks: true` — clicar no número do dia navega para view Dia
- `selectable: true` — arrastar slot abre modal de novo evento
- Sidebar collapse dispara `calendarInstance.updateSize()` após transição

## Categorias de Agenda

Cada tenant tem categorias com nome e cor (hex). Cadastradas em `categorias_agenda`. Padrão inserido pelo schema_v5:
- **Agenda de Compras** — amarelo `#F59E0B` (vinculada a fornecedores)
- **Pessoal** — azul `#3B82F6`
- **Operacional** — verde `#10B981`

Fallback local quando Supabase falha usa os mesmos valores.

## Painel de Notas

Notas fixadas em `agenda_ocorrencias.nota`. Renderizadas em `renderPainel()` como post-its agrupados por comprador. Aparecem tanto para ocorrências PENDENTE quanto REALIZADA. Botão ✕ remove a nota via PATCH no Supabase.

A nota do compromisso (`nota`) é **diferente** da nota do fornecedor (`notas_relacionamento` em `fornecedores`).

## Sidebar Recolhível

- Default: colapsada (62px, só ícones)
- Expandida: 264px com labels
- Toggle no topo: ⋮ (colapsada) / ✕ (expandida)
- Estado salvo em `localStorage.sidebarCollapsed`
- Ao expandir/recolher, `calendarInstance.updateSize()` é chamado após 230ms

## Frontends

Ambos os frontends são HTML5/JS/CSS vanilla sem build step. Sem bundler, sem framework.

- **`frontend/`** — portal operacional. Integrado com Supabase REST direto.
- **`frontend_admin/`** — painel SaaS. Endpoints admin prontos no FastAPI, **frontend ainda não integrado**.
- **`versao_teste/`** — referência de comportamento esperado com dados mockados.

## Pendências conhecidas

1. **Credenciais Supabase expostas no modal "Personalizar portal"** — URL e anon key visíveis ao usuário final. Em produção, considerar proxy ou variável de ambiente via Vercel.
2. **Painel admin (`frontend_admin/`) não conectado ao backend** — endpoints FastAPI prontos, frontend ainda exibe dados estáticos.
3. **Senha dos compradores em texto plano** — `compradores.senha_hash` armazena a senha sem hash real. Migrar para Supabase Auth ou bcrypt antes de ir para produção com dados reais.

## Convenções

- Todo endpoint que acessa dados de negócio recebe `tenant_id` — nunca assumir contexto implícito
- SQL raw com `sqlalchemy.text()` é o padrão no backend; não introduzir ORM declarativo
- Schemas Pydantic em `backend/app/schemas/` são os contratos de entrada/saída
- Migrations são scripts SQL versionados manualmente em `backend/db/`; não usar Alembic
- Frontend faz upsert via PostgREST com `?on_conflict=` para evitar duplicate key
- `observacao` em `agenda_ocorrencias` é JSON estruturado de auditoria — não usar para texto livre; usar `nota` para isso
