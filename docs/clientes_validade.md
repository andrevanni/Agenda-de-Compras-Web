# Clientes e Validade

## Revisao da definicao

Foi reintroduzida a separacao entre:

- `tenant`
  Base operacional usada pela agenda.
- `cliente`
  Cadastro comercial/administrativo.
- `licenca`
  Controle de validade da utilizacao da ferramenta.

## Tabelas novas

Script: [`backend/db/schema_v3_clientes_validade.sql`](c:/Users/andre/OneDrive/Área%20de%20Trabalho/Sistemas%20Python/Agenda%20de%20Compras%20Web/backend/db/schema_v3_clientes_validade.sql)

### `clientes`

- `tenant_id`
- `razao_social`
- `nome_fantasia`
- `documento`
- `email_responsavel`
- `telefone`
- `status`
- `observacoes`

### `clientes_licencas`

- `cliente_id`
- `plano`
- `limite_usuarios`
- `status`
- `data_inicio_vigencia`
- `data_fim_vigencia`
- `dias_aviso_vencimento`
- `bloqueado_manual`
- `motivo_bloqueio`

## Frontends separados

### Cliente

Pasta: [`frontend`](c:/Users/andre/OneDrive/Área%20de%20Trabalho/Sistemas%20Python/Agenda%20de%20Compras%20Web/frontend)

### Administrador

Pasta: [`frontend_admin`](c:/Users/andre/OneDrive/Área%20de%20Trabalho/Sistemas%20Python/Agenda%20de%20Compras%20Web/frontend_admin)
