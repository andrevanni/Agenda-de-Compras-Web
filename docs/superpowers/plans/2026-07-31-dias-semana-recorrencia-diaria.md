# Dias da semana na recorrência diária — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a recorrência **Diária** do modal "Novo Evento" gere ocorrências apenas nos dias da semana escolhidos (padrão segunda a sexta), com opção de pular feriados nacionais e prévia da quantidade de datas antes de salvar.

**Architecture:** Só frontend. A geração de datas reusa `nextCalendarDate()` de [script_utils.js](../../../frontend/script_utils.js) — o mesmo helper dos dias de compra do fornecedor — e a convenção `DIAS_SEMANA` / `DIAS_PYTHON` de [script_state.js](../../../frontend/script_state.js). O modal ganha um bloco de checkboxes que aparece só quando o tipo é "diaria"; `saveNewEvent` passa a calcular as datas antes dos avisos, porque a primeira ocorrência pode não ser a data digitada. Sem backend, sem migration (a coluna `recorrencia` já é JSONB).

**Tech Stack:** JavaScript sem build (arquivos globais carregados por `<script>`), HTML/CSS puro, Supabase REST via `fetchSupabase()`. Validação com Playwright (Python) contra um servidor estático local.

**Spec:** [docs/superpowers/specs/2026-07-31-dias-semana-recorrencia-diaria-design.md](../specs/2026-07-31-dias-semana-recorrencia-diaria-design.md)

## Global Constraints

- **Branch de trabalho:** `staging`. Não commitar em `main`.
- **Ordem dos `<script>` importa:** `script_state.js` → `script_utils.js` → `script_render.js` → `script_forms.js` → `script_eficiencia.js` → `script_atividades.js` → `script_data.js` → `script_main.js`. Uma função só pode ser referenciada no boot por arquivos carregados antes.
- **Bump obrigatório do Service Worker:** qualquer commit que altere JS ou CSS de `frontend/` exige `frontend/sw.js` `agenda-compras-v76` → `agenda-compras-v77`. Sem bump, o browser serve cache antigo.
- **`VERSOES` vive em DOIS arquivos sincronizados:** [frontend/script_state.js](../../../frontend/script_state.js) e [backend/app/data/versoes.py](../../../backend/app/data/versoes.py). Mesmo conteúdo, sintaxes diferentes.
- **NUNCA citar nome de cliente, fornecedor, comprador ou pessoa real** nas notas de versão. Usar "compradores relataram", "foi solicitado". As notas são lidas por usuários finais e enviadas por e-mail.
- **Variáveis CSS que NÃO existem** em `styles.css`: `--surface-alt`, `--border`, `--card-bg`. Usar `--panel-soft`, `--line`, `--panel`. Fallback hardcoded claro (ex.: `#f8fafc`) deixa texto ilegível no tema escuro.
- **Nunca reutilizar um `id` no HTML** — `document.getElementById` devolve sempre o primeiro elemento.
- **Escopo é só criação.** O modo edição (`newEventEditId` preenchido) não mostra nem aplica dias da semana. Nenhuma ocorrência já existente é alterada ou apagada por este plano.
- **Convenção de dias:** valores são os nomes de `DIAS_SEMANA` (`"SEGUNDA"`…`"DOMINGO"`), nunca índices numéricos.
- Teto de 500 datas por série (guarda já existente) — preservar.

---

## File Structure

| Arquivo | Responsabilidade nesta feature |
|---|---|
| [frontend/index.html](../../../frontend/index.html) | Bloco `newEventDiasSemanaWrap` no modal (linhas ~1551) + parágrafo na Ajuda (linha ~752) |
| [frontend/styles.css](../../../frontend/styles.css) | Classes `.weekday-grid`, `.weekday-extra`, `.weekday-preview` (após `.checkbox-grid`, linha ~740) |
| [frontend/script_main.js](../../../frontend/script_main.js) | `buildDiariaDates`, `renderNewEventDiasSemana`, `getNewEventDiasSemana`, `updateNewEventPreview`, ajustes em `openNewEventModal` / `openGenericEventDetail` / `saveNewEvent` |
| [frontend/script_data.js](../../../frontend/script_data.js) | Listeners de visibilidade e de atualização da prévia (`bindEvents`, linhas ~525) |
| [frontend/sw.js](../../../frontend/sw.js) | Bump de cache |
| [frontend/script_state.js](../../../frontend/script_state.js) + [backend/app/data/versoes.py](../../../backend/app/data/versoes.py) | Entrada `v77` |
| [CLAUDE.md](../../../CLAUDE.md) | Documentar a feature na seção "Modal Novo Evento / Edição" |

**Desvio consciente do spec:** o spec falava em dar um 4º parâmetro a `buildRecorrenciaDates`. O plano cria uma função separada `buildDiariaDates` porque os contratos de retorno são diferentes — `buildRecorrenciaDates` devolve as datas **sem** a base (o chamador faz `[data, ...build(...)]`) e a nova devolve a lista **completa**, já filtrada. Duas semânticas na mesma função seria armadilha para quem mexer depois.

---

## Setup do harness de validação (fazer uma vez, antes da Task 1)

Não há framework de testes no projeto. A validação é feita com Playwright contra o frontend servido localmente — é o padrão já usado neste repositório.

- [ ] **Setup 1: Subir o servidor estático (deixar rodando em background)**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web/frontend" && python3 -m http.server 8123
```

- [ ] **Setup 2: Criar o venv com Playwright no scratchpad**

O Chromium empacotado já está em `~/Library/Caches/ms-playwright/` — **não** rodar `playwright install`.

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && python3 -m venv pwenv && pwenv/bin/pip install -q playwright
```

- [ ] **Setup 3: Confirmar que a página carrega sem erro**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && pwenv/bin/python -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8123/index.html'); pg.wait_for_timeout(1500)
    print('pageerror:', errs)
    print('DIAS_SEMANA:', pg.evaluate('DIAS_SEMANA'))
    b.close()
