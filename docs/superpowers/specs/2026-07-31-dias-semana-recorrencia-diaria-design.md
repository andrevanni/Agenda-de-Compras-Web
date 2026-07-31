# Dias da semana na recorrência diária — Design

**Data:** 2026-07-31
**Status:** Aprovado para implementação
**Escopo:** Frontend (`frontend/script_main.js`, `frontend/index.html`, `frontend/script_data.js`). Sem backend, sem migration.

## Contexto

Sugestão da compradora da **Total Socorro** (31/jul/2026, por áudio):

> "Teria como colocar nas tarefas diárias os dias da semana pra gente marcar os dias que a gente quer? Tem coisa que a gente faz todo dia, a gente coloca como tarefa diária e ele já coloca na agenda inclusive sábados e domingos. (…) Coisa que a gente faz só de segunda a quinta, por exemplo, a gente não consegue selecionar 'diária menos sexta'. Se a gente tivesse essa opção ajudaria bastante."

São dois pedidos na mesma frase: **não gerar fim de semana** e **poder escolher um subconjunto arbitrário** de dias (seg–qui, seg/qua/sex).

## Problema

`buildRecorrenciaDates` ([script_main.js:771](../../../frontend/script_main.js#L771)) avança por passo fixo de dias, sem nenhuma noção de dia da semana:

```js
const step = { diaria: 1, semanal: 7, quinzenal: 14, mensal: 30 }[tipo] ?? 7;
```

Recorrência **Diária** portanto gera todos os dias corridos, sábado e domingo incluídos, e não há workaround na UI.

O filtro de dias que existe em ⚙️ Configurações (`agenda_calendar_weekdays`) **não resolve**: ele só esconde colunas na visualização do calendário ([script_main.js:330](../../../frontend/script_main.js#L330)). A ocorrência continua existindo na lista de Compromissos, nos relatórios diário e semanal, e em todos os KPIs.

### Por que é mais que poluição visual

1. **Infla "Itens em Atraso"** — ocorrência de sábado/domingo que ninguém executa fica `PENDENTE` indefinidamente e entra na seção de atraso dos relatórios (a regra é `PENDENTE` com `data_prevista < próximo dia útil`). Uma rotina diária de 1 ano gera ~104 pendências fantasma.
2. **Derruba a taxa de conclusão** da aba Outras Atividades e os KPIs por comprador — o denominador conta dias que nunca seriam trabalhados.
3. **Volume de dados** — é o padrão já medido na Conviva Viana (3.950 ocorrências genéricas, ~11 rotinas diárias de um comprador indo até 06/2027). Cortar fim de semana tira ~28% das linhas de uma rotina diária; seg–qui tira ~43%.

## Decisões (aprovadas)

1. **Escopo = criação apenas.** O seletor vale para séries novas. As séries já criadas com fim de semana dentro são responsabilidade do usuário: apagar pelo escopo "Toda a série" (funcional desde a v75) e recriar. **Não** haverá ação automática de limpeza retroativa.
2. **Padrão Seg–Sex marcado.** Sábado e domingo vêm desmarcados; qualquer dia pode ser desmarcado individualmente (seg/qua/sex, seg–qui etc.). Isso muda o comportamento atual da Diária, e é intencional: resolve a dor mesmo para quem não reparar no controle novo. Quem trabalha sábado marca o checkbox.
3. **Data inicial fora dos dias marcados → pula para o próximo dia marcado.** A série nunca cria ocorrência em dia desmarcado. Uma prévia no modal mostra a data real de início e o volume antes de salvar.
4. **Feriados: checkbox opcional, desmarcado por padrão.** "Pular feriados nacionais" ao lado dos dias. Nada muda para quem não mexer; farmácia que abre em feriado simplesmente não marca.

### Fora de escopo (registrado, não implementado)

- Limpar sábados/domingos de séries **já existentes** (opção B da discussão: ação "remover fins de semana desta série").
- **Editar** os dias de uma série existente com reprocessamento das ocorrências (opção C).
- Dias da semana para os tipos Semanal / Quinzenal / Mensal — desnecessário: "Diária" com ter e qui marcados **já é** "toda terça e quinta".

## Desenho

### 1. Interface — modal Novo Evento

Bloco novo em [index.html](../../../frontend/index.html), logo abaixo do `<label id="newEventRecorrenciaWrap">` (linha ~1543) e antes de `newEventRecorrenciaFimWrap`:

```
Dias da semana
[✓ Seg] [✓ Ter] [✓ Qua] [✓ Qui] [✓ Sex] [ Sáb] [ Dom]
[ ] Pular feriados nacionais

📅 262 datas · 03/08/2026 → 03/08/2027
```

- `id="newEventDiasSemanaWrap"`, escondido por padrão (`class="hidden"`).
- 7 checkboxes `name="newEventDiaSemana"` com `value` = nome do dia em `DIAS_SEMANA` (`"SEGUNDA"` … `"DOMINGO"`, [script_state.js:1](../../../frontend/script_state.js#L1)) — **a convenção que o sistema já usa** nos dias de compra do fornecedor. Marcados por padrão: SEGUNDA a SEXTA.
- Markup espelha `renderSupplierDayCheckboxes` ([script_utils.js:618](../../../frontend/script_utils.js#L618)), que já popula o mesmo tipo de grid.
- Rótulos abreviados por extenso ("Seg", "Ter", …) — a apresentação difere do `value`, que fica no padrão do sistema. **Não** usar letra solta: "S/T/Q/Q/S/S/D" é ambíguo em português.
- Checkbox `id="newEventPularFeriados"`, desmarcado.
- Linha de prévia `id="newEventRecorrenciaPreview"`.
- Layout: **não** reusar `.checkbox-grid` como está — ela é `repeat(2, 1fr)` ([styles.css:724](../../../frontend/styles.css#L724)) e os 7 dias precisam fluir em linha. Usar classe própria (`.weekday-grid`) com `display:flex; flex-wrap:wrap` e, obrigatoriamente, `input { width: auto }` — o mesmo override da `.checkbox-grid`. ⚠️ A regra global `input, select, textarea { width: 100% }` do `styles.css` estica checkbox dentro de label flex; foi o bug corrigido na v76 e o `input[type="checkbox"] { width:auto }` global já adicionado lá cobre este caso, mas a classe deve declarar mesmo assim para não depender de ordem de cascata.

**Visibilidade:** o bloco aparece somente quando `newEventRecorrencia.value === "diaria"`, no mesmo listener que hoje mostra/esconde a data de fim ([script_data.js:525](../../../frontend/script_data.js#L525)).

**Modo edição:** permanece escondido junto com o resto da recorrência ([script_main.js:704](../../../frontend/script_main.js#L704)). Nenhuma mudança — coerente com a decisão 1.

**Reset:** `openNewEventModal` ([script_main.js:652](../../../frontend/script_main.js#L652)) volta os checkboxes ao padrão (Seg–Sex, feriados desmarcado) e esconde o bloco, junto com o reset que já faz do select de recorrência.

### 2. Prévia

Recalculada em `input`/`change` de: data, tipo de recorrência, dias da semana, pular feriados, data de fim. Formato:

```
📅 262 data(s) · 03/08/2026 → 03/08/2027
📅 253 data(s) · 03/08/2026 → 03/08/2027 · 9 feriado(s) pulado(s)
```

Casos especiais:

| Situação | Texto |
|---|---|
| Nenhum dia marcado | `Marque ao menos um dia da semana.` (em tom de alerta) |
| Data inválida / vazia | prévia oculta |
| Teto de 500 atingido | `500 datas (limite máximo) · … ` — o corte **não** pode ser silencioso |

A prévia conta **datas**, não ocorrências — a multiplicação por comprador continua sendo informada na mensagem de sucesso, como hoje. Isso evita acoplar a prévia ao grid de compradores.

### 3. Geração das datas

`buildRecorrenciaDates(baseDate, tipo, fimStr, opts)` ganha um quarto parâmetro opcional `{ dias: number[], pularFeriados: boolean }`, usado apenas quando `tipo === "diaria"`.

Comportamento para `diaria` com `dias` informado — **reusando `nextCalendarDate(baseDate, selectedDays, includeBase)`** ([script_utils.js:478](../../../frontend/script_utils.js#L478)), a mesma função que calcula o próximo dia permitido nos dias de compra do fornecedor:

1. Primeira data: `nextCalendarDate(baseDate, dias, true)` — inclui a base se ela cair em dia marcado, senão avança para o próximo marcado (é exatamente a decisão 3).
2. Datas seguintes: `nextCalendarDate(anterior, dias, false)` em laço, até passar de `fimStr` (ou `baseDate + 365 dias`).
3. Quando `pularFeriados`, a data é descartada se `isFeriado(data)` ([script_main.js:349](../../../frontend/script_main.js#L349)) — o laço apenas não a inclui e segue para a próxima.
4. Para em 500 datas (guarda existente, agora reportada na prévia).

⚠️ `nextCalendarDate` usa `new Date(\`${base}T12:00:00\`)` + `toISOString()`; o meio-dia local protege contra deslocamento de fuso em UTC-3. Não trocar por `T00:00:00`.

Os demais tipos (`semanal`, `quinzenal`, `mensal`) e a diária sem filtro mantêm exatamente a lógica de passo fixo atual.

**Mudança estrutural na chamada** ([script_main.js:885](../../../frontend/script_main.js#L885)): hoje a data base entra sempre, por fora da função —

```js
const dates = recorrencia ? [data, ...buildRecorrenciaDates(data, recorrencia, recFim)] : [data];
```

Para a diária com dias marcados, a lista passa a vir inteira da função (a data base entra pela varredura, sujeita ao mesmo filtro). É isso que faz a decisão 3 funcionar: sábado com seg–sex marcado não gera, e a série começa na segunda seguinte. Os outros ramos continuam usando a forma atual.

⚠️ `data_prevista` de cada linha já vem do laço (`{ ...base, data_prevista: d }`, linha 914), então nada mais precisa mudar no POST. A **nota** continua indo só na primeira ocorrência gerada (post-it, regra existente).

### 4. Persistência

A coluna `agenda_ocorrencias.recorrencia` é `JSONB` ([schema_v5:36](../../../backend/db/schema_v5_categorias_calendario.sql#L36)) — adicionar chaves é livre, **sem migration**:

```json
{ "tipo": "diaria", "fim": null, "dias": ["SEGUNDA","TERCA","QUARTA","QUINTA","SEXTA"], "pular_feriados": false }
```

Nada lê esse campo de volta hoje; é registro do que foi pedido. É também o que torna viável, no futuro, as opções B/C deixadas fora de escopo — sem ele não há como saber quais dias a série "deveria" ter.

Para recorrências não-diárias, o JSON continua com `{tipo, fim}` apenas.

### 5. Validações e bordas

| Caso | Comportamento |
|---|---|
| Nenhum dia marcado, tipo `diaria` | Bloqueia ao salvar, mensagem no feedback do modal. **Não** desabilitar o botão — erro explicado é melhor que botão morto. |
| Aviso de feriado na data escolhida | Passa a avaliar a **primeira data realmente gerada**, não a digitada — senão avisa sobre um feriado que nem será criado. |
| Conflito de horário | Continua sendo **uma** checagem só, mas sobre a **primeira data gerada** em vez da digitada — é ela que será criada. Não checar as 262 datas (262 requisições dentro do modal). |
| Filtro zera todas as datas (ex.: janela de 2 dias no fim de semana) | Prévia mostra `0 datas`; salvar bloqueia com mensagem. |

### 6. Impacto no código

| Arquivo | Mudança |
|---|---|
| [frontend/index.html](../../../frontend/index.html) | Bloco `newEventDiasSemanaWrap` (7 checkboxes + pular feriados + prévia) |
| [frontend/script_main.js](../../../frontend/script_main.js) | `buildRecorrenciaDates` com filtro de dias/feriados; `saveNewEvent` monta `dates`, valida e grava o JSON; `openNewEventModal` reseta; helper de prévia |
| [frontend/script_data.js](../../../frontend/script_data.js) | Listener de visibilidade do bloco + listeners que atualizam a prévia |
| [frontend/sw.js](../../../frontend/sw.js) | `agenda-compras-v76` → `v77` |
| [frontend/script_state.js](../../../frontend/script_state.js) + [backend/app/data/versoes.py](../../../backend/app/data/versoes.py) | Entrada `v77` em `VERSOES` (dois arquivos sincronizados), sem citar cliente ou pessoa |
| [frontend/index.html](../../../frontend/index.html) (Ajuda) | Linha sobre dias da semana na seção de Compromissos |

Efeito colateral positivo: a criação faz um POST por ocorrência, em série. Seg–sex corta ~28% das requisições de uma rotina diária de 1 ano (366 → 262).

## Plano de validação

Playwright local (receita da memória `playwright-local-validation`), antes do deploy:

1. **Regressão** — evento sem recorrência e recorrências semanal/quinzenal/mensal geram exatamente as mesmas datas de hoje.
2. **Padrão** — Diária a partir de uma quarta-feira, sem mexer nos checkboxes: nenhuma data em sábado ou domingo; prévia bate com o número de linhas criadas.
3. **Data inicial em dia desmarcado** — data num sábado com Seg–Sex: primeira ocorrência é a segunda seguinte; prévia mostra essa data.
4. **Subconjunto arbitrário** — seg/qua/sex e seg–qui: só os dias marcados aparecem.
5. **Nenhum dia marcado** — salvar bloqueado com mensagem; nada é gravado.
6. **Feriados** — com a opção ligada, nenhuma data cai em feriado do estado carregado; prévia informa a contagem pulada.
7. **Boot limpo** — sem `pageerror` no carregamento após as mudanças.

`node --check` nos arquivos JS alterados.

## Riscos e notas

- **Mudança de comportamento padrão** (decisão 2): quem hoje usa Diária esperando 7 dias vai passar a receber 5. É deliberado e visível no modal (checkboxes + prévia), mas merece uma linha clara na nota de versão.
- **Lista de feriados incompleta** — `state.feriados` traz feriados nacionais dos anos já importados via BrasilAPI. Uma série que cruza para um ano não importado pula menos feriados do que o usuário esperaria. A prévia mostra a contagem real, o que torna isso observável em vez de silencioso.
- **Séries antigas continuam poluídas** — decisão consciente. Se o retrabalho de recriar incomodar, a opção B (remover fins de semana de uma série existente) entra como segunda leva.
