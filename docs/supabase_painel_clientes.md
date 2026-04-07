# Supabase e Painel de Clientes

## Objetivo

Alinhar a Agenda de Compras Web ao modelo definido para producao:

- Supabase como banco PostgreSQL e autenticacao
- isolamento por cliente com `tenant_id`
- painel administrativo para gerenciar clientes
- agenda operacional rodando dentro do contexto do cliente logado

## Estrutura proposta

### 1. Cliente

A tabela `tenants` representa cada cliente da plataforma.

Campos recomendados:

- `id`
- `nome`
- `slug`
- `status`
- `plano`
- `contato_nome`
- `contato_email`
- `observacoes`
- `created_at`
- `updated_at`

### 2. Usuarios do cliente

A tabela `tenant_users` faz o vinculo entre `auth.users` do Supabase e os clientes:

- `tenant_id`
- `user_id`
- `role`
- `ativo`

Papeis sugeridos:

- `owner`
- `admin`
- `buyer`
- `viewer`

### 3. Dados operacionais

As tabelas de negocio continuam com `tenant_id`:

- `compradores`
- `fornecedores`
- `fornecedor_dias_compra`
- `agenda_ocorrencias`
- `regras_agenda_fornecedor`

## Isolamento no Supabase

O isolamento deve ser garantido por RLS.

Regra central:

- o usuario so acessa registros do `tenant_id` ao qual pertence
- a `service_role` pode operar de forma global para tarefas administrativas

No projeto, isso ficou preparado no script [`backend/db/schema_v2_supabase_admin.sql`](c:/Users/andre/OneDrive/Área%20de%20Trabalho/Sistemas%20Python/Agenda%20de%20Compras%20Web/backend/db/schema_v2_supabase_admin.sql).

## Painel administrativo

O painel de clientes precisa oferecer pelo menos:

- listar clientes
- criar cliente
- editar nome, slug, status e plano
- visualizar indicadores basicos por cliente
- no passo seguinte, gerenciar usuarios vinculados ao cliente

Para apoiar isso, foram adicionados endpoints administrativos no backend:

- `GET /api/v1/admin/clientes`
- `GET /api/v1/admin/clientes/{tenant_id}`
- `POST /api/v1/admin/clientes`
- `PATCH /api/v1/admin/clientes/{tenant_id}`

Esses endpoints usam token administrativo via header `X-Admin-Token`.

## Fluxo alvo

### Painel global

- operador interno acessa painel administrativo
- backend usa credencial administrativa
- cria ou atualiza cliente
- vincula usuarios Supabase ao cliente

### Operacao do cliente

- usuario autentica no Supabase
- o backend identifica o tenant do usuario
- a agenda consulta e grava apenas dados daquele cliente

## Proximo passo recomendado

Depois desta fundacao, o passo natural e construir a interface web do painel de clientes e trocar o frontend mockado por chamadas reais a esses endpoints e ao contexto de autenticacao do Supabase.
