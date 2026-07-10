# Aba "Outras Atividades" na Auditoria — Design

**Data:** 2026-07-10
**Status:** Aprovado para implementação
**Escopo:** Frontend puro (`frontend/`). Sem backend, sem migration, sem query nova.

## Contexto e objetivo

Hoje a Auditoria (`<dialog id="auditModal">`, protegida por senha) cobre **exclusivamente** a Agenda de Compras — filtra `fornecedor_id` preenchido e **exclui** os compromissos genéricos. O usuário quer avaliar também essas "outras atividades" (tarefas fora da agenda de fornecedores), com uma visão rica em gráficos e contagem de tarefas, usando os dados da **Drogaria SV** (`tenant_id f0d557c6-9dd9-4e80-96e0-2094da4a40ff`) como modelo de validação.

Este spec cobre **apenas o dashboard (projeto A)**. O relatório PDF semanal para gestores (projeto B) será um spec separado, feito depois, reusando as funções de agregação criadas aqui.

## O que é uma "outra atividade" (compromisso genérico)

Discriminador já usado no código (`script_render.js:22`, `script_main.js:359`):

```js
const catAgendaId = state.categorias.find((c) => c.nome === "Agenda de Compras")?.id;
const ehGenerico = (occ) => !occ.fornecedor_id && occ.categoria_id !== catAgendaId;
```

Ou seja: `fornecedor_id` NULL **e** `categoria_id` diferente da categoria especial "Agenda de Compras". Cada genérico tem `categoria_id` (com cor/ícone), `comprador_id`, `data_prevista`, `data_realizacao`, `status`, `titulo`, `hora_inicio`/`hora_fim`.

## Fonte de dados (sem query nova)

Tudo já está carregado em `loadPortalData` (`script_data.js`):

- **Concluídas**: `state.auditOccurrences` com `status === "REALIZADA"`, `ehGenerico`, filtradas por `data_realizacao` dentro do período selecionado.
- **Pendentes / Atrasadas**: `state.agenda` (PENDENTES), `ehGenerico`.
  - **Atrasada** = `data_prevista < hoje`
  - **Pendente** = `data_prevista >= hoje`

**Regra de período (explícita na UI):** concluídas respeitam o filtro de período (por `data_realizacao`); pendentes/atrasadas são sempre o **retrato atual** (todas em aberto, independente do período), porque pendência é situação corrente, não histórica. Rotular na UI como "em aberto (situação atual)".

## Navegação — abas dentro do modal

O `auditModal` ganha um seletor de abas logo abaixo do título:

```
[ Agenda de Compras ]  [ Outras Atividades ]
```

- **Aba 1 "Agenda de Compras"**: todo o conteúdo atual do modal, embrulhado em `<div id="auditPaneAgenda">`. Comportamento inalterado.
- **Aba 2 "Outras Atividades"**: nova `<div id="auditPaneAtividades">`, renderizada pelo módulo novo.

Trocar de aba alterna a visibilidade dos panes e chama `renderAtividades()` ao ativar a aba 2. Mesma senha, mesmo modal — controle de acesso inalterado (visível a `admin_client` / `admin_portal`, atrás de `state.clientMeta.audit_password`).

## Módulo novo — `frontend/script_atividades.js`

Autocontido, seguindo o padrão testado do `script_eficiencia.js`:

- Constantes e estado no topo; instâncias de chart em módulo-nível.
- **Destruição de gráficos inline** antes de recriar (`_atDestroy(c)` = `if (c) { try { c.destroy(); } catch {} }`), igual à Eficiência (não usar o padrão global do `_destroyAuditCharts`).
- Reusa `state.agenda`, `state.auditOccurrences`, `state.buyers`, `state.categorias` — **sem query nova**.

Funções (espelhando a Eficiência):

- `getAtividadesRange()` — parseia o preset de período (`(\d+)dias` + entre datas).
- `syncAtividadesPeriodInputs()` — sincroniza inputs de data.
- `_populateAtBuyerFilter()` / `_populateAtCategoriaFilter()` — popula selects de comprador e categoria.
- `computeAtividades(range)` — filtra genéricos, classifica concluída/pendente/atrasada, agrega por categoria e por comprador, monta tendência semanal; devolve `{ kpis, catRows, buyerRows, tendencia, tarefas }`.
- `renderAtividades()` — orquestra: sync → popula filtros → range → compute → guarda `_atLastRows/_atLastRange` → render KPIs, charts, drill.
- `_renderAtKpis()`, `_renderAtCharts()`, `_renderAtDrill()`.
- `exportAtividadesToExcel()` — 3 abas via SheetJS.

