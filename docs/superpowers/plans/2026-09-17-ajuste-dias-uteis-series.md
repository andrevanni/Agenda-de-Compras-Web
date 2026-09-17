# Séries em dias úteis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Séries mensais/semanais/quinzenais nascem em dia útil (mensal = mesmo dia do mês), a diária passa a pular feriados por padrão, e séries já existentes ganham a ação "Ajustar dias desta série" (diária remove dias; periódica move para o próximo dia útil).

**Architecture:** Só frontend, sem backend e sem migration. Funções puras de data e de planejamento em [script_main.js](../../../frontend/script_main.js) (ao lado de `isFeriado` e `buildDiariaDates`), testadas por oráculo Python via Playwright. A criação troca `buildRecorrenciaDates` por `buildRecorrenciaDatesUteis`. A correção é um `<dialog>` novo (`serieAjusteModal`) aberto do bloco de escopo do modal de edição; lê as pendentes da série **do servidor** e grava com DELETE em lote / PATCH por id.

**Tech Stack:** JavaScript sem build (scripts globais), HTML/CSS puro, Supabase REST via `fetchSupabase()` / `fetchSupabaseAll()`. Validação com Playwright (Python) contra servidor estático local, Chromium + Google Chrome.

**Spec:** [docs/superpowers/specs/2026-09-17-ajuste-dias-uteis-series-design.md](../specs/2026-09-17-ajuste-dias-uteis-series-design.md)

## Global Constraints

- **Branch de trabalho:** `feat/dias-uteis-series` (criada de `staging`). Não commitar em `main`.
- **Ordem dos `<script>`:** `script_state.js` → `script_utils.js` → `script_render.js` → `script_forms.js` → `script_eficiencia.js` → `script_atividades.js` → `script_data.js` → `script_main.js`. Listeners de `bindEvents()` (script_data) podem referenciar funções de script_main porque `bindEvents` roda no bootstrap.
- **Service Worker:** `frontend/sw.js` `agenda-compras-v78` → `agenda-compras-v79`.
- **`VERSOES` em DOIS arquivos:** [frontend/script_state.js](../../../frontend/script_state.js) e [backend/app/data/versoes.py](../../../backend/app/data/versoes.py), entrada `v79`.
- **NUNCA citar cliente, fornecedor, comprador ou pessoa real** nas notas de versão.
- **Variáveis CSS inexistentes:** `--surface-alt`, `--border`, `--card-bg` → usar `--panel-soft`, `--line`, `--panel`.
- **Nunca reutilizar `id` no HTML.**
- **Datas:** manipular só com `addDaysLocalIso` / componentes locais (`new Date(y, m-1, d)`). **Nunca** `toISOString()` para gerar data. "Hoje" = `todayLocalIso()` (não `todayIso()`, que é UTC).
- **Nunca derivar alvo de mutação de `state.agenda`** (pode estar parcial — carga progressiva). A correção lê do servidor.
- **Só `status = PENDENTE` é alterado.** Todo DELETE/PATCH da correção leva `&tenant_id=eq.T&status=eq.PENDENTE`.
- **Mensal = mesmo dia do mês** (clamp ao último dia) **só em séries novas**. Séries antigas não têm o dia do mês reescrito.
- Teto de 500 datas por série — preservar.

---

## File Structure

| Arquivo | Responsabilidade nesta feature |
|---|---|
| [frontend/script_main.js](../../../frontend/script_main.js) | `ehDiaUtil`, `proximoDiaUtil`, `addMonthsClampIso`, `buildRecorrenciaDatesUteis` (Task 1); prévia/criação (Task 2); `parseRecorrenciaSerie`, `inferirModoAjusteSerie`, `planejarAjusteSerie` (Task 3); modal de correção (Task 4) |
| [frontend/index.html](../../../frontend/index.html) | Prévia fora do bloco de dias + rótulo de feriados (Task 2); botão e `serieAjusteModal` (Task 4); Ajuda (Task 5) |
| [frontend/styles.css](../../../frontend/styles.css) | `.serie-ajuste-modal .modal-card` (Task 4) |
| [frontend/script_data.js](../../../frontend/script_data.js) | Listeners em `bindEvents` (Tasks 2 e 4) |
| [frontend/sw.js](../../../frontend/sw.js), [script_state.js](../../../frontend/script_state.js), [versoes.py](../../../backend/app/data/versoes.py), [CLAUDE.md](../../../CLAUDE.md) | Versão, Ajuda e documentação (Task 5) |

---

## Setup do harness de validação (uma vez, antes da Task 1)

Não há framework de testes no projeto. Padrão do repositório: Playwright contra o frontend servido localmente, com `fetchSupabase` stubado.

`$SP` = `/private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/229456ac-a7e1-4c75-8fb5-3820f038bd14/scratchpad`
`$PROJ` = `/Users/avj/Developer/Sistemas Python/Agenda de Compras Web`
Escreva os caminhos por extenso ao rodar.

- [ ] **Setup 1: Servidor estático (background)**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web/frontend" && python3 -m http.server 8123
```

- [ ] **Setup 2: venv com Playwright**

```bash
cd $SP && python3 -m venv pwenv && pwenv/bin/pip install -q playwright && pwenv/bin/python -m playwright install chromium
```

(O cache do Chromium costuma estar desatualizado em relação ao pacote — por isso o `install`.)

- [ ] **Setup 3: Helper comum `$SP/harness.py`**

```python
import os, sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8123/index.html"
CHANNEL = os.environ.get("PW_CHANNEL")  # "chrome" para o Google Chrome real
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe}"))
    if not cond:
        falhas.append(nome)

def abrir(p):
    browser = p.chromium.launch(channel=CHANNEL) if CHANNEL else p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.goto(URL)
    page.wait_for_function("typeof bootstrap === 'function' && typeof state === 'object'")
    page.wait_for_timeout(800)
    # Stubs: nada sai para a rede; tenant fixo; recarga e calendário viram no-op.
    page.evaluate("""() => {
      window.__calls = [];
      window.__rows = [];
      window.__falharNaChamada = -1;
      const _gs = getSettings;
      window.getSettings = () => ({ ..._gs(), tenantId: 'T-TESTE' });
      window.fetchSupabase = async (path, opts = {}) => {
        const n = window.__calls.length;
        window.__calls.push({ path, method: opts.method || 'GET', body: opts.body ?? null });
        if (n === window.__falharNaChamada) throw new Error('falha simulada');
        if ((opts.method || 'GET') === 'GET') {
          const m = path.match(/offset=(\\d+)/);
          return m && Number(m[1]) > 0 ? [] : window.__rows;
        }
        return null;
      };
      window.loadPortalData = async () => {};
      window.refreshCalendar = () => {};
      state.feriados = [];
    }""")
    return browser, page, erros

def finalizar():
    print()
    if falhas:
        print(f"{len(falhas)} FALHA(S)")
        sys.exit(1)
    print("TUDO OK")
```

- [ ] **Setup 4: Confirmar boot**

```bash
cd $SP && pwenv/bin/python -c "
from harness import *
with sync_playwright() as p:
    b, pg, erros = abrir(p)
    check('boot sem pageerror', erros == [], erros)
    check('isFeriado existe', pg.evaluate('typeof isFeriado') == 'function')
    b.close()
finalizar()
"
```

Expected: `TUDO OK`.

---

### Task 1: Funções de dia útil e geração de datas periódicas

**Files:**
- Modify: `frontend/script_main.js` — após `isFeriado` (linha ~351) e substituindo `buildRecorrenciaDates` (linhas ~838-850)
- Test: `$SP/test_t1_datas.py`

**Interfaces:**
- Consumes: `isFeriado(iso)` (script_main), `addDaysLocalIso(iso, n)` (script_utils), `state.feriados`.
- Produces:
  - `ehDiaUtil(iso: string): boolean`
  - `proximoDiaUtil(iso: string): string` — a própria data se já for útil
  - `addMonthsClampIso(iso: string, meses: number): string`
  - `buildRecorrenciaDatesUteis(baseDate: string, tipo: "semanal"|"quinzenal"|"mensal", fimStr: string): { datas: string[], ajustadas: number }` — **inclui** a data base (n = 0), já ajustada

- [ ] **Step 1: Teste que falha — `$SP/test_t1_datas.py`**

```python
from datetime import date, timedelta
import calendar
from harness import *

def util(d, fer):
    return d.weekday() < 5 and d.isoformat() not in fer

def prox_util(d, fer):
    for _ in range(60):
        if util(d, fer):
            break
        d += timedelta(days=1)
    return d

def add_meses(d, n):
    m0 = d.month - 1 + n
    y, m = d.year + m0 // 12, m0 % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))

def oraculo(base, tipo, fim, fer=()):
    b = date.fromisoformat(base)
    lim = date.fromisoformat(fim) if fim else b + timedelta(days=365)
    datas, ajust, vistas, n = [], 0, set(), 0
    while len(datas) < 500:
        ideal = add_meses(b, n) if tipo == "mensal" else b + timedelta(days=(7 if tipo == "semanal" else 14) * n)
        n += 1
        if ideal > lim:
            break
        real = prox_util(ideal, fer)
        if real in vistas:
            continue
        vistas.add(real)
        datas.append(real.isoformat())
        ajust += real != ideal
    return {"datas": datas, "ajustadas": ajust}