"
```

Expected: `pageerror: []` e `DIAS_SEMANA: ['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO']`.

> Nos comandos das tasks seguintes, `$SP` = o caminho do scratchpad acima e `$PROJ` = `/Users/avj/Developer/Sistemas Python/Agenda de Compras Web`. Escreva os caminhos por extenso ao rodar.

---

### Task 1: Geração das datas (`buildDiariaDates`)

**Files:**
- Modify: `frontend/script_main.js:783` (logo após `buildRecorrenciaDates`)
- Test: `$SP/test_t1_datas.py` (criar)

**Interfaces:**
- Consumes: `nextCalendarDate(baseDate, selectedDays, includeBase)` ([script_utils.js:478](../../../frontend/script_utils.js#L478)), `addDaysLocalIso(isoDate, days)` ([script_utils.js:140](../../../frontend/script_utils.js#L140)), `isFeriado(dateIso)` ([script_main.js:349](../../../frontend/script_main.js#L349)), `DIAS_SEMANA` ([script_state.js:1](../../../frontend/script_state.js#L1)).
- Produces: `buildDiariaDates(baseDate: string, fimStr: string|null, dias: string[], pularFeriados?: boolean) -> string[]` — datas ISO `AAAA-MM-DD` em ordem crescente, **incluindo** a data base quando ela cair em dia marcado. Devolve `[]` se `dias` for vazio ou não contiver nome válido.

- [ ] **Step 1: Escrever o teste que falha**

Criar `$SP/test_t1_datas.py`. O esperado é calculado por um **oráculo independente em Python** (`datetime`), não por números escritos à mão:

```python
import sys
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

URL = "http://localhost:8123/index.html"
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe}"))
    if not cond:
        falhas.append(nome)

# Oráculo: varre dia a dia em Python. weekday(): 0=segunda ... 6=domingo,
# mesma convenção de DIAS_PYTHON no frontend.
def oraculo(base, fim, dias_idx, feriados=()):
    b = date.fromisoformat(base)
    lim = date.fromisoformat(fim) if fim else b + timedelta(days=365)
    out, cur = [], b
    while cur <= lim and len(out) < 500:
        if cur.weekday() in dias_idx and cur.isoformat() not in feriados:
            out.append(cur.isoformat())
        cur += timedelta(days=1)
    return out

SEG_A_SEX = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"]
IDX_SEG_A_SEX = {0, 1, 2, 3, 4}

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1200)

    def build(base, fim, dias, pular=False):
        return page.evaluate(
            "([b, f, d, x]) => buildDiariaDates(b, f, d, x)", [base, fim, dias, pular]
        )

    # 1) Semana cheia a partir de uma SEGUNDA (2026-08-03), fim numa SEXTA.
    got = build("2026-08-03", "2026-08-14", SEG_A_SEX)
    check("seg-sex a partir de segunda", got == oraculo("2026-08-03", "2026-08-14", IDX_SEG_A_SEX), got)

    # 2) Data base num SÁBADO (2026-08-01) -> série começa na segunda seguinte.
    got = build("2026-08-01", "2026-08-07", SEG_A_SEX)
    check("base em sabado pula pro proximo dia marcado",
          got == oraculo("2026-08-01", "2026-08-07", IDX_SEG_A_SEX) and got[0] == "2026-08-03", got)

    # 3) Subconjunto arbitrário: segunda, quarta e sexta.
    got = build("2026-08-03", "2026-08-14", ["SEGUNDA", "QUARTA", "SEXTA"])
    check("seg/qua/sex", got == oraculo("2026-08-03", "2026-08-14", {0, 2, 4}), got)

    # 4) Segunda a quinta (o caso "diária menos sexta" do pedido).
    got = build("2026-08-03", "2026-08-31", ["SEGUNDA", "TERCA", "QUARTA", "QUINTA"])
    check("seg-qui", got == oraculo("2026-08-03", "2026-08-31", {0, 1, 2, 3}), got)

    # 5) Sem data de fim -> horizonte de 365 dias.
    got = build("2026-08-03", "", SEG_A_SEX)
    check("sem fim usa 365 dias", got == oraculo("2026-08-03", None, IDX_SEG_A_SEX), len(got))

    # 6) Nenhum dia marcado / nome inválido -> lista vazia, sem travar.
    check("dias vazio", build("2026-08-03", "2026-08-14", []) == [], "esperado []")
    check("dia invalido", build("2026-08-03", "2026-08-14", ["SEGUNDA-FEIRA"]) == [], "esperado []")

    # 7) Feriado: 2026-09-07 é uma SEGUNDA.
    page.evaluate("(f) => { state.feriados = f.map((d) => ({ data: d, nome: 'Teste' })); }", ["2026-09-07"])
    com_pular = build("2026-09-01", "2026-09-11", SEG_A_SEX, True)
    sem_pular = build("2026-09-01", "2026-09-11", SEG_A_SEX, False)
    check("pularFeriados=True remove o feriado",
          com_pular == oraculo("2026-09-01", "2026-09-11", IDX_SEG_A_SEX, {"2026-09-07"}), com_pular)
    check("pularFeriados=False mantem o feriado",
          "2026-09-07" in sem_pular, sem_pular)

    check("sem pageerror", erros == [], erros)
    browser.close()

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && pwenv/bin/python test_t1_datas.py
```

Expected: falha em todos os casos com `buildDiariaDates is not defined`.

- [ ] **Step 3: Implementar**

Em [frontend/script_main.js](../../../frontend/script_main.js), **logo após** o fechamento de `buildRecorrenciaDates` (linha 783, antes de `async function saveNewEvent()`):

```js
// Recorrência diária restrita a dias da semana. Foi solicitado por compradores:
// a diária gerava sábado e domingo (ocorrência que ninguém trata vira pendência
// eterna nos "Itens em Atraso") e não havia como pedir "diária menos sexta".
// Reusa nextCalendarDate — o mesmo helper dos dias de compra do fornecedor.
// ATENÇÃO: diferente de buildRecorrenciaDates, esta função JÁ INCLUI a data base
// na varredura. Se a base cair em dia desmarcado (ex.: sábado com Seg–Sex), a
// série começa no próximo dia marcado em vez de nascer num dia desmarcado.
function buildDiariaDates(baseDate, fimStr, dias, pularFeriados = false) {
  if (!baseDate || !Array.isArray(dias)) return [];
  // Filtrar nomes inválidos é obrigatório: nextCalendarDate entra em laço
  // infinito se nenhum dia da semana for reconhecido.
  const validos = dias.filter((dia) => DIAS_SEMANA.includes(dia));
  if (!validos.length) return [];
  const limit = fimStr ? fimStr : addDaysLocalIso(baseDate, 365);
  const dates = [];
  let current = nextCalendarDate(baseDate, validos, true);
  while (current <= limit && dates.length < 500) {
    if (!(pularFeriados && isFeriado(current))) dates.push(current);
    current = nextCalendarDate(current, validos, false);
  }
  return dates;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && pwenv/bin/python test_t1_datas.py
```

Expected: todas as linhas `OK`, `FALHAS: nenhuma`, exit 0.

- [ ] **Step 5: Checar sintaxe e commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && node --check frontend/script_main.js && git add frontend/script_main.js && git commit -m "feat(recorrencia): buildDiariaDates gera datas só nos dias da semana escolhidos

Reusa nextCalendarDate (mesmo helper dos dias de compra do fornecedor) e
inclui a data base na varredura: base em dia desmarcado começa a série no
próximo dia marcado. Filtra nomes inválidos porque nextCalendarDate entra
em laço infinito sem nenhum dia reconhecido.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Bloco de dias da semana no modal (HTML + CSS + render + reset)

**Files:**
- Modify: `frontend/index.html:1551` (entre o `</label>` de `newEventRecorrenciaWrap` e `newEventRecorrenciaFimWrap`)
- Modify: `frontend/styles.css:740` (após `.checkbox-grid input { width: auto; }`)
- Modify: `frontend/script_main.js` (novas funções + `openNewEventModal:669` + `openGenericEventDetail:705` + `bootstrap:1069`)
- Test: `$SP/test_t2_ui.py` (criar)

**Interfaces:**
- Consumes: `DIAS_SEMANA` ([script_state.js:1](../../../frontend/script_state.js#L1)).
- Produces: `renderNewEventDiasSemana(selected?: string[]) -> void` (default = seg a sex); `getNewEventDiasSemana() -> string[]`; constantes `DIAS_SEMANA_LABEL_CURTO` e `DIAS_SEMANA_PADRAO_DIARIA`; ids `newEventDiasSemanaWrap`, `newEventDiasSemana`, `newEventPularFeriados`, `newEventRecorrenciaPreview`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `$SP/test_t2_ui.py`:

```python
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8123/index.html"
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe}"))
    if not cond:
        falhas.append(nome)