## Filtros

Barra no mesmo padrão `.audit-filter-bar`:

- **Período**: 30 / 60 / 90 / 120 / 180 dias + entre datas (default 90, com `selected`).
- **Comprador**: todos / por comprador.
- **Categoria**: todas / por categoria (substitui o filtro de fornecedor, que aqui não se aplica).

## KPIs (topo — `kpi-grid`)

`Total no período` · `Concluídas` · `Pendentes` · `Atrasadas` · `Taxa de conclusão %` · `Nº de categorias ativas`

- Taxa de conclusão = Concluídas ÷ (Concluídas + Pendentes + Atrasadas), sobre o conjunto exibido.

## Gráficos (Chart.js — cores reais das categorias)

1. **Rosca — por categoria** (`atChartCategoria`): contagem de tarefas por categoria; cada fatia usa a `cor` cadastrada da categoria (`state.categorias[].cor`), com fallback para paleta padrão se a cor faltar.
2. **Barras horizontais — por comprador** (`atChartComprador`): status empilhado (Concluída / Pendente / Atrasada) por comprador.
3. **Linha — tendência semanal** (`atChartTendencia`): tarefas concluídas por semana no período (agrupamento por semana ISO / segunda-a-domingo).

Cada canvas destruído com `_atDestroy` antes do `new Chart(...)`.

## Drill-down + Exportação

- `<details>` por **comprador** → `<details>` por **categoria** → tabela de tarefas: Título, Categoria (pill com cor), Data prevista, Data realização, Status, Horário.
- Botão **📤 Exportar Excel** — 3 abas: *Por Categoria*, *Por Comprador*, *Tarefas* (linha por tarefa com todos os campos).

## Wiring (index.html + script_data.js + showSection)

- Adicionar `<script src="script_atividades.js">` no `index.html` **antes** de `script_data.js` e `script_main.js` (mesma lição de ordem de scripts da Eficiência — referências no boot causam `ReferenceError` e abortam a carga se o módulo vier depois).
- HTML novo dentro do `auditModal`: barra de abas + `auditPaneAgenda` (embrulho do atual) + `auditPaneAtividades` (filtros, `kpi-grid`, 3 canvas, container de drill, botão export).
- Listeners (abas, presets, datas, filtros de comprador/categoria, refresh, export) registrados no bind central de `script_data.js`.
- `unlockAuditView()` (`script_forms.js`) continua abrindo na aba "Agenda de Compras" por padrão; a aba "Outras Atividades" só renderiza ao ser clicada.

## Regras obrigatórias do projeto (CLAUDE.md)

- **Bump do Service Worker**: `frontend/sw.js` `agenda-compras-v67 → v68`; incluir `script_atividades.js` na lista de ASSETS.
- **Nova entrada no menu "🆕 Versões"** nos DOIS arquivos sincronizados: `frontend/script_state.js` (topo do array `VERSOES`) e `backend/app/data/versoes.py`. Mesmo número do SW (v68). Notas em linguagem do usuário final, sem citar nomes reais.
- **Variáveis CSS**: usar apenas as existentes (`--panel-soft`, `--line`, `--panel`, `--text`, `--muted`); nunca inventar `--surface-alt`/`--border`/`--card-bg`.
- **Sem `id` duplicado** no HTML novo.

## Estratégia de teste

- Validação com dados reais da **Drogaria SV** via Playwright (chromium já instalado em scratchpad): carregar o portal, abrir Auditoria, trocar para a aba "Outras Atividades", conferir KPIs/gráficos/drill contra os compromissos genéricos concluídos e pendentes do tenant, ler `pageerror`/console pra pegar erro de runtime.
- Conferir que a aba "Agenda de Compras" (dashboard atual) permanece idêntica após o embrulho em `auditPaneAgenda`.
- Conferir tema claro e escuro.

## Fora de escopo (deste spec)

- Relatório PDF semanal para gestores (**projeto B** — spec próprio depois).
- Qualquer mudança no dashboard atual de Agenda de Compras além do embrulho em pane.
- Nova tabela/migration/backend.

## Riscos e mitigações

- **Ordem de scripts** → carregar `script_atividades.js` antes de data/main (mitigado no wiring).
- **Cache preso** → bump do SW + entrada de Versões; `/?limpar=1` é o reset nuclear se necessário.
- **Regressão na aba atual** → o embrulho em `auditPaneAgenda` não altera ids nem lógica; validar que o dashboard de fornecedores segue idêntico.