with sync_playwright() as p:
    b, pg, erros = abrir(p)

    def js(expr, *args):
        return pg.evaluate(expr, list(args))

    def feriados(lista):
        pg.evaluate("(l) => { state.feriados = l.map((d) => ({ data: d, nome: 'F' })); }", lista)

    def build(base, tipo, fim, fer=()):
        feriados(list(fer))
        return js("([b, t, f]) => buildRecorrenciaDatesUteis(b, t, f)", base, tipo, fim)

    feriados([])
    check("sexta é útil", js("([d]) => ehDiaUtil(d)", "2026-09-18") is True)
    check("sábado não é útil", js("([d]) => ehDiaUtil(d)", "2026-09-19") is False)
    check("sábado -> segunda", js("([d]) => proximoDiaUtil(d)", "2026-09-19") == "2026-09-21")
    check("dia útil fica", js("([d]) => proximoDiaUtil(d)", "2026-09-17") == "2026-09-17")
    feriados(["2026-10-12"])
    check("sáb+dom+feriado seg -> terça", js("([d]) => proximoDiaUtil(d)", "2026-10-10") == "2026-10-13")
    feriados([])

    check("31/jan +1 mês = 28/fev", js("([d, n]) => addMonthsClampIso(d, n)", "2027-01-31", 1) == "2027-02-28")
    check("31/jan +1 mês bissexto = 29/fev", js("([d, n]) => addMonthsClampIso(d, n)", "2028-01-31", 1) == "2028-02-29")
    check("15/dez +1 mês = 15/jan", js("([d, n]) => addMonthsClampIso(d, n)", "2026-12-15", 1) == "2027-01-15")
    check("31/jan +2 meses = 31/mar (sem acumular clamp)", js("([d, n]) => addMonthsClampIso(d, n)", "2027-01-31", 2) == "2027-03-31")

    casos = [
        ("mensal dia 28 sem fim", "2026-07-28", "mensal", "", ()),
        ("mensal dia 31", "2026-08-31", "mensal", "2027-08-31", ()),
        ("mensal dia 29 atravessa fevereiro", "2027-11-29", "mensal", "2028-12-31", ()),
        ("mensal com Natal e Ano Novo", "2026-09-25", "mensal", "2027-02-01", ("2026-12-25", "2027-01-01")),
        ("semanal base sábado", "2026-09-19", "semanal", "2026-12-31", ()),
        ("quinzenal com feriado", "2026-09-28", "quinzenal", "2026-12-31", ("2026-10-12", "2026-11-02")),
        ("feriado emendado sex+sab+dom", "2026-09-04", "semanal", "2026-09-30", ("2026-09-11",)),
    ]
    for nome, base, tipo, fim, fer in casos:
        got = build(base, tipo, fim, fer)
        exp = oraculo(base, tipo, fim or None, fer)
        check(nome, got == exp, {"got": got, "exp": exp})

    got = build("2026-07-28", "mensal", "")
    check("mensal não escorrega: todas no dia 28 ou dia útil seguinte",
          all(d[8:] in ("28", "29", "30", "31", "01", "02") for d in got["datas"]), got["datas"])
    check("fim antes da base = vazio", build("2026-09-17", "mensal", "2026-09-01") == {"datas": [], "ajustadas": 0})
    check("tipo inválido = vazio", build("2026-09-17", "diaria", "") == {"datas": [], "ajustadas": 0})
    check("teto 500", len(build("2020-01-06", "semanal", "2040-01-01")["datas"]) == 500)
    check("buildRecorrenciaDates removida", js("() => typeof buildRecorrenciaDates") == "undefined")
    check("sem pageerror", erros == [], erros)
    b.close()
finalizar()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $SP && pwenv/bin/python test_t1_datas.py`
Expected: FALHA / exceção `ehDiaUtil is not defined`.

- [ ] **Step 3: Implementar — em `script_main.js`, logo após `isFeriado`:**

```js
// Dia útil = segunda a sexta e fora dos feriados cadastrados do tenant
// (state.feriados — nacionais importados + personalizados). Dia da semana por
// componentes locais: toISOString() desloca a data em fusos positivos.
function ehDiaUtil(dateIso) {
  const [ano, mes, dia] = dateIso.split("-").map(Number);
  const diaSemana = new Date(ano, mes - 1, dia).getDay();
  return diaSemana !== 0 && diaSemana !== 6 && !isFeriado(dateIso);
}

// A própria data se já for útil; senão o primeiro dia útil seguinte. O teto de
// 60 dias só existe para um cadastro de feriados absurdo nunca travar a tela.
function proximoDiaUtil(dateIso) {
  let atual = dateIso;
  for (let i = 0; i < 60 && !ehDiaUtil(atual); i++) atual = addDaysLocalIso(atual, 1);
  return atual;
}