SEG_A_SEX = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1200)

    check("id newEventDiasSemana e unico",
          page.evaluate("document.querySelectorAll('#newEventDiasSemana').length") == 1)
    check("bloco nasce escondido",
          page.evaluate("document.getElementById('newEventDiasSemanaWrap').classList.contains('hidden')"))

    # Abrir o modal em modo criação
    page.evaluate("() => openNewEventModal('2026-08-03')")
    page.wait_for_timeout(200)

    valores = page.evaluate(
        "[...document.querySelectorAll('input[name=\"newEventDiaSemana\"]')].map((c) => c.value)")
    check("7 checkboxes na convencao DIAS_SEMANA", valores == page.evaluate("DIAS_SEMANA"), valores)

    marcados = page.evaluate("getNewEventDiasSemana()")
    check("padrao seg a sex", marcados == SEG_A_SEX, marcados)
    check("pular feriados desmarcado",
          page.evaluate("document.getElementById('newEventPularFeriados').checked") is False)

    # Guarda de regressão do bug v76: input {width:100%} esticava checkbox.
    largura = page.evaluate(
        "document.querySelector('#newEventDiasSemana input').getBoundingClientRect().width")
    check("checkbox nao estica (bug v76)", largura < 30, f"{largura}px")

    # Sujar a seleção e reabrir: tem de voltar ao padrão.
    page.evaluate("""() => {
      document.querySelector('input[name="newEventDiaSemana"][value="DOMINGO"]').checked = true;
      document.querySelector('input[name="newEventDiaSemana"][value="SEGUNDA"]').checked = false;
      document.getElementById('newEventPularFeriados').checked = true;
      closeModal('newEventModal');
      openNewEventModal('2026-08-03');
    }""")
    page.wait_for_timeout(200)
    check("reabrir o modal reseta os dias", page.evaluate("getNewEventDiasSemana()") == SEG_A_SEX)
    check("reabrir o modal reseta pular feriados",
          page.evaluate("document.getElementById('newEventPularFeriados').checked") is False)

    # Modo edição não mostra dias da semana (escopo do spec: só criação).
    page.evaluate("""() => {
      closeModal('newEventModal');
      openGenericEventDetail({ id: 'occ-1', titulo: 'Teste', data_prevista: '2026-08-03' });
    }""")
    page.wait_for_timeout(200)
    check("modo edicao esconde o bloco",
          page.evaluate("document.getElementById('newEventDiasSemanaWrap').classList.contains('hidden')"))

    check("sem pageerror", erros == [], erros)
    browser.close()

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && pwenv/bin/python test_t2_ui.py
```

Expected: falha logo no primeiro check (`querySelectorAll('#newEventDiasSemana').length` = 0).

- [ ] **Step 3: Adicionar o bloco no HTML**

Em [frontend/index.html](../../../frontend/index.html), entre o `</label>` que fecha `newEventRecorrenciaWrap` (linha 1551) e o `<label id="newEventRecorrenciaFimWrap"` (linha 1552):

```html
          <div id="newEventDiasSemanaWrap" class="hidden" style="grid-column:1/-1">
            <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Dias da semana</span>
            <div id="newEventDiasSemana" class="weekday-grid"></div>
            <label class="weekday-extra"><input type="checkbox" id="newEventPularFeriados"> Pular feriados nacionais</label>
            <div id="newEventRecorrenciaPreview" class="weekday-preview"></div>
          </div>
```

- [ ] **Step 4: Adicionar o CSS**

Em [frontend/styles.css](../../../frontend/styles.css), logo após o bloco `.checkbox-grid input { width: auto; }` (linha 740):

```css
/* Dias da semana da recorrência diária. Não reusa .checkbox-grid porque
   aquela é grid de 2 colunas — aqui os 7 dias fluem em linha. O width:auto
   é obrigatório: a regra global input{width:100%} estica o checkbox. */
.weekday-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 6px;
}

.weekday-grid label,
.weekday-extra {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 13px;
}

.weekday-grid input,
.weekday-extra input {
  width: auto;
}

.weekday-extra {
  margin-top: 8px;
}

.weekday-preview {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
  min-height: 16px;
}

