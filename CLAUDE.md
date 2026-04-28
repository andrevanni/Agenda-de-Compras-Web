# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexto do Projeto

Sistema web multi-tenant para gestão de agenda de compras de farmácias. Evolução de um sistema desktop legado, mantido em paralelo durante a transição. O foco é preservar as regras de negócio do desktop e expô-las via API REST, atendendo múltiplos clientes (tenants) com isolamento total de dados.

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

A API sobe em `http://localhost:8000`. Documentação automática em `/docs` (Swagger) e `/redoc`.

### Testar endpoints

```bash
# Health check
curl http://localhost:8000/health

# Admin (header obrigatório em produção, opcional em APP_ENV=dev)
curl -H "X-Admin-Token: <token>" http://localhost:8000/api/v1/admin/clientes

# Agenda (sempre exige tenant_id)
curl "http://localhost:8000/api/v1/agenda/proximas?tenant_id=<uuid>&data_inicio=2025-01-01&data_fim=2025-01-31"
```

### Frontend

Abrir diretamente no navegador:
- `frontend/index.html` — portal do cliente (consome API em `http://localhost:8000`)
- `frontend_admin/index.html` — painel administrativo
- `versao_teste/index.html` — versão funcional com dados mockados, sem backend

## Arquitetura

### Estrutura de camadas

```
Routes  (backend/app/api/v1/)          ← recebe request, valida schema Pydantic
  └── Services (backend/app/services/) ← lógica de negócio, SQL direto (sem ORM queries)
        └── DB session (SQLAlchemy)    ← conexão com PostgreSQL/Supabase
```

Os services usam SQL raw via SQLAlchemy `text()`, não o ORM de alto nível. Toda query filtra por `tenant_id`.

### Multi-tenancy

Cada registro de negócio tem `tenant_id` (UUID). O isolamento é duplo:
1. **Aplicação**: todas as queries incluem `WHERE tenant_id = :tenant_id`
2. **Banco**: RLS (Row Level Security) ativo no Supabase como segunda barreira

Não existe sessão de usuário no backend atual — o `tenant_id` é passado como parâmetro em cada requisição.

### Autenticação

- Rotas `/api/v1/admin/*` exigem header `X-Admin-Token`
- Em `APP_ENV=dev` o token é opcional (ver `backend/app/core/admin_auth.py`)
- Autenticação de usuários finais via Supabase Auth (ainda não implementada no frontend)

### Banco de dados (schemas versionados)

Os scripts SQL em `backend/db/` devem ser aplicados em ordem no Supabase:

| Arquivo | O que adiciona |
|---|---|
| `schema_v1.sql` | Tabelas base multi-tenant |
| `schema_v2_supabase_admin.sql` | RLS, `tenant_users`, painel admin |
| `schema_v3_clientes_validade.sql` | `clientes` e `clientes_licencas` (gestão comercial) |
| `schema_v4_fornecedor_notas.sql` | Notas e campos extras de fornecedor |

### Tabelas principais

- `tenants` — clientes da plataforma (quem paga o SaaS)
- `fornecedores` — fornecedores do tenant, com `frequencia_revisao` e `lead_time_entrega`
- `fornecedor_dias_compra` — dias da semana permitidos por fornecedor
- `agenda_ocorrencias` — trilha central de eventos (PENDENTE → REALIZADA/CANCELADA/ADIADA)
- `compradores` — usuários operacionais vinculados ao tenant

## Regras de Negócio Críticas

### Frequências válidas de revisão

| Valor | Dias de compra | Intervalo |
|---|---|---|
| 1 | 1 dia | 28 dias (mensal) |
| 2 | 1 dia | 14 dias (quinzenal) |
| 4 | 1 dia | 7 dias (semanal) |
| 8 | 2 dias | próximo dia permitido |
| 12 | 3 dias | próximo dia permitido |

A quantidade de dias em `fornecedor_dias_compra` deve bater com a frequência. Validar antes de salvar.

### Algoritmo de sugestão de próxima data (`sugerir_proxima_data_ocorrencia`)

- Frequência 1/2/4: `data_base + intervalo`, depois ajusta para o próximo dia permitido
- Frequência 8/12: varre dias futuros até encontrar um que caia em dia permitido

### Tratamento de ocorrência (`tratar_ocorrencia`)

Executado em transação única:
1. Atualiza ocorrência atual → REALIZADA + `data_realizacao` + `observacao`
2. Calcula próxima data via sugestão (ou usa parâmetro explícito)
3. Verifica idempotência: se já existe pendência do mesmo fornecedor naquela data, não cria duplicata
4. Cria nova ocorrência PENDENTE

Esta lógica está em `backend/app/services/agenda_service.py` e é o núcleo portado do desktop. Não alterar sem revisar o comportamento original.

## Variáveis de Ambiente

Copiar `backend/.env.example` para `backend/.env` e preencher:

```
DATABASE_URL=postgresql+psycopg://...   # Supabase ou PostgreSQL local
ADMIN_API_TOKEN=...                     # token secreto para rotas admin
SUPABASE_URL=...                        # opcional para dev local
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_ENV=dev                             # "dev" desativa auth obrigatória
```

## Frontends

Ambos os frontends são HTML5/JS/CSS vanilla sem build step. Sem bundler, sem framework.

- **`frontend/`** — portal operacional do cliente. Ainda usa dados mockados em `script.js`; integração com API real é próximo passo
- **`frontend_admin/`** — painel SaaS para gerenciar tenants; endpoints admin já prontos no backend
- **`versao_teste/`** — referência de comportamento esperado; útil para validar UX antes de integrar API

## Roadmap em Andamento

### Próximos passos imediatos
1. Integrar `frontend/` com a API real (substituir dados mockados)
2. Implementar autenticação Supabase no frontend do cliente
3. Conectar `frontend_admin/` aos endpoints `/api/v1/admin/clientes`

### Auditoria Ativa com IA (backlog documentado em `docs/auditoria_ativa_ia.md`)

Evolução planejada em 4 fases:
1. **Fase 1** — fortalecer trilha auditável (enriquecer `agenda_ocorrencias` com metadados)
2. **Fase 2** — auditoria ativa por regras (scores de risco, alertas determinísticos)
3. **Fase 3** — auditoria preditiva (ML com scikit-learn, Polars para features)
4. **Fase 4** — IA generativa explicativa (OpenAI para conclusões executivas)

Stack recomendada para auditoria: Polars, DuckDB, scikit-learn, OpenAI API, Supabase Edge Functions.

Novos módulos planejados em `backend/app/services/`: `auditoria_ativa_service.py`, `auditoria_features_service.py`, `auditoria_recomendacao_service.py`, `auditoria_ai_service.py`.

Novos endpoints planejados: `GET /api/v1/auditoria/resumo|riscos|recomendacoes`.

## Convenções

- Todo endpoint que acessa dados de negócio recebe `tenant_id` — nunca assumir contexto implícito
- SQL raw com `sqlalchemy.text()` é o padrão atual; não introduzir ORM declarativo sem alinhamento
- Schemas Pydantic em `backend/app/schemas/` são os contratos de entrada/saída — mantê-los separados dos modelos de banco
- Migrations são scripts SQL versionados manualmente em `backend/db/`; não usar Alembic