// Soma meses mantendo o dia; dia inexistente no mês de destino vira o último
// dia desse mês. Sempre a partir da base original — 31/jan +2 = 31/mar, e não
// 28/mar (que seria o resultado de somar 1 mês duas vezes).
function addMonthsClampIso(dateIso, meses) {
  const [ano, mes, dia] = dateIso.split("-").map(Number);
  const alvo = new Date(ano, mes - 1 + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const y = alvo.getFullYear();
  const m = String(alvo.getMonth() + 1).padStart(2, "0");
  const d = String(Math.min(dia, ultimoDia)).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 4: Implementar — substituir a função `buildRecorrenciaDates` inteira por:**

```js
// Recorrência semanal/quinzenal/mensal em dia útil. Foi reportado que séries
// mensais caíam em sábado, domingo e feriado — a mensal somava 30 dias e
// escorregava ~1 dia por mês. Agora:
// - mensal = mesmo dia do mês (clamp ao último dia);
// - toda data que cair em fim de semana/feriado vai para o próximo dia útil;
// - o ajuste parte SEMPRE da data ideal (base + n períodos), nunca da já
//   ajustada, então não acumula;
// - INCLUI a data base (n = 0), já ajustada — diferente da função antiga, o
//   chamador não prefixa [data, ...].
// A iteração para quando a data IDEAL passa do fim; a ajustada pode ficar
// alguns dias além — é a ocorrência daquele período.
function buildRecorrenciaDatesUteis(baseDate, tipo, fimStr) {
  const vazio = { datas: [], ajustadas: 0 };
  if (!baseDate || !["semanal", "quinzenal", "mensal"].includes(tipo)) return vazio;
  const limite = fimStr || addDaysLocalIso(baseDate, 365);
  const passoDias = tipo === "semanal" ? 7 : 14;
  const datas = [];
  const vistas = new Set();
  let ajustadas = 0;
  for (let n = 0; datas.length < 500; n++) {
    const ideal = tipo === "mensal" ? addMonthsClampIso(baseDate, n) : addDaysLocalIso(baseDate, passoDias * n);
    if (ideal > limite) break;
    const real = proximoDiaUtil(ideal);
    if (vistas.has(real)) continue;
    vistas.add(real);
    datas.push(real);
    if (real !== ideal) ajustadas++;
  }
  return { datas, ajustadas };
}
```

Nesta task `saveNewEvent` ainda chama `buildRecorrenciaDates` — **corrigir na mesma task** para não quebrar a criação entre commits, trocando em `saveNewEvent`:

```js
  const dates = recorrencia === "diaria"
    ? buildDiariaDates(data, recFim, diasSemana, pularFeriados)
    : recorrencia
      ? [data, ...buildRecorrenciaDates(data, recorrencia, recFim)]
      : [data];
```

por:

```js
  let ajustadasNaCriacao = 0;
  let dates;
  if (recorrencia === "diaria") {
    dates = buildDiariaDates(data, recFim, diasSemana, pularFeriados);
  } else if (recorrencia) {
    const geradas = buildRecorrenciaDatesUteis(data, recorrencia, recFim);
    dates = geradas.datas;
    ajustadasNaCriacao = geradas.ajustadas;
  } else {
    dates = [data];
  }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd $SP && pwenv/bin/python test_t1_datas.py && node --check "$PROJ/frontend/script_main.js"`
Expected: `TUDO OK`, sem saída do `node --check`.

- [ ] **Step 6: Commit**

```bash
cd "$PROJ" && git add frontend/script_main.js && git commit -m "feat(agenda): series periodicas em dia util e mensal no mesmo dia do mes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Criação — prévia para todas as recorrências, feriados por padrão, gravação

**Files:**
- Modify: `frontend/index.html:1596-1608` (bloco de recorrência do `newEventModal`)
- Modify: `frontend/script_main.js` — `updateNewEventPreview` (~673), `openNewEventModal` (~714), `openGenericEventDetail` (~763), `saveNewEvent` (~877)
- Modify: `frontend/script_data.js:532-537` (listener de `newEventRecorrencia`)
- Test: `$SP/test_t2_criacao.py`

**Interfaces:**
- Consumes: `buildRecorrenciaDatesUteis`, `buildDiariaDates`, `ajustadasNaCriacao` (variável local de `saveNewEvent` criada na Task 1).
- Produces: `#newEventRecorrenciaPreview` fora de `#newEventDiasSemanaWrap`, visível com qualquer recorrência. JSON `recorrencia` com `ajuste: "proximo_dia_util"` (periódicas) e `dia_mes` (mensal).

- [ ] **Step 1: Teste que falha — `$SP/test_t2_criacao.py`**

```python
import json
from harness import *

with sync_playwright() as p:
    b, pg, erros = abrir(p)
    pg.evaluate("() => { state.buyers = []; openNewEventModal('2026-09-19'); }")

    def set_rec(tipo, fim=""):
        pg.select_option("#newEventRecorrencia", tipo)
        pg.fill("#newEventRecorrenciaFim", fim)
        pg.dispatch_event("#newEventRecorrenciaFim", "change")

    def previa():
        return pg.evaluate("document.getElementById('newEventRecorrenciaPreview').textContent")

    def previa_visivel():
        return pg.is_visible("#newEventRecorrenciaPreview")

    check("pular feriados vem marcado", pg.is_checked("#newEventPularFeriados"))
    check("rótulo fala em feriados cadastrados",
          "cadastrados" in pg.evaluate("document.getElementById('newEventPularFeriados').parentElement.textContent"))
    check("prévia fora do bloco de dias",
          pg.evaluate("!document.getElementById('newEventDiasSemanaWrap').contains(document.getElementById('newEventRecorrenciaPreview'))"))

    check("sem recorrência: prévia oculta", not previa_visivel())

    set_rec("mensal", "19/03/2027")
    check("mensal: prévia visível", previa_visivel())
    texto = previa()
    esperado = pg.evaluate("buildRecorrenciaDatesUteis('2026-09-19', 'mensal', '2027-03-19')")
    check("mensal: contagem na prévia", f"{len(esperado['datas'])} data(s)" in texto, texto)
    check("mensal: ajustadas na prévia", f"{esperado['ajustadas']} ajustada(s) para o próximo dia útil" in texto, texto)
    check("mensal: 1ª data já ajustada (sáb 19/09 -> seg 21/09)", "21/09/2026" in texto, texto)

    set_rec("diaria", "30/09/2026")
    check("diária: prévia visível", previa_visivel())
    check("diária: texto de datas", "data(s)" in previa(), previa())

    set_rec("")
    check("voltar para sem recorrência oculta a prévia", not previa_visivel())

    # Gravação: mensal
    pg.evaluate("() => { window.__calls = []; }")
    pg.fill("#newEventTitulo", "Teste mensal")
    set_rec("mensal", "19/12/2026")
    pg.evaluate("() => saveNewEvent()")
    pg.wait_for_function("window.__calls.some((c) => c.method === 'POST')")
    pg.wait_for_timeout(300)
    posts = [c for c in pg.evaluate("window.__calls") if c["method"] == "POST"]
    datas = [c["body"]["data_prevista"] for c in posts]
    esperado = pg.evaluate("buildRecorrenciaDatesUteis('2026-09-19', 'mensal', '2026-12-19').datas")
    check("mensal grava as datas úteis", datas == esperado, {"got": datas, "exp": esperado})
    rec = json.loads(posts[0]["body"]["recorrencia"])
    check("recorrencia com ajuste e dia_mes",
          rec.get("tipo") == "mensal" and rec.get("ajuste") == "proximo_dia_util" and rec.get("dia_mes") == 19, rec)
    check("mesmo serie_id em todas", len({c["body"]["serie_id"] for c in posts}) == 1 and posts[0]["body"]["serie_id"])
    fb = pg.evaluate("document.getElementById('feedbackBox')?.textContent || ''")
    check("feedback menciona ajuste", "próximo dia útil" in fb, fb)

    # Gravação: semanal não leva dia_mes
    pg.evaluate("() => { window.__calls = []; openNewEventModal('2026-09-19'); }")
    pg.fill("#newEventTitulo", "Teste semanal")
    set_rec("semanal", "10/10/2026")
    pg.evaluate("() => saveNewEvent()")
    pg.wait_for_function("window.__calls.some((c) => c.method === 'POST')")
    pg.wait_for_timeout(300)
    posts = [c for c in pg.evaluate("window.__calls") if c["method"] == "POST"]
    rec = json.loads(posts[0]["body"]["recorrencia"])
    check("semanal: ajuste sem dia_mes", rec.get("ajuste") == "proximo_dia_util" and "dia_mes" not in rec, rec)
    check("semanal: nenhuma data em fim de semana",
          all(pg.evaluate("(d) => ehDiaUtil(d)", c["body"]["data_prevista"]) for c in posts))

    # Fim antes da base: bloqueia
    pg.evaluate("() => { window.__calls = []; openNewEventModal('2026-09-19'); }")
    pg.fill("#newEventTitulo", "Teste vazio")
    set_rec("mensal", "01/09/2026")
    pg.evaluate("() => saveNewEvent()")
    pg.wait_for_timeout(300)
    check("fim antes da base não grava", not any(c["method"] == "POST" for c in pg.evaluate("window.__calls")))
    check("mensagem de nenhuma data", "Nenhuma data" in pg.evaluate("document.getElementById('newEventConflictWarning').textContent"))

    # Modo edição esconde a prévia
    pg.evaluate("() => openGenericEventDetail({ id: 'x', titulo: 't', data_prevista: '2026-09-21', serie_id: null })")
    check("edição: prévia oculta", not previa_visivel())

    check("sem pageerror", erros == [], erros)
    b.close()
finalizar()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $SP && pwenv/bin/python test_t2_criacao.py`
Expected: FALHA em "pular feriados vem marcado" e "prévia fora do bloco de dias".

- [ ] **Step 3: HTML — em `index.html`, substituir o bloco `newEventDiasSemanaWrap`:**

```html
          <div id="newEventDiasSemanaWrap" class="hidden" style="grid-column:1/-1">
            <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Dias da semana</span>
            <div id="newEventDiasSemana" class="weekday-grid"></div>
            <label class="weekday-extra"><input type="checkbox" id="newEventPularFeriados"> Pular feriados nacionais</label>
            <div id="newEventRecorrenciaPreview" class="weekday-preview"></div>
          </div>
```

por:

```html
          <div id="newEventDiasSemanaWrap" class="hidden" style="grid-column:1/-1">
            <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Dias da semana</span>
            <div id="newEventDiasSemana" class="weekday-grid"></div>
            <label class="weekday-extra"><input type="checkbox" id="newEventPularFeriados" checked> Pular feriados cadastrados</label>
          </div>
```

e, imediatamente **depois** do `</label>` que fecha `newEventRecorrenciaFimWrap`, inserir:

```html
          <div id="newEventRecorrenciaPreview" class="weekday-preview hidden" style="grid-column:1/-1"></div>
```

- [ ] **Step 4: `script_data.js` — no listener de `newEventRecorrencia`, após a linha do `newEventDiasSemanaWrap`, adicionar:**

```js
    document.getElementById("newEventRecorrenciaPreview").classList.toggle("hidden", !val);
```

- [ ] **Step 5: `script_main.js` — substituir `updateNewEventPreview` inteira por:**

```js
// Mostra, antes de salvar, quantas ocorrências a série vai criar e o período
// coberto. Importante porque a 1ª data pode não ser a digitada (dia desmarcado
// na diária; fim de semana/feriado nas periódicas) e porque o volume de uma
// rotina de 1 ano não é óbvio.
function updateNewEventPreview() {
  const el = document.getElementById("newEventRecorrenciaPreview");
  if (!el) return;
  el.classList.remove("alerta");
  const tipo = document.getElementById("newEventRecorrencia").value;
  const data = brToIso(document.getElementById("newEventData").value);
  const fim = brToIso(document.getElementById("newEventRecorrenciaFim").value);
  if (!tipo || !data) {
    el.textContent = "";
    return;
  }

  let dates;
  let extra = "";
  if (tipo === "diaria") {
    const dias = getNewEventDiasSemana();
    const pular = document.getElementById("newEventPularFeriados").checked;
    if (!dias.length) {
      el.textContent = "Marque ao menos um dia da semana.";
      el.classList.add("alerta");
      return;
    }
    dates = buildDiariaDates(data, fim, dias, pular);
    if (pular && dates.length) {
      const semPular = buildDiariaDates(data, fim, dias, false);
      const pulados = semPular.length - dates.length;
      // Com o teto de 500 batido, a diferença deixa de ser confiável.
      if (pulados > 0 && semPular.length < 500) extra = ` · ${pulados} feriado(s) pulado(s)`;
    }
  } else {
    const geradas = buildRecorrenciaDatesUteis(data, tipo, fim);
    dates = geradas.datas;
    if (geradas.ajustadas > 0) extra = ` · ${geradas.ajustadas} ajustada(s) para o próximo dia útil`;
  }

  if (!dates.length) {
    el.textContent = tipo === "diaria"
      ? "Nenhuma data no período — ajuste os dias da semana ou a data de fim."
      : "Nenhuma data no período — ajuste a data de fim.";
    el.classList.add("alerta");
    return;
  }
  const limite = dates.length >= 500 ? " (limite máximo)" : "";
  el.textContent = `📅 ${dates.length} data(s)${limite} · ${formatDate(dates[0])} → ${formatDate(dates[dates.length - 1])}${extra}`;
}
```

- [ ] **Step 6: `openNewEventModal` — trocar `document.getElementById("newEventPularFeriados").checked = false;` por:**

```js
  document.getElementById("newEventPularFeriados").checked = true;
  document.getElementById("newEventRecorrenciaPreview").classList.add("hidden");
```

- [ ] **Step 7: `openGenericEventDetail` — após `document.getElementById("newEventDiasSemanaWrap").classList.add("hidden");` adicionar:**

```js
  document.getElementById("newEventRecorrenciaPreview").classList.add("hidden");
```

- [ ] **Step 8: `saveNewEvent` — três trocas**

(a) Mensagem de vazio — trocar `"Nenhuma data foi gerada com esses dias da semana. Ajuste os dias ou a data de fim."` por:

```js
"Nenhuma data foi gerada no período. Ajuste os dias da semana ou a data de fim."
```

(b) Aviso de feriado — trocar `const feriadoNoDia = getFeriado(primeiraData);` por:

```js
  // Nas periódicas a data já nasce ajustada para dia útil; o aviso só faz
  // sentido para evento avulso e para a diária sem "pular feriados".
  const feriadoNoDia = recorrencia && recorrencia !== "diaria" ? null : getFeriado(primeiraData);
```

(c) JSON de recorrência — trocar o bloco `recorrencia: recorrencia ? JSON.stringify({...}) : null,` por:

```js
        recorrencia: recorrencia
          ? JSON.stringify({
              tipo: recorrencia,
              fim: recFim || null,
              // Nada lê esses campos de volta hoje; ficam registrados para
              // edições futuras da série.
              ...(recorrencia === "diaria"
                ? { dias: diasSemana, pular_feriados: pularFeriados }
                : { ajuste: "proximo_dia_util" }),
              ...(recorrencia === "mensal" ? { dia_mes: Number(data.slice(8, 10)) } : {}),
            })
          : null,
```

(d) Feedback de sucesso — trocar o `setFeedback(total > 1 ? ... : "Evento criado com sucesso.", "success");` por:

```js
      const avisoAjuste = ajustadasNaCriacao > 0
        ? ` ${ajustadasNaCriacao} data(s) caíam em fim de semana ou feriado e foram para o próximo dia útil.`
        : "";
      setFeedback(
        total > 1
          ? `${total} evento(s) criado(s)${buyerIds.length > 1 ? ` para ${buyerIds.length} comprador(es)` : ""}${dates.length > 1 ? `, ${dates.length} datas (${recorrencia})` : ""}.${avisoAjuste}`
          : `Evento criado com sucesso.${avisoAjuste}`,
        "success"
      );
```

- [ ] **Step 9: Rodar e ver passar**

Run: `cd $SP && pwenv/bin/python test_t2_criacao.py && pwenv/bin/python test_t1_datas.py && node --check "$PROJ/frontend/script_main.js" && node --check "$PROJ/frontend/script_data.js"`
Expected: `TUDO OK` nas duas suítes.

- [ ] **Step 10: Commit**

```bash
cd "$PROJ" && git add frontend/index.html frontend/script_main.js frontend/script_data.js && git commit -m "feat(agenda): previa de datas uteis em toda recorrencia e feriados pulados por padrao

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Planejamento da correção (funções puras)

**Files:**
- Modify: `frontend/script_main.js` — após `buildDiariaDates`
- Test: `$SP/test_t3_plano.py`

**Interfaces:**
- Consumes: `proximoDiaUtil`, `isFeriado`, `parseIsoToWeekdayName` (script_utils), `diffDays` (script_render).
- Produces:
  - `parseRecorrenciaSerie(valor: any): object|null` — aceita objeto, string JSON, ou string JSON dentro de string
  - `inferirModoAjusteSerie(rows: {data_prevista, recorrencia}[]): "remover"|"mover"`
  - `diasDaSerie(rows): string[]|null` — `recorrencia.dias` válido da 1ª linha que tiver
  - `planejarAjusteSerie(rows, modo, opcoes): { modo, alvos: {id, de, para}[], mantidasPorLembrete: number }`
    - `modo "remover"`: `opcoes = { diasManter: string[], removerFeriados: boolean }`; `para = null`
    - `modo "mover"`: `opcoes = { hoje: string }`

- [ ] **Step 1: Teste que falha — `$SP/test_t3_plano.py`**

```python
import json
from datetime import date, timedelta
from harness import *

def serie(inicio, dias, passo=1, rec=None, notas=()):
    d0 = date.fromisoformat(inicio)
    out = []
    for i in range(dias):
        d = (d0 + timedelta(days=i * passo)).isoformat()
        out.append({"id": f"id-{i}", "data_prevista": d, "nota": "lembrar" if d in notas else None, "recorrencia": rec})
    return out

with sync_playwright() as p:
    b, pg, erros = abrir(p)
    js = lambda expr, *a: pg.evaluate(expr, list(a))
    pg.evaluate("() => { state.feriados = [{ data: '2026-10-12', nome: 'F' }]; }")

    enc2 = json.dumps(json.dumps({"tipo": "diaria", "fim": None}))
    check("parse string dupla", js("([v]) => parseRecorrenciaSerie(JSON.parse(v))", enc2) == {"tipo": "diaria", "fim": None})
    check("parse string simples", js("([v]) => parseRecorrenciaSerie(v)", '{"tipo":"mensal"}') == {"tipo": "mensal"})
    check("parse objeto", js("([v]) => parseRecorrenciaSerie(v)", {"tipo": "semanal"}) == {"tipo": "semanal"})
    check("parse lixo = null", js("([v]) => parseRecorrenciaSerie(v)", "{quebrado") is None)
    check("parse null = null", js("([v]) => parseRecorrenciaSerie(v)", None) is None)

    rec_d = json.dumps({"tipo": "diaria", "fim": None})
    rec_m = json.dumps({"tipo": "mensal", "fim": None})
    check("modo pelo tipo diaria", js("([r]) => inferirModoAjusteSerie(r)", serie("2026-09-01", 5, 1, rec_d)) == "remover")
    check("modo pelo tipo mensal", js("([r]) => inferirModoAjusteSerie(r)", serie("2026-09-01", 5, 30, rec_m)) == "mover")
    check("sem tipo, intervalo 1 = remover", js("([r]) => inferirModoAjusteSerie(r)", serie("2026-09-01", 20, 1)) == "remover")
    check("sem tipo, intervalo 7 = mover", js("([r]) => inferirModoAjusteSerie(r)", serie("2026-09-01", 10, 7)) == "mover")
    seg_sex = [r for r in serie("2026-09-07", 21, 1) if date.fromisoformat(r["data_prevista"]).weekday() < 5]
    check("sem tipo, seg-sex (gaps 1 e 3) = remover", js("([r]) => inferirModoAjusteSerie(r)", seg_sex) == "remover")
    check("série de 1 linha = mover", js("([r]) => inferirModoAjusteSerie(r)", serie("2026-09-01", 1)) == "mover")

    rec_dias = json.dumps({"tipo": "diaria", "dias": ["QUARTA", "QUINTA", "SEXTA", "SABADO"]})
    check("diasDaSerie lê dias", js("([r]) => diasDaSerie(r)", serie("2026-09-01", 3, 1, rec_dias)) == ["QUARTA", "QUINTA", "SEXTA", "SABADO"])
    check("diasDaSerie sem dias = null", js("([r]) => diasDaSerie(r)", serie("2026-09-01", 3, 1, rec_d)) is None)

    # Remover: 03/10/2026 (sábado) a 18/10. Lembrete no domingo 04/10. Feriado 12/10 (segunda).
    rows = serie("2026-10-03", 16, 1, rec_d, notas=("2026-10-04",))
    SEG_SEX = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"]
    plano = js("([r, d]) => planejarAjusteSerie(r, 'remover', { diasManter: d, removerFeriados: true })", rows, SEG_SEX)
    esperado = []
    for r in rows:
        d = date.fromisoformat(r["data_prevista"])
        fora = d.weekday() >= 5 or r["data_prevista"] == "2026-10-12"
        if fora and not r["nota"]:
            esperado.append({"id": r["id"], "de": r["data_prevista"], "para": None})
    check("remover: alvos = fins de semana + feriado, sem o que tem lembrete", plano["alvos"] == esperado, plano)
    check("remover: 1 mantida por lembrete", plano["mantidasPorLembrete"] == 1, plano)
    sem_fer = js("([r, d]) => planejarAjusteSerie(r, 'remover', { diasManter: d, removerFeriados: false })", rows, SEG_SEX)
    check("remover sem feriados: feriado fica", all(a["de"] != "2026-10-12" for a in sem_fer["alvos"]))
    check("remover: ordem preservada", [a["de"] for a in plano["alvos"]] == sorted(a["de"] for a in plano["alvos"]))
    check("remover: lembrete só de espaços não protege",
          js("([r, d]) => planejarAjusteSerie(r, 'remover', { diasManter: d, removerFeriados: true }).mantidasPorLembrete",
             [{"id": "a", "data_prevista": "2026-10-03", "nota": "   ", "recorrencia": None}], SEG_SEX) == 0)

    # Mover: mensal com passado, sábado, feriado e dia útil
    mrows = [
        {"id": "passado-sab", "data_prevista": "2026-09-12", "nota": None, "recorrencia": rec_m},
        {"id": "hoje-util", "data_prevista": "2026-09-17", "nota": None, "recorrencia": rec_m},
        {"id": "sab", "data_prevista": "2026-10-10", "nota": "x", "recorrencia": rec_m},
        {"id": "util", "data_prevista": "2026-11-10", "nota": None, "recorrencia": rec_m},
        {"id": "dom", "data_prevista": "2026-12-27", "nota": None, "recorrencia": rec_m},
    ]
    mp = js("([r]) => planejarAjusteSerie(r, 'mover', { hoje: '2026-09-17' })", mrows)
    check("mover: só futuras fora de dia útil (lembrete não impede mover)",
          mp["alvos"] == [
              {"id": "sab", "de": "2026-10-10", "para": "2026-10-13"},
              {"id": "dom", "de": "2026-12-27", "para": "2026-12-28"},
          ], mp)
    check("mover: mantidasPorLembrete = 0", mp["mantidasPorLembrete"] == 0)
    check("sem pageerror", erros == [], erros)
    b.close()
finalizar()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $SP && pwenv/bin/python test_t3_plano.py`
Expected: exceção `parseRecorrenciaSerie is not defined`.

- [ ] **Step 3: Implementar — em `script_main.js`, logo após `buildDiariaDates`:**

```js
// A coluna recorrencia chega em formatos diferentes conforme a época da série:
// objeto, string JSON, ou string JSON dentro de string (o saveNewEvent grava
// JSON.stringify num campo JSONB). Nunca lança — série sem recorrência legível
// cai na inferência por intervalo.
function parseRecorrenciaSerie(valor) {
  let atual = valor;
  for (let i = 0; i < 2 && typeof atual === "string"; i++) {
    try {
      atual = JSON.parse(atual);
    } catch {
      return null;
    }
  }
  return atual && typeof atual === "object" ? atual : null;
}

// "remover" para série diária (mover criaria duplicata no dia seguinte, que já
// tem a sua ocorrência); "mover" para semanal/quinzenal/mensal. Séries antigas
// podem não ter o tipo gravado: usa a mediana do intervalo entre datas —
// uma diária seg–sex tem intervalos 1,1,1,1,3 e mediana 1.
function inferirModoAjusteSerie(rows) {
  const lista = rows ?? [];
  const tipo = lista.map((r) => parseRecorrenciaSerie(r.recorrencia)?.tipo).find(Boolean);
  if (tipo === "diaria") return "remover";
  if (["semanal", "quinzenal", "mensal"].includes(tipo)) return "mover";
  const datas = [...new Set(lista.map((r) => r.data_prevista))].sort();
  if (datas.length < 2) return "mover";
  const intervalos = [];
  for (let i = 1; i < datas.length; i++) intervalos.push(diffDays(datas[i], datas[i - 1]));
  intervalos.sort((a, b) => a - b);
  return intervalos[Math.floor(intervalos.length / 2)] <= 1 ? "remover" : "mover";
}

// Dias escolhidos na criação (séries a partir da v77). Usado como padrão dos
// checkboxes — sem isso, uma série "quarta a sábado" abriria com seg–sex e
// proporia apagar os sábados que o comprador pediu.
function diasDaSerie(rows) {
  for (const r of rows ?? []) {
    const dias = parseRecorrenciaSerie(r.recorrencia)?.dias;
    if (Array.isArray(dias)) {
      const validos = dias.filter((d) => DIAS_SEMANA.includes(d));
      if (validos.length) return validos;
    }
  }
  return null;
}

// Decide o que a correção vai fazer, sem tocar no servidor. rows = pendentes
// da série, ordenadas por data.
// - remover: pendentes em dia desmarcado ou feriado, inclusive vencidas.
//   Ocorrência com lembrete é preservada — apagar em massa não pode destruir
//   texto escrito à mão.
// - mover: pendentes de hoje em diante fora de dia útil. Vencidas ficam:
//   mover para outra data que também já passou não resolve nada.
function planejarAjusteSerie(rows, modo, opcoes = {}) {
  const lista = rows ?? [];
  if (modo === "remover") {
    const manter = new Set(opcoes.diasManter ?? []);
    const alvos = [];
    let mantidasPorLembrete = 0;
    for (const r of lista) {
      const foraDosDias = !manter.has(parseIsoToWeekdayName(r.data_prevista));
      const feriado = Boolean(opcoes.removerFeriados) && isFeriado(r.data_prevista);
      if (!foraDosDias && !feriado) continue;
      if (String(r.nota ?? "").trim()) {
        mantidasPorLembrete++;
        continue;
      }
      alvos.push({ id: r.id, de: r.data_prevista, para: null });
    }
    return { modo, alvos, mantidasPorLembrete };
  }
  const hoje = opcoes.hoje;
  const alvos = lista
    .filter((r) => r.data_prevista >= hoje)
    .map((r) => ({ id: r.id, de: r.data_prevista, para: proximoDiaUtil(r.data_prevista) }))
    .filter((a) => a.para !== a.de);
  return { modo: "mover", alvos, mantidasPorLembrete: 0 };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd $SP && pwenv/bin/python test_t3_plano.py && node --check "$PROJ/frontend/script_main.js"`
Expected: `TUDO OK`.

- [ ] **Step 5: Commit**

```bash
cd "$PROJ" && git add frontend/script_main.js && git commit -m "feat(agenda): planejamento puro do ajuste de dias de series existentes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Modal "Ajustar dias desta série"

**Files:**
- Modify: `frontend/index.html` — botão dentro de `newEventEditScopeWrap` (~1632) e `<dialog id="serieAjusteModal">` logo após o `</dialog>` do `newEventModal` (~1645)
- Modify: `frontend/styles.css` — após `.pedido-modal .modal-card` (~1454)
- Modify: `frontend/script_main.js` — após `deleteGenericEvent`
- Modify: `frontend/script_data.js` — `bindEvents`, junto dos listeners do `newEventModal` (~531)
- Test: `$SP/test_t4_modal.py`

**Interfaces:**
- Consumes: `inferirModoAjusteSerie`, `diasDaSerie`, `planejarAjusteSerie`, `fetchSupabaseAll`, `fetchSupabase`, `todayLocalIso`, `DIAS_SEMANA_LABEL_CURTO`, `DIAS_SEMANA_PADRAO_DIARIA`, `closeModal`, `setFeedback`, `clearFeedback`, `loadPortalData`, `refreshCalendar`.
- Produces: `openSerieAjusteModal()`, `renderSerieAjusteDias(selected)`, `getSerieAjustePlano()`, `atualizarPreviaAjusteSerie()`, `aplicarAjusteSerie()`; globais `_serieAjusteToken`, `_serieAjusteCtx`.

- [ ] **Step 1: Teste que falha — `$SP/test_t4_modal.py`**

```python
import json
from datetime import date, timedelta
from harness import *

REC_D = json.dumps(json.dumps({"tipo": "diaria", "fim": None}))
REC_M = json.dumps(json.dumps({"tipo": "mensal", "fim": None}))

def diaria(inicio, n, notas=()):
    d0 = date.fromisoformat(inicio)
    return [{"id": f"d{i}", "data_prevista": (d0 + timedelta(days=i)).isoformat(),
             "nota": "x" if (d0 + timedelta(days=i)).isoformat() in notas else None,
             "recorrencia": json.loads(REC_D)} for i in range(n)]

with sync_playwright() as p:
    b, pg, erros = abrir(p)
    pg.on("dialog", lambda d: d.accept())

    def abrir_serie(rows, occ_id="occ-1"):
        pg.evaluate("""([rows, occId]) => {
          window.__rows = rows; window.__calls = [];
          state.agenda = [{ id: occId, titulo: 'Conciliação', data_prevista: rows[0].data_prevista, serie_id: 'S1' }];
          openGenericEventDetail(state.agenda[0]);
        }""", [rows, occ_id])
        pg.wait_for_timeout(200)
        pg.click("#newEventAjustarSerieButton")
        pg.wait_for_function("document.getElementById('serieAjustePrevia').textContent.startsWith('Serão') || document.getElementById('serieAjustePrevia').textContent.startsWith('Nenhuma')")

    def previa():
        return pg.evaluate("document.getElementById('serieAjustePrevia').textContent")

    # Botão só com série
    pg.evaluate("() => openGenericEventDetail({ id: 'avulsa', titulo: 't', data_prevista: '2026-09-21', serie_id: null })")
    check("avulsa: botão oculto", not pg.is_visible("#newEventAjustarSerieButton"))

    # --- Diária: 03/10 (sáb) a 18/10, 1 lembrete no domingo 04/10, 1 feriado 12/10
    pg.evaluate("() => { state.feriados = [{ data: '2026-10-12', nome: 'F' }]; }")
    rows = diaria("2026-10-03", 16, notas=("2026-10-04",))
    abrir_serie(rows)
    check("série: modal de ajuste aberto", pg.is_visible("#serieAjusteModal"))
    get = pg.evaluate("window.__calls.filter((c) => c.method === 'GET').map((c) => c.path)")
    check("leitura do servidor filtra série, tenant e PENDENTE",
          any("serie_id=eq.S1" in g and "tenant_id=eq.T-TESTE" in g and "status=eq.PENDENTE" in g and "order=data_prevista.asc" in g for g in get), get)
    check("diária: checkboxes visíveis", pg.is_visible("#serieAjusteDias"))
    marcados = pg.evaluate("[...document.querySelectorAll('input[name=serieAjusteDia]:checked')].map((c) => c.value)")
    check("diária: seg-sex marcados por padrão", marcados == ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"], marcados)
    check("diária: remover feriados marcado", pg.is_checked("#serieAjusteRemoverFeriados"))
    # fins de semana: 03,04(lembrete),10,11,17,18 -> 5 removíveis + feriado 12 = 6
    check("diária: prévia 6 removidas", "Serão removidas 6 ocorrência(s)" in previa(), previa())
    check("diária: prévia 1 mantida por lembrete", "1 mantida(s) por terem lembrete" in previa(), previa())
    check("diária: botão com contagem", pg.inner_text("#serieAjusteAplicarButton").strip() == "Remover 6")

    pg.uncheck("#serieAjusteRemoverFeriados")
    check("desmarcar feriados recalcula (5)", "Serão removidas 5" in previa(), previa())
    pg.check("#serieAjusteRemoverFeriados")

    pg.evaluate("() => document.querySelectorAll('input[name=serieAjusteDia]').forEach((c) => { c.checked = false; })")
    pg.dispatch_event("#serieAjusteDias", "change")
    check("nenhum dia marcado bloqueia", pg.is_disabled("#serieAjusteAplicarButton") and "Marque ao menos um dia" in previa(), previa())
    pg.evaluate("() => document.querySelectorAll('input[name=serieAjusteDia]').forEach((c) => { c.checked = ['SEGUNDA','TERCA','QUARTA','QUINTA','SEXTA'].includes(c.value); })")
    pg.dispatch_event("#serieAjusteDias", "change")

    pg.evaluate("() => { window.__calls = []; }")
    pg.click("#serieAjusteAplicarButton")
    pg.wait_for_function("!document.getElementById('serieAjusteModal').open")
    dels = [c["path"] for c in pg.evaluate("window.__calls") if c["method"] == "DELETE"]
    check("diária: 1 DELETE em lote", len(dels) == 1, dels)
    check("diária: DELETE com travas", all("tenant_id=eq.T-TESTE" in d and "status=eq.PENDENTE" in d for d in dels), dels)
    ids = dels[0].split("id=in.(")[1].split(")")[0].split(",")
    check("diária: ids certos", sorted(ids) == sorted(["d0", "d7", "d8", "d9", "d14", "d15"]), ids)
    check("fecha o modal de edição também", not pg.evaluate("document.getElementById('newEventModal').open"))

    # --- Lotes de 100
    pg.evaluate("() => { state.feriados = []; }")
    grandes = [{"id": f"g{i}", "data_prevista": "2026-10-03", "nota": None, "recorrencia": json.loads(REC_D)} for i in range(250)]
    abrir_serie(grandes)
    pg.evaluate("() => { window.__calls = []; }")
    pg.click("#serieAjusteAplicarButton")
    pg.wait_for_function("!document.getElementById('serieAjusteModal').open")
    dels = [c["path"] for c in pg.evaluate("window.__calls") if c["method"] == "DELETE"]
    tamanhos = [len(d.split("id=in.(")[1].split(")")[0].split(",")) for d in dels]
    check("lotes de 100 (100,100,50)", tamanhos == [100, 100, 50], tamanhos)

    # --- Mover (mensal)
    hoje = pg.evaluate("todayLocalIso()")
    base = date.fromisoformat(hoje)
    prox_sab = base + timedelta(days=(5 - base.weekday()) % 7 or 7)
    prox_dom = prox_sab + timedelta(days=8)
    passado_sab = prox_sab - timedelta(days=14)
    util = prox_sab + timedelta(days=2)
    mrows = [
        {"id": "m-passado", "data_prevista": passado_sab.isoformat(), "nota": None, "recorrencia": json.loads(REC_M)},
        {"id": "m-sab", "data_prevista": prox_sab.isoformat(), "nota": "x", "recorrencia": json.loads(REC_M)},
        {"id": "m-util", "data_prevista": util.isoformat(), "nota": None, "recorrencia": json.loads(REC_M)},
        {"id": "m-dom", "data_prevista": prox_dom.isoformat(), "nota": None, "recorrencia": json.loads(REC_M)},
    ]
    abrir_serie(mrows)
    check("mensal: sem checkboxes", not pg.is_visible("#serieAjusteDias"))
    check("mensal: prévia 2 movidas", "Serão movidas 2 ocorrência(s)" in previa(), previa())
    check("mensal: botão Mover 2", pg.inner_text("#serieAjusteAplicarButton").strip() == "Mover 2")
    pg.evaluate("() => { window.__calls = []; }")
    pg.click("#serieAjusteAplicarButton")
    pg.wait_for_function("!document.getElementById('serieAjusteModal').open")
    patches = [c for c in pg.evaluate("window.__calls") if c["method"] == "PATCH"]
    check("mensal: 2 PATCH", len(patches) == 2, patches)
    check("mensal: PATCH com travas", all("tenant_id=eq.T-TESTE" in c["path"] and "status=eq.PENDENTE" in c["path"] for c in patches))
    check("mensal: datas novas em dia útil",
          {c["path"].split("id=eq.")[1].split("&")[0]: c["body"]["data_prevista"] for c in patches}
          == {"m-sab": (prox_sab + timedelta(days=2)).isoformat(), "m-dom": (prox_dom + timedelta(days=1)).isoformat()},
          patches)

    # --- Nada a fazer
    abrir_serie([mrows[2]])
    check("nada a fazer: mensagem", "Nenhuma ocorrência desta série cai em fim de semana ou feriado." in previa(), previa())
    check("nada a fazer: botão desabilitado", pg.is_disabled("#serieAjusteAplicarButton"))
    pg.evaluate("() => closeModal('serieAjusteModal')")

    # --- Falha parcial: 2º PATCH falha
    abrir_serie(mrows)
    pg.evaluate("() => { window.__calls = []; window.__falharNaChamada = 1; }")
    pg.click("#serieAjusteAplicarButton")
    pg.wait_for_function("!document.getElementById('serieAjusteFeedback').classList.contains('hidden')")
    fb = pg.evaluate("document.getElementById('serieAjusteFeedback').textContent")
    check("falha parcial: 1 de 2", "1 de 2" in fb, fb)
    check("falha parcial: modal continua aberto", pg.evaluate("document.getElementById('serieAjusteModal').open"))
    check("falha parcial: botão desabilitado", pg.is_disabled("#serieAjusteAplicarButton"))
    pg.evaluate("() => { window.__falharNaChamada = -1; closeModal('serieAjusteModal'); }")

    # --- Guarda de geração: resposta lenta da série A não escreve na B
    pg.evaluate("""() => {
      const orig = window.fetchSupabase;
      window.__lento = true;
      window.fetchSupabase = async (path, opts = {}) => {
        if ((opts.method || 'GET') === 'GET' && path.includes('serie_id=eq.LENTA') && window.__lento) {
          await new Promise((r) => setTimeout(r, 600));
          return [{ id: 'lenta', data_prevista: '2026-10-03', nota: null, recorrencia: { tipo: 'diaria' } }];
        }
        if ((opts.method || 'GET') === 'GET' && path.includes('serie_id=eq.RAPIDA')) return [];
        return orig(path, opts);
      };
      state.agenda = [
        { id: 'a', titulo: 'A', data_prevista: '2026-10-03', serie_id: 'LENTA' },
        { id: 'b', titulo: 'B', data_prevista: '2026-10-03', serie_id: 'RAPIDA' },
      ];
      openGenericEventDetail(state.agenda[0]);
      openSerieAjusteModal();
      closeModal('serieAjusteModal');
      openGenericEventDetail(state.agenda[1]);
      openSerieAjusteModal();
    }""")
    pg.wait_for_timeout(900)
    check("guarda: prévia é da série B (vazia)", "Nenhuma" in previa(), previa())
    check("guarda: contexto é da série B", pg.evaluate("_serieAjusteCtx?.serieId") == "RAPIDA")

    check("sem pageerror", erros == [], erros)
    b.close()
finalizar()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $SP && pwenv/bin/python test_t4_modal.py`
Expected: FALHA / timeout em `#newEventAjustarSerieButton`.

- [ ] **Step 3: HTML — dentro de `newEventEditScopeWrap`, logo após o `<div>` "Edição em massa não muda data nem nota nem comprador…", inserir:**

```html
            <button id="newEventAjustarSerieButton" class="btn btn-outline" type="button" style="margin-top:10px;">&#128467;&#65039; Ajustar dias desta s&eacute;rie</button>
```

- [ ] **Step 4: HTML — logo após o `</dialog>` que fecha `newEventModal`, inserir:**

```html
    <dialog id="serieAjusteModal" class="details-modal serie-ajuste-modal">
      <form method="dialog" class="modal-card">
        <button class="close-button" type="button" data-close-modal="serieAjusteModal" aria-label="Fechar">
          <span class="close-glyph">&#10005;</span>
        </button>
        <div class="section-title">
          <div>
            <h2>&#128467;&#65039; Ajustar dias desta s&eacute;rie</h2>
            <p id="serieAjusteSubtitulo" class="muted"></p>
          </div>
        </div>
        <div id="serieAjusteDiariaWrap" class="hidden">
          <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Manter a s&eacute;rie nestes dias</span>
          <div id="serieAjusteDias" class="weekday-grid"></div>
          <label class="weekday-extra"><input type="checkbox" id="serieAjusteRemoverFeriados" checked> Tamb&eacute;m remover feriados cadastrados</label>
        </div>
        <div id="serieAjustePrevia" class="weekday-preview"></div>
        <p class="muted" style="font-size:12px;margin:8px 0 0;">S&oacute; compromissos pendentes s&atilde;o alterados. Os j&aacute; conclu&iacute;dos ficam no hist&oacute;rico.</p>
        <div id="serieAjusteFeedback" class="msg hidden"></div>
        <div class="actions">
          <button id="serieAjusteAplicarButton" class="btn" type="button" disabled>Aplicar</button>
          <button class="btn btn-outline" type="button" data-close-modal="serieAjusteModal">Cancelar</button>
        </div>
      </form>
    </dialog>
```

- [ ] **Step 5: CSS — após o bloco `.pedido-modal .modal-card { max-width: 520px; }`:**

```css
.serie-ajuste-modal .modal-card {
  max-width: 560px;
}
```

- [ ] **Step 6: JS — em `script_main.js`, logo após `deleteGenericEvent`:**

```js
// ============================================================
// AJUSTAR DIAS DE UMA SÉRIE EXISTENTE
// ============================================================
// Foi reportado que séries criadas antes da escolha de dias da semana (v77)
// tinham sábado e domingo gravados, e a única saída era excluir a série toda e
// recriar. Diária remove os dias desmarcados; semanal/quinzenal/mensal movem
// fim de semana e feriado para o próximo dia útil.
// Alvos SEMPRE lidos do servidor: state.agenda pode estar parcial (carga
// progressiva) e a confirmação mostraria menos do que seria alterado.
let _serieAjusteToken = 0;
let _serieAjusteCtx = null;

function renderSerieAjusteDias(selected) {
  const wrap = document.getElementById("serieAjusteDias");
  if (!wrap) return;
  wrap.innerHTML = DIAS_SEMANA.map((dia) => `
    <label><input type="checkbox" name="serieAjusteDia" value="${dia}" ${selected.includes(dia) ? "checked" : ""}> ${DIAS_SEMANA_LABEL_CURTO[dia]}</label>
  `).join("");
}

async function openSerieAjusteModal() {
  const editId = document.getElementById("newEventEditId").value.trim();
  const occ = (state.agenda ?? []).find((o) => o.id === editId)
    ?? (state.auditOccurrences ?? []).find((o) => o.id === editId);
  if (!occ?.serie_id) return;
  const s = getSettings();
  const token = ++_serieAjusteToken;
  _serieAjusteCtx = null;
  const titulo = document.getElementById("newEventTitulo").value.trim() || occ.titulo || "esta série";

  const previa = document.getElementById("serieAjustePrevia");
  const botao = document.getElementById("serieAjusteAplicarButton");
  document.getElementById("serieAjusteSubtitulo").textContent = `"${titulo}"`;
  document.getElementById("serieAjusteDiariaWrap").classList.add("hidden");
  document.getElementById("serieAjusteRemoverFeriados").checked = true;
  clearFeedback(document.getElementById("serieAjusteFeedback"));
  previa.classList.remove("alerta");
  previa.textContent = "Carregando as ocorrências da série…";
  botao.disabled = true;
  botao.textContent = "Aplicar";
  const modal = document.getElementById("serieAjusteModal");
  if (!modal.open) modal.showModal();

  let rows;
  try {
    rows = await fetchSupabaseAll(
      `/rest/v1/agenda_ocorrencias?select=id,data_prevista,nota,recorrencia&serie_id=eq.${occ.serie_id}&tenant_id=eq.${s.tenantId}&status=eq.PENDENTE&order=data_prevista.asc,id.asc`
    );
  } catch (err) {
    if (token !== _serieAjusteToken) return;
    previa.textContent = `Não foi possível carregar a série: ${err.message}`;
    previa.classList.add("alerta");
    return;
  }
  if (token !== _serieAjusteToken) return;

  const lista = rows ?? [];
  const modo = inferirModoAjusteSerie(lista);
  _serieAjusteCtx = { token, serieId: occ.serie_id, tenantId: s.tenantId, titulo, rows: lista, modo };
  if (modo === "remover") {
    renderSerieAjusteDias(diasDaSerie(lista) ?? DIAS_SEMANA_PADRAO_DIARIA);
    document.getElementById("serieAjusteDiariaWrap").classList.remove("hidden");
  }
  atualizarPreviaAjusteSerie();
}

function getSerieAjustePlano() {
  const ctx = _serieAjusteCtx;
  if (!ctx) return null;
  if (ctx.modo === "remover") {
    const diasManter = [...document.querySelectorAll('input[name="serieAjusteDia"]:checked')].map((cb) => cb.value);
    const removerFeriados = document.getElementById("serieAjusteRemoverFeriados").checked;
    return planejarAjusteSerie(ctx.rows, "remover", { diasManter, removerFeriados });
  }
  return planejarAjusteSerie(ctx.rows, "mover", { hoje: todayLocalIso() });
}

function atualizarPreviaAjusteSerie() {
  const ctx = _serieAjusteCtx;
  if (!ctx) return;
  const previa = document.getElementById("serieAjustePrevia");
  const botao = document.getElementById("serieAjusteAplicarButton");
  previa.classList.remove("alerta");
  botao.disabled = true;
  botao.textContent = ctx.modo === "remover" ? "Remover" : "Mover";

  if (ctx.modo === "remover" && !document.querySelector('input[name="serieAjusteDia"]:checked')) {
    previa.textContent = "Marque ao menos um dia para manter a série.";
    previa.classList.add("alerta");
    return;
  }

  const { alvos, mantidasPorLembrete } = getSerieAjustePlano();
  const avisoLembrete = mantidasPorLembrete > 0 ? ` · ${mantidasPorLembrete} mantida(s) por terem lembrete` : "";
  if (!alvos.length) {
    previa.textContent = ctx.modo === "remover"
      ? `Nenhuma ocorrência pendente para remover com esses dias.${avisoLembrete}`
      : "Nenhuma ocorrência desta série cai em fim de semana ou feriado.";
    return;
  }
  if (ctx.modo === "remover") {
    previa.textContent = `Serão removidas ${alvos.length} ocorrência(s) · ${formatDate(alvos[0].de)} → ${formatDate(alvos[alvos.length - 1].de)}${avisoLembrete}`;
  } else {
    const linhas = alvos.slice(0, 8).map((a) => `${formatDate(a.de)} → ${formatDate(a.para)}`);
    const resto = alvos.length > 8 ? ` · e mais ${alvos.length - 8}` : "";
    previa.textContent = `Serão movidas ${alvos.length} ocorrência(s) para o próximo dia útil: ${linhas.join(" · ")}${resto}`;
  }
  botao.textContent = `${ctx.modo === "remover" ? "Remover" : "Mover"} ${alvos.length}`;
  botao.disabled = false;
}

async function aplicarAjusteSerie() {
  const ctx = _serieAjusteCtx;
  if (!ctx || ctx.token !== _serieAjusteToken) return;
  const plano = getSerieAjustePlano();
  if (!plano?.alvos.length) return;
  const total = plano.alvos.length;
  const remover = plano.modo === "remover";
  const mensagem = remover
    ? `Remover ${total} ocorrência(s) pendente(s) da série "${ctx.titulo}"? Esta ação não pode ser desfeita.`
    : `Mover ${total} ocorrência(s) da série "${ctx.titulo}" para o próximo dia útil?`;
  if (!confirm(mensagem)) return;

  const botao = document.getElementById("serieAjusteAplicarButton");
  botao.disabled = true;
  botao.textContent = "Aplicando...";
  // status=PENDENTE e tenant_id em toda escrita: segunda trava caso algo tenha
  // sido concluído entre a leitura e a gravação.
  const travas = `&tenant_id=eq.${ctx.tenantId}&status=eq.PENDENTE`;
  let feitas = 0;
  try {
    if (remover) {
      for (let i = 0; i < total; i += 100) {
        const lote = plano.alvos.slice(i, i + 100);
        await fetchSupabase(`/rest/v1/agenda_ocorrencias?id=in.(${lote.map((a) => a.id).join(",")})${travas}`, {
          method: "DELETE",
          headers: { Prefer: "return=minimal" },
        });
        feitas += lote.length;
      }
    } else {
      for (const alvo of plano.alvos) {
        await fetchSupabase(`/rest/v1/agenda_ocorrencias?id=eq.${alvo.id}${travas}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: { data_prevista: alvo.para },
        });
        feitas++;
      }
    }
  } catch (err) {
    // Contexto descartado: um novo clique não pode reaplicar um plano que já
    // foi parcialmente gravado. Reabrir o ajuste relê a série e pega só o resto.
    _serieAjusteCtx = null;
    botao.textContent = "Aplicar";
    setFeedback(
      `Parou no meio: ${feitas} de ${total} concluída(s). Feche e abra o ajuste de novo para terminar. (${err.message})`,
      "error",
      document.getElementById("serieAjusteFeedback")
    );
    try {
      await loadPortalData({ silent: true });
      refreshCalendar();
    } catch {
      // A mensagem acima já orienta o usuário; recarga falha não muda nada.
    }
    return;
  }

  _serieAjusteToken++;
  _serieAjusteCtx = null;
  closeModal("serieAjusteModal");
  closeModal("newEventModal");
  setFeedback(
    remover
      ? `${total} ocorrência(s) removida(s) da série.`
      : `${total} ocorrência(s) movida(s) para o próximo dia útil.`,
    "success"
  );
  await loadPortalData({ silent: true });
  refreshCalendar();
}
```

- [ ] **Step 7: `script_data.js` — logo após o listener de `deleteNewEventButton`:**

```js
  document.getElementById("newEventAjustarSerieButton")?.addEventListener("click", openSerieAjusteModal);
  // Listener no container pega os 7 checkboxes por bubbling (recriados a cada abertura).
  document.getElementById("serieAjusteDias")?.addEventListener("change", atualizarPreviaAjusteSerie);
  document.getElementById("serieAjusteRemoverFeriados")?.addEventListener("change", atualizarPreviaAjusteSerie);
  document.getElementById("serieAjusteAplicarButton")?.addEventListener("click", aplicarAjusteSerie);