.weekday-preview.alerta {
  color: #ef4444;
}
```

- [ ] **Step 5: Adicionar as funções em `script_main.js`**

Logo **antes** de `function openNewEventModal(...)` (linha 652):

```js
const DIAS_SEMANA_LABEL_CURTO = { SEGUNDA: "Seg", TERCA: "Ter", QUARTA: "Qua", QUINTA: "Qui", SEXTA: "Sex", SABADO: "Sáb", DOMINGO: "Dom" };
const DIAS_SEMANA_PADRAO_DIARIA = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"];

// Espelha renderSupplierDayCheckboxes (script_utils.js) — mesma convenção de
// value; o rótulo é abreviado porque são 7 controles numa linha só.
function renderNewEventDiasSemana(selected = DIAS_SEMANA_PADRAO_DIARIA) {
  const wrap = document.getElementById("newEventDiasSemana");
  if (!wrap) return;
  wrap.innerHTML = DIAS_SEMANA.map((dia) => `
    <label><input type="checkbox" name="newEventDiaSemana" value="${dia}" ${selected.includes(dia) ? "checked" : ""}> ${DIAS_SEMANA_LABEL_CURTO[dia]}</label>
  `).join("");
}

function getNewEventDiasSemana() {
  return [...document.querySelectorAll('input[name="newEventDiaSemana"]:checked')].map((cb) => cb.value);
}
```

- [ ] **Step 6: Ligar o reset e a visibilidade**

Em `openNewEventModal`, logo após a linha `document.getElementById("newEventRecorrenciaFimWrap").classList.add("hidden");` (linha 669):

```js
  document.getElementById("newEventDiasSemanaWrap").classList.add("hidden");
  document.getElementById("newEventPularFeriados").checked = false;
  renderNewEventDiasSemana();
```

Em `openGenericEventDetail`, logo após `document.getElementById("newEventRecorrenciaFimWrap").classList.add("hidden");` (linha 705):

```js
  document.getElementById("newEventDiasSemanaWrap").classList.add("hidden");
```

No `bootstrap`, logo após `renderSupplierDayCheckboxes([]);` (linha 1069) — garante que os checkboxes existem antes da primeira abertura do modal:

```js
  renderNewEventDiasSemana();
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && pwenv/bin/python test_t2_ui.py
```

Expected: todas `OK`, `FALHAS: nenhuma`, exit 0.

- [ ] **Step 8: Checar sintaxe e commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && node --check frontend/script_main.js && git add frontend/index.html frontend/styles.css frontend/script_main.js && git commit -m "feat(recorrencia): bloco de dias da semana no modal Novo Evento

Checkboxes com a convenção DIAS_SEMANA (mesma dos dias de compra do
fornecedor), seg a sex marcados por padrão, mais a opção de pular feriados.
Aparece só em modo criação; o modo edição segue escondendo a recorrência.
CSS próprio com width:auto no checkbox — a regra global input{width:100%}
estica o controle (bug corrigido no v76).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Prévia de datas e listeners

**Files:**
- Modify: `frontend/script_main.js` (nova `updateNewEventPreview` + chamada no reset de `openNewEventModal`)
- Modify: `frontend/script_data.js:525-529` (dentro de `bindStaticEvents`)
- Test: `$SP/test_t3_preview.py` (criar)

**Interfaces:**
- Consumes: `buildDiariaDates` (Task 1), `getNewEventDiasSemana` (Task 2), `brToIso` ([script_utils.js:121](../../../frontend/script_utils.js#L121)), `formatDate` ([script_utils.js:110](../../../frontend/script_utils.js#L110)).
- Produces: `updateNewEventPreview() -> void`, que escreve em `#newEventRecorrenciaPreview`.

⚠️ A função de listeners chama-se **`bindStaticEvents`** ([script_data.js:356](../../../frontend/script_data.js#L356)), não `bindEvents` como diz o CLAUDE.md. Ela roda em `bootstrap` na linha 1071, antes do gate de sessão.

- [ ] **Step 1: Escrever o teste que falha**

Criar `$SP/test_t3_preview.py`:

```python
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8123/index.html"
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe}"))
    if not cond:
        falhas.append(nome)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1200)

    page.evaluate("() => openNewEventModal('2026-08-03')")
    page.wait_for_timeout(200)

    def preview():
        return page.evaluate("document.getElementById('newEventRecorrenciaPreview').textContent")

    # Sem recorrência diária, a prévia fica vazia.
    check("previa vazia sem recorrencia", preview().strip() == "", preview())

    # Trocar para diária DISPARA o evento change de verdade (testa o listener).
    page.select_option("#newEventRecorrencia", "diaria")
    page.wait_for_timeout(200)
    check("bloco aparece ao escolher diaria",
          page.evaluate("!document.getElementById('newEventDiasSemanaWrap').classList.contains('hidden')"))

    esperado = page.evaluate(
        "buildDiariaDates('2026-08-03', '', ['SEGUNDA','TERCA','QUARTA','QUINTA','SEXTA'], false)")
    texto = preview()
    check("previa mostra a contagem", f"{len(esperado)} data" in texto, texto)
    check("previa mostra a primeira data", "03/08/2026" in texto, texto)

    # Desmarcar todos -> mensagem de alerta.
    page.evaluate("""() => {
      document.querySelectorAll('input[name="newEventDiaSemana"]').forEach((c) => { c.checked = false; });
      document.getElementById('newEventDiasSemana').dispatchEvent(new Event('change', { bubbles: true }));
    }""")
    page.wait_for_timeout(200)
    check("nenhum dia marcado alerta", "ao menos um dia" in preview(), preview())
    check("classe de alerta aplicada",
          page.evaluate("document.getElementById('newEventRecorrenciaPreview').classList.contains('alerta')"))

    # Marcar um dia real pelo clique (evento nativo) e conferir a atualização.
    page.check('input[name="newEventDiaSemana"][value="QUARTA"]')
    page.wait_for_timeout(200)
    so_quarta = page.evaluate("buildDiariaDates('2026-08-03', '', ['QUARTA'], false)")
    check("clique no checkbox atualiza a previa", f"{len(so_quarta)} data" in preview(), preview())

    # Data de fim reduz a contagem (testa o listener do campo de fim).
    page.fill("#newEventRecorrenciaFim", "31/08/2026")
    page.wait_for_timeout(200)
    com_fim = page.evaluate("buildDiariaDates('2026-08-03', '2026-08-31', ['QUARTA'], false)")
    check("data de fim reduz a previa",
          len(com_fim) < len(so_quarta) and f"{len(com_fim)} data" in preview(), preview())

    check("sem pageerror", erros == [], erros)
    browser.close()

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && pwenv/bin/python test_t3_preview.py
```

Expected: falha em "bloco aparece ao escolher diaria" e nos checks de prévia.

- [ ] **Step 3: Implementar `updateNewEventPreview`**

Em [frontend/script_main.js](../../../frontend/script_main.js), logo após `getNewEventDiasSemana` (Task 2):

```js
// Mostra, antes de salvar, quantas ocorrências a série vai criar e o período
// coberto. Importante porque a 1ª data pode não ser a digitada (base em dia
// desmarcado avança para o próximo dia marcado) e porque o volume de uma
// rotina diária de 1 ano não é óbvio.
function updateNewEventPreview() {
  const el = document.getElementById("newEventRecorrenciaPreview");
  if (!el) return;
  el.classList.remove("alerta");
  const tipo = document.getElementById("newEventRecorrencia").value;
  if (tipo !== "diaria") {
    el.textContent = "";
    return;
  }
  const data = brToIso(document.getElementById("newEventData").value);
  const fim = brToIso(document.getElementById("newEventRecorrenciaFim").value);
  const dias = getNewEventDiasSemana();
  const pular = document.getElementById("newEventPularFeriados").checked;
  if (!data) {
    el.textContent = "";
    return;
  }
  if (!dias.length) {
    el.textContent = "Marque ao menos um dia da semana.";
    el.classList.add("alerta");
    return;
  }
  const dates = buildDiariaDates(data, fim, dias, pular);
  if (!dates.length) {
    el.textContent = "Nenhuma data no período — ajuste os dias da semana ou a data de fim.";
    el.classList.add("alerta");
    return;
  }
  let extra = "";
  if (pular) {
    const semPular = buildDiariaDates(data, fim, dias, false);
    const pulados = semPular.length - dates.length;
    // Com o teto de 500 batido, a diferença deixa de ser confiável.
    if (pulados > 0 && semPular.length < 500) extra = ` · ${pulados} feriado(s) pulado(s)`;
  }
  const limite = dates.length >= 500 ? " (limite máximo)" : "";
  el.textContent = `📅 ${dates.length} data(s)${limite} · ${formatDate(dates[0])} → ${formatDate(dates[dates.length - 1])}${extra}`;
}
```

- [ ] **Step 4: Chamar no reset do modal**

Em `openNewEventModal`, logo após `renderNewEventDiasSemana();` (adicionado na Task 2):

```js
  updateNewEventPreview();
```

- [ ] **Step 5: Substituir o listener de recorrência e adicionar os demais**

Em [frontend/script_data.js](../../../frontend/script_data.js), substituir o bloco das linhas 525-529:

```js
  document.getElementById("newEventRecorrencia")?.addEventListener("change", () => {
    const wrap = document.getElementById("newEventRecorrenciaFimWrap");
    const val = document.getElementById("newEventRecorrencia").value;
    wrap.classList.toggle("hidden", !val);
  });
```

por:

```js
  document.getElementById("newEventRecorrencia")?.addEventListener("change", () => {
    const val = document.getElementById("newEventRecorrencia").value;
    document.getElementById("newEventRecorrenciaFimWrap").classList.toggle("hidden", !val);
    document.getElementById("newEventDiasSemanaWrap").classList.toggle("hidden", val !== "diaria");
    updateNewEventPreview();
  });
  // Prévia acompanha tudo que muda o conjunto de datas. O listener no container
  // pega os 7 checkboxes por bubbling (eles são recriados a cada abertura).
  document.getElementById("newEventData")?.addEventListener("input", updateNewEventPreview);
  document.getElementById("newEventData")?.addEventListener("change", updateNewEventPreview);
  document.getElementById("newEventRecorrenciaFim")?.addEventListener("input", updateNewEventPreview);
  document.getElementById("newEventRecorrenciaFim")?.addEventListener("change", updateNewEventPreview);
  document.getElementById("newEventDiasSemana")?.addEventListener("change", updateNewEventPreview);
  document.getElementById("newEventPularFeriados")?.addEventListener("change", updateNewEventPreview);
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && pwenv/bin/python test_t3_preview.py
```

Expected: todas `OK`, `FALHAS: nenhuma`, exit 0.

- [ ] **Step 7: Rodar também os testes anteriores (não quebrar nada)**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && pwenv/bin/python test_t1_datas.py && pwenv/bin/python test_t2_ui.py
```

Expected: exit 0 nos dois.

- [ ] **Step 8: Checar sintaxe e commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && node --check frontend/script_main.js && node --check frontend/script_data.js && git add frontend/script_main.js frontend/script_data.js && git commit -m "feat(recorrencia): prévia de datas da recorrência diária

Mostra quantas ocorrências serão criadas e o período coberto antes de salvar,
com a primeira data já ajustada quando a base cai em dia desmarcado. Alerta
quando nenhum dia está marcado ou quando o filtro zera o período.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `saveNewEvent` — validação, datas e persistência

**Files:**
- Modify: `frontend/script_main.js:785-925` (`saveNewEvent`)
- Test: `$SP/test_t4_save.py` (criar)

**Interfaces:**
- Consumes: `buildDiariaDates` (Task 1), `getNewEventDiasSemana` (Task 2).
- Produces: nenhuma função nova. Passa a gravar `recorrencia` como `{"tipo":"diaria","fim":null|"AAAA-MM-DD","dias":["SEGUNDA",…],"pular_feriados":false}` nas séries diárias.

- [ ] **Step 1: Escrever o teste que falha**

Criar `$SP/test_t4_save.py`. Ele intercepta `fetchSupabase` e inspeciona os POSTs — nada vai para o Supabase:

```python
import json
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8123/index.html"
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe}"))
    if not cond:
        falhas.append(nome)

STUBS = """() => {
  window.__posts = [];
  window.fetchSupabase = async (path, opts) => { window.__posts.push({ path, body: opts && opts.body }); return []; };
  window.checkEventConflict = async () => false;
  window.loadPortalData = async () => {};
  window.refreshCalendar = () => {};
  window.closeModal = () => {};
  window.getSettings = () => ({ tenantId: 'tenant-teste', loggedBuyerId: '', activeBuyerId: '', duracaoPadraoCompromissos: 30 });
}"""

def preencher(page, data_br, fim_br, dias, nota="Post-it"):
    page.evaluate("""([dataBr, fimBr, dias, nota]) => {
      renderNewEventDiasSemana(dias);
      document.getElementById('newEventEditId').value = '';
      document.getElementById('newEventTitulo').value = 'Conferencia de validade';
      document.getElementById('newEventData').value = dataBr;
      document.getElementById('newEventRecorrencia').value = 'diaria';
      document.getElementById('newEventRecorrenciaFim').value = fimBr;
      document.getElementById('newEventHoraInicio').value = '08:00';
      document.getElementById('newEventHoraFim').value = '08:30';
      document.getElementById('newEventObservacao').value = '';
      document.getElementById('newEventNota').value = nota;
      document.getElementById('newEventPularFeriados').checked = false;
      window.__posts = [];
    }""", [data_br, fim_br, dias, nota])

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1200)
    page.evaluate(STUBS)

    # Data base num SÁBADO (01/08/2026) com seg a sex marcado.
    preencher(page, "01/08/2026", "07/08/2026", ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"])
    page.evaluate("() => saveNewEvent()")
    posts = page.evaluate("window.__posts")
    datas = [pt["body"]["data_prevista"] for pt in posts]

    check("uma requisicao por data util", datas == ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"], datas)
    check("nada no fim de semana", all(d not in ("2026-08-01", "2026-08-02") for d in datas), datas)

    rec = json.loads(posts[0]["body"]["recorrencia"])
    check("json guarda os dias", rec.get("dias") == ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"], rec)
    check("json guarda pular_feriados", rec.get("pular_feriados") is False, rec)
    check("json mantem tipo e fim", rec.get("tipo") == "diaria" and rec.get("fim") == "2026-08-07", rec)

    serie = {pt["body"]["serie_id"] for pt in posts}
    check("serie_id unico para toda a serie", len(serie) == 1 and next(iter(serie)), serie)

    notas = [pt["body"]["nota"] for pt in posts]
    check("nota so na primeira ocorrencia", notas[0] == "Post-it" and set(notas[1:]) == {None}, notas)

    # Nenhum dia marcado -> não grava nada e avisa.
    preencher(page, "03/08/2026", "07/08/2026", [])
    page.evaluate("() => saveNewEvent()")
    check("sem dias marcados nao grava", page.evaluate("window.__posts.length") == 0)
    check("sem dias marcados avisa",
          "dia da semana" in page.evaluate("document.getElementById('newEventConflictWarning').textContent"),
          page.evaluate("document.getElementById('newEventConflictWarning').textContent"))

    # Evento avulso (sem recorrência) continua gravando 1 linha na data digitada.
    page.evaluate("""() => {
      document.getElementById('newEventRecorrencia').value = '';
      document.getElementById('newEventData').value = '05/08/2026';
      window.__posts = [];
    }""")
    page.evaluate("() => saveNewEvent()")
    posts = page.evaluate("window.__posts")
    check("evento avulso inalterado",
          len(posts) == 1 and posts[0]["body"]["data_prevista"] == "2026-08-05" and posts[0]["body"]["recorrencia"] is None,
          posts)

    # Recorrência semanal continua com o comportamento antigo (base + passos).
    page.evaluate("""() => {
      document.getElementById('newEventRecorrencia').value = 'semanal';
      document.getElementById('newEventData').value = '03/08/2026';
      document.getElementById('newEventRecorrenciaFim').value = '31/08/2026';
      window.__posts = [];
    }""")
    page.evaluate("() => saveNewEvent()")
    datas = [pt["body"]["data_prevista"] for pt in page.evaluate("window.__posts")]
    check("semanal inalterado",
          datas == ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"], datas)

    check("sem pageerror", erros == [], erros)
    browser.close()

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && pwenv/bin/python test_t4_save.py
```

Expected: falha em "uma requisicao por data util" — hoje a série nasce em 01/08 (sábado) e inclui o fim de semana.

- [ ] **Step 3: Ler os dias e a opção de feriado**

Em `saveNewEvent`, logo após `const recFim = brToIso(...)` (linha 794):

```js
  const diasSemana    = editId ? [] : getNewEventDiasSemana();
  const pularFeriados = !editId && document.getElementById("newEventPularFeriados").checked;
```

- [ ] **Step 4: Validar e calcular as datas antes dos avisos**

Logo após o bloco `if (!titulo || !data) { … return; }` (linha 804) e **antes** de `const feriadoWarningEl = …` (linha 806):

```js
  if (recorrencia === "diaria" && diasSemana.length === 0) {
    setFeedback("Marque ao menos um dia da semana para a recorrência diária.", "error", feedbackEl);
    feedbackEl.classList.remove("hidden");
    return;
  }

  // Datas calculadas ANTES dos avisos: com dias da semana marcados, a 1ª
  // ocorrência pode não ser a data digitada (sábado com Seg–Sex vira segunda),
  // e tanto o aviso de feriado quanto a checagem de conflito precisam olhar a
  // data que realmente será criada.
  const dates = recorrencia === "diaria"
    ? buildDiariaDates(data, recFim, diasSemana, pularFeriados)
    : recorrencia
      ? [data, ...buildRecorrenciaDates(data, recorrencia, recFim)]
      : [data];

  if (!dates.length) {
    setFeedback("Nenhuma data foi gerada com esses dias da semana. Ajuste os dias ou a data de fim.", "error", feedbackEl);
    feedbackEl.classList.remove("hidden");
    return;
  }
  const primeiraData = dates[0];
```

- [ ] **Step 5: Apontar aviso de feriado e conflito para a primeira data real**

Substituir as linhas 807-815 (o bloco do feriado e a checagem de conflito):

```js
  const feriadoNoDia = getFeriado(data);
  if (feriadoNoDia) {
    setFeedback(`⚠️ ${formatDate(data)} é feriado: "${feriadoNoDia.nome}". Revise a data antes de salvar.`, "warning", feriadoWarningEl);
```

por:

```js
  const feriadoNoDia = getFeriado(primeiraData);
  if (feriadoNoDia) {
    setFeedback(`⚠️ ${formatDate(primeiraData)} é feriado: "${feriadoNoDia.nome}". Revise a data antes de salvar.`, "warning", feriadoWarningEl);
```

e, na linha seguinte da checagem de conflito, trocar o 2º argumento `data` por `primeiraData`:

```js
  const hasConflict = await checkEventConflict(s.tenantId, primeiraData, horaInicio, horaFim, editId || null);
```

- [ ] **Step 6: Remover o cálculo duplicado e gravar o JSON completo**

Apagar a linha 885 (agora redundante — `dates` já existe no escopo):

```js
      const dates = recorrencia ? [data, ...buildRecorrenciaDates(data, recorrencia, recFim)] : [data];
```

E substituir a linha `recorrencia:` do objeto `base` (linha 903):

```js
        recorrencia: recorrencia ? JSON.stringify({ tipo: recorrencia, fim: recFim || null }) : null,
```

por:

```js
        recorrencia: recorrencia
          ? JSON.stringify({
              tipo: recorrencia,
              fim: recFim || null,
              // Nada lê esses campos de volta hoje; ficam registrados para uma
              // futura edição de dias da série.
              ...(recorrencia === "diaria" ? { dias: diasSemana, pular_feriados: pularFeriados } : {}),
            })
          : null,
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && pwenv/bin/python test_t4_save.py
```

Expected: todas `OK`, `FALHAS: nenhuma`, exit 0.

- [ ] **Step 8: Rodar a bateria inteira**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && for t in test_t1_datas.py test_t2_ui.py test_t3_preview.py test_t4_save.py; do echo "== $t"; pwenv/bin/python $t || exit 1; done
```

Expected: os quatro terminam com `FALHAS: nenhuma`.

- [ ] **Step 9: Checar sintaxe e commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && node --check frontend/script_main.js && git add frontend/script_main.js && git commit -m "feat(recorrencia): saveNewEvent respeita os dias da semana escolhidos

Datas passam a ser calculadas antes dos avisos, porque a primeira ocorrência
pode não ser a data digitada — aviso de feriado e checagem de conflito agora
olham a data que será criada de fato. O JSON de recorrência guarda os dias e
a opção de feriados. Sem dia marcado, bloqueia com mensagem.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Versão, Service Worker, Ajuda e documentação

**Files:**
- Modify: `frontend/sw.js:1`
- Modify: `frontend/script_state.js` (topo do array `VERSOES`)
- Modify: `backend/app/data/versoes.py` (topo da lista `VERSOES`)
- Modify: `frontend/index.html:752` (Ajuda) 
- Modify: `CLAUDE.md` (seção "Modal Novo Evento / Edição")
- Test: `$SP/test_t5_smoke.py` (criar)

**Interfaces:**
- Consumes: `VERSOES` ([script_state.js](../../../frontend/script_state.js)) — o rodapé lê `VERSOES[0].versao`.
- Produces: nada consumido por outra task.

- [ ] **Step 1: Escrever o teste que falha**

Criar `$SP/test_t5_smoke.py`:

```python
import re
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8123/index.html"
PROJ = "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web"
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe}"))
    if not cond:
        falhas.append(nome)

sw = open(f"{PROJ}/frontend/sw.js", encoding="utf-8").read()
check("service worker bumpado para v77", "agenda-compras-v77" in sw)

py = open(f"{PROJ}/backend/app/data/versoes.py", encoding="utf-8").read()
check("versoes.py com a entrada v77", '"versao": "v77"' in py)

# As notas não podem citar cliente/pessoa (elas vão por e-mail a terceiros).
bloco = py[py.index('"versao": "v77"'):py.index('"versao": "v76"')]
proibidos = ["Luana", "Total Socorro", "Conviva", "Drogaria", "Velanes", "Service Farma"]
achados = [p for p in proibidos if p.lower() in bloco.lower()]
check("notas sem nome de cliente ou pessoa", not achados, achados)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    page.goto(URL)
    page.wait_for_timeout(1500)

    check("boot sem erro", erros == [], erros)
    check("VERSOES[0] e a v77", page.evaluate("VERSOES[0].versao") == "v77",
          page.evaluate("VERSOES[0].versao"))
    check("rodape mostra a v77",
          "v77" in page.evaluate("document.getElementById('footerVersionChip').textContent"),
          page.evaluate("document.getElementById('footerVersionChip').textContent"))

    js_versoes = page.evaluate("JSON.stringify(VERSOES[0])")
    check("notas do JS iguais as do Python",
          all(nota in py for nota in page.evaluate("VERSOES[0].notas")), js_versoes)

    check("ajuda menciona os dias da semana",
          page.evaluate("document.body.innerHTML").count("Dias da semana") >= 2)
    browser.close()

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && pwenv/bin/python test_t5_smoke.py
```

Expected: falha em "service worker bumpado", "versoes.py com a entrada v77" e nos checks de rodapé.

- [ ] **Step 3: Bumpar o Service Worker**

Em [frontend/sw.js](../../../frontend/sw.js), linha 1:

```js
const CACHE = 'agenda-compras-v77';
```

- [ ] **Step 4: Adicionar a entrada v77 no `script_state.js`**

No topo do array `VERSOES` em [frontend/script_state.js](../../../frontend/script_state.js), antes da entrada `v76`:

```js
  {
    versao: "v77",
    dataHora: "31/07/2026 — tarde",
    notas: [
      "Ao criar um evento com repetição diária, agora dá para escolher em quais dias da semana ele acontece.",
      "Por padrão vêm marcados de segunda a sexta — sábados e domingos deixam de ser criados automaticamente. Quem trabalha no fim de semana é só marcar os dias.",
      "Dá para montar qualquer combinação: só segunda, quarta e sexta; de segunda a quinta; o que for a rotina.",
      "Uma opção adicional permite pular os feriados nacionais ao criar a série.",
      "Antes de salvar, a janela mostra quantas datas serão criadas e o período que elas cobrem.",
      "Vale para eventos criados de agora em diante; as repetições já existentes continuam como estão.",
    ],
  },
```

- [ ] **Step 5: Espelhar a entrada em `versoes.py`**

No topo da lista `VERSOES` em [backend/app/data/versoes.py](../../../backend/app/data/versoes.py), antes da entrada `v76` (mesmas notas, sintaxe Python):

```python
    {
        "versao": "v77",
        "dataHora": "31/07/2026 — tarde",
        "notas": [
            "Ao criar um evento com repetição diária, agora dá para escolher em quais dias da semana ele acontece.",
            "Por padrão vêm marcados de segunda a sexta — sábados e domingos deixam de ser criados automaticamente. Quem trabalha no fim de semana é só marcar os dias.",
            "Dá para montar qualquer combinação: só segunda, quarta e sexta; de segunda a quinta; o que for a rotina.",
            "Uma opção adicional permite pular os feriados nacionais ao criar a série.",
            "Antes de salvar, a janela mostra quantas datas serão criadas e o período que elas cobrem.",
            "Vale para eventos criados de agora em diante; as repetições já existentes continuam como estão.",
        ],
    },
```

- [ ] **Step 6: Atualizar a Ajuda do portal**

Em [frontend/index.html](../../../frontend/index.html), dentro do `<details>` "🗒️ Compromissos", logo após o `<p>Colunas: …</p>` (linha 752) e antes de `<h4>Concluir um compromisso (✓)</h4>`:

```html
                  <h4>Dias da semana na repeti&ccedil;&atilde;o di&aacute;ria</h4>
                  <p>Ao criar um evento com recorr&ecirc;ncia <strong>Di&aacute;ria</strong>, marque os <strong>dias da semana</strong> em que ele deve acontecer. Vêm marcados de <strong>segunda a sexta</strong>; sábados e domingos só entram se você marcar.</p>
                  <ul>
                    <li>Serve para qualquer combina&ccedil;&atilde;o &mdash; segunda a quinta, ou s&oacute; segunda, quarta e sexta</li>
                    <li>Se a data escolhida cair num dia desmarcado, a repeti&ccedil;&atilde;o come&ccedil;a no <strong>pr&oacute;ximo dia marcado</strong></li>
                    <li>A op&ccedil;&atilde;o <strong>Pular feriados nacionais</strong> deixa de fora os feriados do per&iacute;odo</li>
                    <li>Antes de salvar, a janela mostra <strong>quantas datas</strong> ser&atilde;o criadas e o per&iacute;odo coberto</li>
                  </ul>
                  <p>Vale para eventos novos. Uma repeti&ccedil;&atilde;o criada antes continua como est&aacute; &mdash; para trocar os dias, exclua a s&eacute;rie (op&ccedil;&atilde;o <em>Toda a s&eacute;rie</em>) e crie de novo.</p>
```

- [ ] **Step 7: Documentar no CLAUDE.md**

Na seção **"Modal Novo Evento / Edição"** de [CLAUDE.md](../../../CLAUDE.md), logo após a linha que começa com `- **Recorrência**: Diária, Semanal, Quinzenal, Mensal (só no modo criação)`, acrescentar:

```markdown
- **Dias da semana na Diária (v77 — 31/jul/2026)**: escolher a recorrência **Diária** revela `newEventDiasSemanaWrap` com 7 checkboxes (`name="newEventDiaSemana"`, valores de `DIAS_SEMANA`), **Seg–Sex marcados por padrão**, mais "Pular feriados nacionais" (desmarcado) e uma prévia de quantas datas serão criadas. `buildDiariaDates` ([script_main.js](frontend/script_main.js)) gera as datas reusando `nextCalendarDate` (o mesmo helper dos dias de compra do fornecedor) e **inclui a data base na varredura** — base em dia desmarcado faz a série começar no próximo dia marcado. Por isso `saveNewEvent` calcula `dates` **antes** do aviso de feriado e da checagem de conflito, que passaram a olhar `dates[0]`. Motivo: a diária gerava sábado/domingo, e ocorrência de fim de semana nunca tratada vira pendência eterna nos "Itens em Atraso" e derruba a taxa de conclusão de Outras Atividades. O JSON da coluna `recorrencia` passou a guardar `dias` e `pular_feriados` (JSONB, sem migration) — hoje ninguém lê de volta; é a base para uma futura edição de dias da série. **Escopo: só criação** — o modo edição segue sem o bloco, e nenhuma série existente foi alterada.
```

- [ ] **Step 8: Rodar o smoke e a bateria completa**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/dece72f4-a890-4ba7-93f3-33de56d2a547/scratchpad && for t in test_t1_datas.py test_t2_ui.py test_t3_preview.py test_t4_save.py test_t5_smoke.py; do echo "== $t"; pwenv/bin/python $t || exit 1; done
```

Expected: os cinco terminam com `FALHAS: nenhuma`.

- [ ] **Step 9: Checar sintaxe de tudo e commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && node --check frontend/script_main.js && node --check frontend/script_data.js && node --check frontend/script_state.js && node --check frontend/sw.js && python3 -c "import ast; ast.parse(open('backend/app/data/versoes.py', encoding='utf-8').read())" && git add frontend/sw.js frontend/script_state.js backend/app/data/versoes.py frontend/index.html CLAUDE.md && git commit -m "chore(v77): notas de versão, SW, ajuda e documentação dos dias da semana

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Validação final antes do merge para `main`

- [ ] **Bateria completa verde** — os cinco scripts com `FALHAS: nenhuma`.
- [ ] **Conferência visual nos dois temas** — abrir o modal, escolher Diária e tirar screenshot em tema claro e escuro; confirmar que os rótulos ficam ao lado das caixinhas e que a prévia é legível nos dois (as cores usam `--text` e `--muted`, que existem).
- [ ] **Teste manual do caminho real** (staging ou produção, tenant Service Farma `c2f65634-b7e0-47f0-8937-94446540701a`): criar um evento diário de 2 semanas com Seg–Sex, conferir no calendário que não há nada no fim de semana, e excluir a série pelo escopo "Toda a série" ao terminar.
- [ ] **Rodapé mostra v77** após recarregar (se ficar em versão antiga, o SW está preso — usar `/?limpar=1`).
- [ ] Só então `staging` → `main`.

## Notas para quem executar

- **Não** tocar em `state.agenda` nem em nenhuma ocorrência existente. Este plano só cria.
- **Não** mexer no ramo de edição (`if (editId)`) de `saveNewEvent`.
- Se algum teste exigir mudar o comportamento combinado (ex.: incluir a data base mesmo em dia desmarcado), **pare e pergunte** — isso contraria a decisão 3 do spec.
- O servidor `python3 -m http.server 8123` precisa estar de pé para todos os testes; ele serve os arquivos do disco, então cada edição já vale no próximo `goto`.