```

- [ ] **Step 8: Rodar e ver passar (todas as suítes)**

Run: `cd $SP && for t in test_t1_datas test_t2_criacao test_t3_plano test_t4_modal; do pwenv/bin/python $t.py | tail -1; done && node --check "$PROJ/frontend/script_main.js" && node --check "$PROJ/frontend/script_data.js"`
Expected: `TUDO OK` ×4.

- [ ] **Step 9: Conferência visual (claro e escuro)**

```bash
cd $SP && pwenv/bin/python -c "
from harness import *
import json
with sync_playwright() as p:
    b, pg, erros = abrir(p)
    rows = [{'id': f'd{i}', 'data_prevista': f'2026-10-{i+3:02d}', 'nota': None, 'recorrencia': {'tipo': 'diaria'}} for i in range(16)]
    for tema in ('light', 'dark'):
        pg.evaluate('''([rows, tema]) => {
          applyTheme(tema);
          window.__rows = rows;
          state.agenda = [{ id: 'o', titulo: 'Conciliação de Compras', data_prevista: '2026-10-05', serie_id: 'S' }];
          openGenericEventDetail(state.agenda[0]);
        }''', [rows, tema])
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'serie_edicao_{tema}.png')
        pg.click('#newEventAjustarSerieButton'); pg.wait_for_timeout(500)
        pg.screenshot(path=f'serie_ajuste_{tema}.png')
        pg.evaluate(\"() => { closeModal('serieAjusteModal'); closeModal('newEventModal'); }\")
    b.close()
"
```

Abrir os 4 PNGs com a ferramenta Read. Conferir: checkboxes legíveis (não esticados), prévia visível, botão Aplicar legível nos dois temas, nada cortado pelo ✕. O tema é aplicado por `applyTheme()` ([script_utils.js](../../../frontend/script_utils.js)).

- [ ] **Step 10: Commit**

```bash
cd "$PROJ" && git add frontend/index.html frontend/styles.css frontend/script_main.js frontend/script_data.js && git commit -m "feat(agenda): acao 'Ajustar dias desta serie' para series existentes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Versão, Service Worker, Ajuda e documentação

**Files:**
- Modify: `frontend/sw.js:1`
- Modify: `frontend/script_state.js` (topo de `VERSOES`, linha ~73)
- Modify: `backend/app/data/versoes.py` (topo de `VERSOES`, linha ~10)
- Modify: `frontend/index.html:763-773` (Ajuda — "Dias da semana na repetição diária")
- Modify: `CLAUDE.md` (seção "Modal Novo Evento / Edição" e cabeçalho "cache v78")
- Test: `$SP/test_t5_smoke.py`

**Interfaces:**
- Consumes: `VERSOES` — o rodapé lê `VERSOES[0].versao`.
- Produces: nada consumido por outra task.

- [ ] **Step 1: Teste que falha — `$SP/test_t5_smoke.py`**

```python
from harness import *

PROJ = "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web"
sw = open(f"{PROJ}/frontend/sw.js", encoding="utf-8").read()
check("SW v79", "agenda-compras-v79" in sw)
py = open(f"{PROJ}/backend/app/data/versoes.py", encoding="utf-8").read()
check("versoes.py v79", '"versao": "v79"' in py)
bloco = py[py.index('"versao": "v79"'):py.index('"versao": "v78"')]
proibidos = ["Willian", "Drogaria", "SV", "Conviva", "Velanes", "Total Socorro", "Service Farma", "São Carlos"]
achados = [x for x in proibidos if x.lower() in bloco.lower()]
check("notas sem nome de cliente ou pessoa", not achados, achados)
cl = open(f"{PROJ}/CLAUDE.md", encoding="utf-8").read()
check("CLAUDE.md cita Ajustar dias desta série", "Ajustar dias desta série" in cl)

with sync_playwright() as p:
    b, pg, erros = abrir(p)
    check("VERSOES[0] é v79", pg.evaluate("VERSOES[0].versao") == "v79")
    check("notas JS == Python", all(n in py for n in pg.evaluate("VERSOES[0].notas")))
    check("rodapé v79", "v79" in pg.evaluate("document.getElementById('footerVersionChip').textContent"))
    html = pg.evaluate("document.body.innerHTML")
    check("ajuda: ajustar dias da série", "Ajustar dias desta s" in html and html.count("Ajustar dias desta s") >= 2)
    check("ajuda: próximo dia útil", "pr&oacute;ximo dia &uacute;til" in open(f"{PROJ}/frontend/index.html", encoding="utf-8").read())
    check("ajuda: texto antigo removido (exclua a série e crie de novo)",
          "exclua a s&eacute;rie (op&ccedil;&atilde;o <em>Toda a s&eacute;rie</em>) e crie de novo" not in open(f"{PROJ}/frontend/index.html", encoding="utf-8").read())
    check("sem pageerror", erros == [], erros)
    b.close()
finalizar()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $SP && pwenv/bin/python test_t5_smoke.py`
Expected: FALHA em "SW v79".

- [ ] **Step 3: `frontend/sw.js` linha 1**

```js
const CACHE = 'agenda-compras-v79';
```

- [ ] **Step 4: `script_state.js` — nova 1ª entrada de `VERSOES` (antes da `v78`)**

```js
  {
    versao: "v79",
    dataHora: "17/09/2026 — tarde",
    notas: [
      "Compromissos com repetição mensal, semanal ou quinzenal não caem mais em sábado, domingo ou feriado: a data vai automaticamente para o próximo dia útil. Antes de salvar, a janela mostra quantas datas foram ajustadas.",
      "A repetição mensal agora respeita o dia do mês: \"todo dia 10\" fica sempre no dia 10. Antes ela somava 30 dias e a data ia recuando mês a mês. Quando o dia não existe no mês (31 em fevereiro), vale o último dia.",
      "Na repetição diária, a opção de pular feriados passou a vir marcada e considera também os feriados cadastrados pela empresa, não só os nacionais.",
      "Novo botão \"Ajustar dias desta série\", na janela de edição de um compromisso que se repete. Compradores relataram séries antigas com sábados e domingos e nenhuma forma de retirá-los sem apagar tudo: agora dá para escolher os dias a manter e remover só os outros. Em séries mensais, semanais ou quinzenais, o botão move para o próximo dia útil as datas que caem em fim de semana ou feriado.",
      "O ajuste só mexe em compromissos pendentes. Os já concluídos continuam no histórico, e compromissos com lembrete escrito não são apagados.",
    ],
  },
```

- [ ] **Step 5: `backend/app/data/versoes.py` — nova 1ª entrada (antes da `v78`)**

```python
    {
        "versao": "v79",
        "dataHora": "17/09/2026 — tarde",
        "notas": [
            "Compromissos com repetição mensal, semanal ou quinzenal não caem mais em sábado, domingo ou feriado: a data vai automaticamente para o próximo dia útil. Antes de salvar, a janela mostra quantas datas foram ajustadas.",
            "A repetição mensal agora respeita o dia do mês: \"todo dia 10\" fica sempre no dia 10. Antes ela somava 30 dias e a data ia recuando mês a mês. Quando o dia não existe no mês (31 em fevereiro), vale o último dia.",
            "Na repetição diária, a opção de pular feriados passou a vir marcada e considera também os feriados cadastrados pela empresa, não só os nacionais.",
            "Novo botão \"Ajustar dias desta série\", na janela de edição de um compromisso que se repete. Compradores relataram séries antigas com sábados e domingos e nenhuma forma de retirá-los sem apagar tudo: agora dá para escolher os dias a manter e remover só os outros. Em séries mensais, semanais ou quinzenais, o botão move para o próximo dia útil as datas que caem em fim de semana ou feriado.",
            "O ajuste só mexe em compromissos pendentes. Os já concluídos continuam no histórico, e compromissos com lembrete escrito não são apagados.",
        ],
    },
```

- [ ] **Step 6: Ajuda — substituir o bloco de `<h4>Dias da semana na repeti&ccedil;&atilde;o di&aacute;ria</h4>` até o `<p>Vale para eventos novos…</p>` (inclusive) por:**

```html
                  <h4>Dias da semana na repeti&ccedil;&atilde;o di&aacute;ria</h4>
                  <p>Ao criar um evento com recorr&ecirc;ncia <strong>Di&aacute;ria</strong>, marque os <strong>dias da semana</strong> em que ele deve acontecer. V&ecirc;m marcados de <strong>segunda a sexta</strong>; s&aacute;bados e domingos s&oacute; entram se voc&ecirc; marcar.</p>
                  <ul>
                    <li>Serve para qualquer combina&ccedil;&atilde;o &mdash; segunda a quinta, ou s&oacute; segunda, quarta e sexta</li>
                    <li>Se a data escolhida cair num dia desmarcado, a repeti&ccedil;&atilde;o come&ccedil;a no <strong>pr&oacute;ximo dia marcado</strong></li>
                    <li>A op&ccedil;&atilde;o <strong>Pular feriados cadastrados</strong> vem marcada e deixa de fora os feriados do per&iacute;odo (nacionais e os cadastrados pela empresa)</li>
                    <li>Antes de salvar, a janela mostra <strong>quantas datas</strong> ser&atilde;o criadas e o per&iacute;odo coberto</li>
                  </ul>

                  <h4>Repeti&ccedil;&atilde;o mensal, semanal e quinzenal</h4>
                  <ul>
                    <li>A <strong>mensal</strong> fica sempre no mesmo dia do m&ecirc;s (ex.: todo dia 10). Se o dia n&atilde;o existir no m&ecirc;s, vale o &uacute;ltimo dia</li>
                    <li>Data que cair em <strong>s&aacute;bado, domingo ou feriado</strong> vai para o <strong>pr&oacute;ximo dia &uacute;til</strong> &mdash; a janela avisa quantas foram ajustadas antes de salvar</li>
                  </ul>

                  <h4>Ajustar dias desta s&eacute;rie</h4>
                  <p>Para uma s&eacute;rie que j&aacute; existe, abra um dos compromissos e clique em <strong>Ajustar dias desta s&eacute;rie</strong> (aparece no quadro &ldquo;Aplicar mudan&ccedil;as a&rdquo;).</p>
                  <ul>
                    <li><strong>S&eacute;rie di&aacute;ria:</strong> marque os dias em que ela deve continuar. Os compromissos pendentes nos outros dias s&atilde;o removidos &mdash; e, com a op&ccedil;&atilde;o marcada, tamb&eacute;m os de feriados</li>
                    <li><strong>S&eacute;rie mensal, semanal ou quinzenal:</strong> as datas futuras que caem em fim de semana ou feriado v&atilde;o para o pr&oacute;ximo dia &uacute;til</li>
                    <li>Antes de gravar, a janela mostra exatamente quantos compromissos ser&atilde;o removidos ou movidos</li>
                    <li>S&oacute; compromissos <strong>pendentes</strong> s&atilde;o alterados. Os conclu&iacute;dos ficam no hist&oacute;rico, e os que t&ecirc;m lembrete escrito n&atilde;o s&atilde;o apagados</li>
                  </ul>
```

- [ ] **Step 7: `CLAUDE.md`**

(a) No aviso do topo, trocar `(cache v78 hoje)` por `(cache v79 hoje)`. Na seção "Service Worker e PWA", trocar `agenda-compras-v78` por `agenda-compras-v79`.

(b) Na seção "Modal Novo Evento / Edição", logo após o item **"Dias da semana na Diária (v77 — 31/jul/2026)"**, acrescentar:

```markdown
- **Dia útil nas periódicas + ajuste de séries existentes (v79 — 17/set/2026)**: `buildRecorrenciaDatesUteis(base, tipo, fim)` ([script_main.js](frontend/script_main.js)) substituiu `buildRecorrenciaDates` — **mensal = mesmo dia do mês** (`addMonthsClampIso`, clamp ao último dia; antes somava 30 dias e escorregava) e toda data de semanal/quinzenal/mensal que cai em sábado, domingo ou feriado cadastrado vai para `proximoDiaUtil`. O ajuste parte sempre da data **ideal**, então não acumula; a função **inclui** a data base (o chamador não prefixa `[data, ...]`). Na diária, "Pular feriados cadastrados" passou a vir marcado. A prévia (`newEventRecorrenciaPreview`) saiu do bloco da diária e vale para toda recorrência. **Botão "Ajustar dias desta série"** (bloco de escopo do modal de edição) abre `serieAjusteModal`: lê as PENDENTES da série **do servidor** (`fetchSupabaseAll`, nunca `state.agenda`), `inferirModoAjusteSerie` decide pelo `recorrencia.tipo` ou, sem ele, pela mediana do intervalo; **diária remove** (dias desmarcados + feriados, inclusive vencidas; **preserva quem tem `nota`**), **periódica move** (só `>= hoje`). Gravação com `&tenant_id=eq.&status=eq.PENDENTE` em toda escrita, DELETE em lotes de 100, guarda `_serieAjusteToken`. Séries mensais antigas **não** têm o dia do mês reescrito. Motivo: comprador relatou séries antigas com sábado/domingo e a única saída era apagar tudo; em 17/set/2026 as 50 pendências de fim de semana dele foram removidas por SQL com autorização (backup antes). Spec/plano em `docs/superpowers/specs|plans/2026-09-17-ajuste-dias-uteis-series*`.
```

- [ ] **Step 8: Rodar e ver passar (todas as suítes)**

Run: `cd $SP && for t in test_t1_datas test_t2_criacao test_t3_plano test_t4_modal test_t5_smoke; do pwenv/bin/python $t.py | tail -1; done`
Expected: `TUDO OK` ×5.

- [ ] **Step 9: Commit**

```bash
cd "$PROJ" && git add frontend/sw.js frontend/script_state.js backend/app/data/versoes.py frontend/index.html CLAUDE.md && git commit -m "chore(release): v79 — series em dia util e ajuste de dias de series existentes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Validação final antes do merge

- [ ] **Chrome real:** `cd $SP && for t in test_t1_datas test_t2_criacao test_t3_plano test_t4_modal test_t5_smoke; do PW_CHANNEL=chrome pwenv/bin/python $t.py | tail -1; done` → `TUDO OK` ×5.

- [ ] **E2E real — só Service Farma** (`c2f65634-b7e0-47f0-8937-94446540701a`), roteiro `$SP/e2e_servicefarma.py`:
  1. Login no portal local (`http://localhost:8123`) com o comprador de teste; **espera ativa** (`wait_for_function`) até `state.buyers.length > 0`. **Se a carga falhar ou o tenant carregado não for o da Service Farma, abortar antes de qualquer escrita.**
  2. Criar pelo modal uma série **diária com Sáb e Dom marcados** ("E2E ajuste diária", 14 dias) e uma **mensal** ("E2E ajuste mensal", base num sábado, 3 meses).
  3. Reler do Supabase (chave anon) e conferir: diária com fins de semana; mensal já em dias úteis.
  4. Abrir a diária → "Ajustar dias desta série" → Remover → reler: zero pendências em sáb/dom na série.
  5. `finally`: apagar as duas séries de teste por `serie_id` + `tenant_id` da Service Farma e reler para confirmar zero linhas.

- [ ] **Revisão:** 1 revisor sobre `git diff origin/staging...HEAD`; conferir cada achado no código antes de corrigir.

- [ ] **Deploy:** só com aprovação do André — push `feat/dias-uteis-series` → merge em `staging` → validar → merge em `main`.

**Lacuna declarada:** WebKit/Safari não é testado.

## Notas para quem executar

- `fetchSupabase` stubado em `harness.py` devolve `window.__rows` para GET com `offset=0` e `[]` nas páginas seguintes — assim `fetchSupabaseAll` para na 1ª página.
- `window.__falharNaChamada = N` faz a N-ésima chamada (0-based, contando a partir do último reset de `__calls`) lançar erro.
- **Desvio consciente do spec:** o aviso "⚠️ é feriado" continua também na **diária** (não só no avulso), porque a diária com "pular feriados" desmarcado pode começar num feriado.
- **Desvio consciente do spec:** `diasDaSerie` pré-marca os checkboxes com os dias gravados na série (v77+), em vez de sempre seg–sex — senão uma série "quarta a sábado" proporia apagar os sábados escolhidos.
