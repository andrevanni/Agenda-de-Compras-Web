# Aba "Outras Atividades" na Auditoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma segunda aba "Outras Atividades" dentro do modal de Auditoria, com dashboard (KPIs, gráficos por categoria/comprador/tendência, drill-down e export Excel) dos compromissos genéricos (fora da Agenda de Compras).

**Architecture:** A Auditoria hoje é um `<dialog id="auditModal">` protegido por senha, com escopo só de Agenda de Compras. Envolvemos o conteúdo atual em `<div id="auditPaneAgenda">` (comportamento inalterado) e adicionamos uma barra de abas + `<div id="auditPaneAtividades">`. Um módulo novo autocontido `frontend/script_atividades.js` — espelhando o padrão testado de `script_eficiencia.js` — renderiza a nova aba reusando `state.agenda`, `state.auditOccurrences`, `state.buyers`, `state.categorias` (sem query nova).

**Tech Stack:** JavaScript vanilla em escopo global (não são ES modules), Chart.js 4.4.4 (UMD, já carregado), SheetJS/XLSX (já carregado), CSS custom properties em `styles.css`.

## Global Constraints

- **Sem ES modules**: todos os `script_*.js` compartilham escopo global; funções de um arquivo só podem ser referenciadas no boot por arquivos carregados ANTES dele. `script_atividades.js` DEVE ser incluído no `index.html` antes de `script_data.js` e `script_main.js`.
- **Variáveis CSS existentes apenas**: usar `--panel-soft`, `--line`, `--panel`, `--text`, `--muted`. NUNCA inventar `--surface-alt`, `--border`, `--card-bg`, `--input-bg`, `--border-color`, `--text-muted`.
- **Sem `id` duplicado** em nenhum elemento HTML (todos os ids novos usam prefixo `at`/`audit`).
- **Bump do Service Worker obrigatório**: `frontend/sw.js` de `agenda-compras-v67` → `agenda-compras-v68`, incluindo `/script_atividades.js` em `LOCAL_ASSETS`.
- **Entrada nova no menu "🆕 Versões"** em DOIS arquivos sincronizados: topo do array `VERSOES` em `frontend/script_state.js` E `backend/app/data/versoes.py`, com `versao: "v68"`. Notas em linguagem de usuário final, sem citar nomes reais.
- **Multi-tenancy**: nenhum acesso a dados fora de `state.*` já filtrado por tenant; este plano não faz query nova.
- **Discriminador de compromisso genérico** (idêntico ao já usado em `script_render.js:22`):
  ```js
  const catAgendaId = state.categorias.find((c) => c.nome === "Agenda de Compras")?.id;
  const ehGenerico = (o) => !o.fornecedor_id && o.categoria_id !== catAgendaId;
  ```

### Utilitários globais já existentes (reusar, não recriar)

- `todayLocalIso()` → `"YYYY-MM-DD"` de hoje (local).
- `addDaysLocalIso(iso, days)` → soma dias a um ISO local.
- `diffDays(isoA, isoB)` → `isoA - isoB` em dias (inteiro).
- `brToIso("DD/MM/AAAA")` / `isoToBr("YYYY-MM-DD")` / `formatDate("YYYY-MM-DD")` → `"DD/MM/AAAA"`.
- `escapeHtml(text)` → escapa HTML.
- `buyerById(id)` → objeto comprador `{ id, nome_comprador, ... }`.
- `categoriaById(id)` → objeto categoria `{ id, nome, cor, icone }` (em `script_main.js:341`).
- `setFeedback(msg, type)` → toast.
- `setupDatePickerField(textId, nativeId, buttonId)` → liga o botão de calendário ao input de data.

### Formato dos dados

- `state.categorias`: `[{ id, nome, cor, icone, ativo }]`.
- `state.buyers`: `[{ id, nome_comprador, ... }]`.
- `state.agenda` (PENDENTES): `[{ id, fornecedor_id, comprador_id, data_prevista, status, titulo, hora_inicio, hora_fim, categoria_id, nota, serie_id }]`.
- `state.auditOccurrences` (REALIZADA/ADIADA): mesmos campos + `observacao, data_realizacao, created_at, updated_at, pedido_*`.

---

## File Structure

- **Create** `frontend/script_atividades.js` — módulo autocontido da aba "Outras Atividades" (constantes, cálculo, render, charts, drill, export, troca de abas).
- **Modify** `frontend/index.html` — barra de abas + wrap `auditPaneAgenda` + novo `auditPaneAtividades`; incluir `<script src="script_atividades.js">` antes de `script_data.js`.
- **Modify** `frontend/styles.css` — estilos das abas (`.audit-tabs`, `.audit-tab`).
- **Modify** `frontend/script_data.js` — listeners da nova aba no `bindEvents` (perto dos listeners `ef*`).
- **Modify** `frontend/script_forms.js` — `unlockAuditView()` reseta para a aba "Agenda de Compras" ao abrir.
- **Modify** `frontend/sw.js` — bump `v67`→`v68` + `/script_atividades.js` nos assets.
- **Modify** `frontend/script_state.js` + `backend/app/data/versoes.py` — entrada `v68` no changelog.

---

## Task 1: HTML — abas, panes e inclusão do script

**Files:**
- Modify: `frontend/index.html` (modal `auditModal`, linhas ~1246-1358; tags `<script>`, linha ~1575)
- Modify: `frontend/styles.css` (append no fim)

**Interfaces:**
- Produces (DOM que Task 2+ consome): barra de abas `#auditTabAgenda`/`#auditTabAtividades`; `#auditPaneAgenda`; `#auditPaneAtividades` contendo filtros `#atPeriodPreset`, `#atStartDate`(+native+picker), `#atEndDate`(+native+picker), `#atBuyerFilter`, `#atCategoriaFilter`, `#atPeriodSummary`, botões `#atRefreshButton`/`#atExportButton`, `#atSummaryGrid`, canvas `#atChartCategoria`/`#atChartComprador`/`#atChartTendencia`, container `#atDrill`.

- [ ] **Step 1: Envolver o conteúdo atual em `auditPaneAgenda` e inserir a barra de abas.**

Em `frontend/index.html`, o bloco atual começa na `<div class="audit-filter-bar">` (linha ~1247) e termina no `</section>` do bloco "Eventos de Cadastro" (linha ~1357), tudo dentro do `<form>` do `auditModal`. Insira a barra de abas logo APÓS o `</div>` que fecha `section-title` (linha ~1245, antes da `audit-filter-bar`) e um `<div id="auditPaneAgenda">` abrindo antes da `audit-filter-bar`; feche esse `</div>` após o `</section>` de "Eventos de Cadastro".

Barra de abas a inserir (após o header `section-title`, antes de `auditPaneAgenda`):

```html
        <div class="audit-tabs" role="tablist">
          <button id="auditTabAgenda" class="audit-tab active" type="button" role="tab" aria-selected="true">Agenda de Compras</button>
          <button id="auditTabAtividades" class="audit-tab" type="button" role="tab" aria-selected="false">Outras Atividades</button>
        </div>

        <div id="auditPaneAgenda">
```

E o fechamento `</div>` do `auditPaneAgenda` logo após o `</section>` do bloco "Eventos de Cadastro" (linha ~1357) e antes do `</form>`.

- [ ] **Step 2: Inserir o pane novo `auditPaneAtividades` logo após o fechamento do `auditPaneAgenda`.**

```html
        <div id="auditPaneAtividades" hidden>
          <div class="audit-filter-bar">
            <label>Período<br>
              <select id="atPeriodPreset">
                <option value="30dias">Últimos 30 dias</option>
                <option value="60dias">Últimos 60 dias</option>
                <option value="90dias" selected>Últimos 90 dias</option>
                <option value="120dias">Últimos 120 dias</option>
                <option value="180dias">Últimos 180 dias</option>
                <option value="personalizado">Entre datas</option>
              </select>
            </label>
            <label>Início<br>
              <div class="date-input-group">
                <input id="atStartDate" type="text" inputmode="numeric" placeholder="DD/MM/AAAA" disabled>
                <button id="atStartDatePickerButton" class="date-picker-button" type="button" aria-label="Abrir calendário da data inicial">&#128197;</button>
                <input id="atStartDateNative" class="native-date-proxy" type="date" tabindex="-1" aria-hidden="true">
              </div>
            </label>
            <label>Fim<br>
              <div class="date-input-group">
                <input id="atEndDate" type="text" inputmode="numeric" placeholder="DD/MM/AAAA" disabled>
                <button id="atEndDatePickerButton" class="date-picker-button" type="button" aria-label="Abrir calendário da data final">&#128197;</button>
                <input id="atEndDateNative" class="native-date-proxy" type="date" tabindex="-1" aria-hidden="true">
              </div>
            </label>
            <label>Comprador<br>
              <select id="atBuyerFilter"><option value="">Todos os compradores</option></select>
            </label>
            <label>Categoria<br>
              <select id="atCategoriaFilter"><option value="">Todas as categorias</option></select>
            </label>
            <div class="actions" style="display:flex;gap:8px;align-items:flex-end;">
              <button id="atExportButton" class="btn btn-outline btn-sm" type="button">&#128228; Exportar</button>
              <button id="atRefreshButton" class="btn btn-outline btn-sm" type="button">Atualizar</button>
            </div>
            <div id="atPeriodSummary" class="audit-period-summary muted"></div>
          </div>

          <p class="muted" style="margin:-4px 0 12px;">Concluídas contam pelo período selecionado. Pendentes e atrasadas são o retrato atual (todas em aberto), independente do período.</p>

          <div id="atSummaryGrid" class="kpi-grid"></div>

          <div class="audit-charts-row">
            <div class="audit-chart-box">
              <div class="audit-chart-label">Tarefas por categoria</div>
              <div class="ef-canvas-wrap"><canvas id="atChartCategoria"></canvas></div>
            </div>
            <div class="audit-chart-box audit-chart-bar-box">
              <div class="audit-chart-label">Tarefas por comprador (status)</div>
              <div class="ef-canvas-wrap"><canvas id="atChartComprador"></canvas></div>
            </div>
          </div>

          <div class="audit-chart-box audit-chart-full">
            <div class="audit-chart-label">Concluídas por semana</div>
            <div class="ef-canvas-wrap"><canvas id="atChartTendencia"></canvas></div>
          </div>

          <div class="audit-block">
            <div class="section-title"><div><h3>Detalhe por comprador &rsaquo; categoria &rsaquo; tarefa</h3><p class="muted">Clique para expandir.</p></div></div>
            <div id="atDrill"></div>
          </div>
        </div>
```

- [ ] **Step 3: Incluir o script novo ANTES de `script_data.js`.**

Na linha ~1575, entre `script_eficiencia.js` e `script_data.js`:

```html
    <script src="script_eficiencia.js"></script>
    <script src="script_atividades.js"></script>
    <script src="script_data.js"></script>
```

- [ ] **Step 4: Adicionar CSS das abas ao fim de `frontend/styles.css`.**

```css
/* Abas do modal de Auditoria (Agenda de Compras / Outras Atividades) */
.audit-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--line);
  margin: 4px 0 16px;
}
.audit-tab {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-weight: 600;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.audit-tab:hover { color: var(--text); }
.audit-tab.active {
  color: var(--text);
  border-bottom-color: #2563eb;
}
```

- [ ] **Step 5: Verificar no navegador que o modal ainda abre e a aba atual está intacta.**

Rode um servidor estático e valide via Playwright (a lógica de troca de abas ainda não existe — só conferimos que nada quebrou):

```bash
cd "frontend" && python3 -m http.server 8123
```

Com Playwright MCP: `browser_navigate` para `http://localhost:8123`, logar em um portal com senha de auditoria configurada, abrir a Auditoria. Esperado: modal abre; duas abas visíveis ("Agenda de Compras" ativa, "Outras Atividades" inativa); todo o dashboard atual (KPIs, gráficos, grupos por comprador) idêntico ao de antes; `browser_console_messages` sem novos erros; o pane "Outras Atividades" existe no DOM porém `hidden`.

- [ ] **Step 6: Commit.**

```bash
git add frontend/index.html frontend/styles.css
git commit -m "feat(auditoria): abas Agenda de Compras / Outras Atividades (scaffold HTML)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Módulo — cálculo, troca de abas e KPIs

**Files:**
- Create: `frontend/script_atividades.js`
- Modify: `frontend/script_data.js` (bloco de listeners `ef*`, ~linha 288-294)
- Modify: `frontend/script_forms.js` (`unlockAuditView`, ~linha 97-117)

**Interfaces:**
- Consumes: `state.agenda`, `state.auditOccurrences`, `state.buyers`, `state.categorias`; utilitários globais listados em Global Constraints; DOM da Task 1.
- Produces: `switchAuditTab(tab)`, `renderAtividades()`, `computeAtividades(range)` → `{ kpis, catRows, buyerRows, tendencia, tarefas }`, `getAtividadesRange()` → `{ start, end, label }`, `exportAtividadesToExcel()`. Contrato de `computeAtividades`:
  - `kpis = { total, concluidas, pendentes, atrasadas, taxaConclusao, nCategorias }`
  - `catRows = [{ catId, nome, cor, total, concluida, pendente, atrasada }]`
  - `buyerRows = [{ buyerId, buyerName, total, concluida, pendente, atrasada, taxaConclusao, categorias: [{ catId, nome, cor, total, concluida, pendente, atrasada, tarefas: [tarefa] }] }]`
  - `tendencia = [{ semana: "YYYY-MM-DD"(segunda), label: "DD/MM", concluidas }]`
  - `tarefa = { id, titulo, catId, catNome, catCor, buyerId, buyerName, dataPrevista, dataRealizacao, estado, horaInicio, horaFim }` com `estado ∈ {"concluida","pendente","atrasada"}`

- [ ] **Step 1: Criar `frontend/script_atividades.js` com constantes, helpers, cálculo, troca de abas, orquestrador e KPIs.**

```js
/* =========================================================================
   Outras Atividades — auditoria dos compromissos genéricos (fora da Agenda
   de Compras). Concluídas contam por período; pendentes/atrasadas são o
   retrato atual. Reusa state.agenda + state.auditOccurrences + state.buyers
   + state.categorias (sem query nova). Espelha o padrão de script_eficiencia.js.
   ========================================================================= */

const AT_ESTADO = {
  concluida: { label: "Concluída", cor: "#10b981" },
  pendente:  { label: "Pendente",  cor: "#f59e0b" },
  atrasada:  { label: "Atrasada",  cor: "#ef4444" },
};
const AT_PERIODO_PADRAO_DIAS = 90;
const AT_FALLBACK_CORES = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6", "#f97316", "#64748b"];

let atFilter = { preset: "90dias", startDate: "", endDate: "" };
let _atChartCategoria = null;
let _atChartComprador = null;
let _atChartTendencia = null;
let _atLastData = null;
let _atLastRange = null;

function _atPct(v) { return (v == null || isNaN(v)) ? "—" : `${Math.round(v * 100)}%`; }

function _atCatAgendaId() { return state.categorias.find((c) => c.nome === "Agenda de Compras")?.id; }

function _atWeekStart(iso) {
  // Segunda-feira da semana do ISO informado.
  const d = new Date(`${iso}T12:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  return addDaysLocalIso(iso, -dow);
}

/* ----- período (espelha getEficienciaRange) ----- */
function getAtividadesRange() {
  const preset = document.getElementById("atPeriodPreset")?.value ?? atFilter.preset;
  const customStart = brToIso(document.getElementById("atStartDate")?.value ?? "");
  const customEnd = brToIso(document.getElementById("atEndDate")?.value ?? "");
  const today = todayLocalIso();
  if (preset === "personalizado") {
    return {
      start: customStart || "", end: customEnd || "",
      label: customStart && customEnd ? `Período: ${formatDate(customStart)} até ${formatDate(customEnd)}` : "Período personalizado em aberto",
    };
  }
  const m = /^(\d+)dias$/.exec(preset || "");
  const dias = m ? parseInt(m[1], 10) : AT_PERIODO_PADRAO_DIAS;
  return { start: addDaysLocalIso(today, -(dias - 1)), end: today, label: `Últimos ${dias} dias` };
}

function syncAtividadesPeriodInputs() {
  const presetInput = document.getElementById("atPeriodPreset");
  const startInput = document.getElementById("atStartDate");
  const endInput = document.getElementById("atEndDate");
  const summary = document.getElementById("atPeriodSummary");
  if (!presetInput || !startInput || !endInput) return;
  const range = getAtividadesRange();
  startInput.value = isoToBr(range.start);
  endInput.value = isoToBr(range.end);
  const isCustom = presetInput.value === "personalizado";
  startInput.disabled = !isCustom;
  endInput.disabled = !isCustom;
  if (summary) summary.textContent = range.label;
}

function _populateAtBuyerFilter() {
  const sel = document.getElementById("atBuyerFilter");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">Todos os compradores</option>` +
    state.buyers.map((b) => `<option value="${b.id}">${escapeHtml(b.nome_comprador)}</option>`).join("");
  if (current) sel.value = current;
}

function _populateAtCategoriaFilter() {
  const sel = document.getElementById("atCategoriaFilter");
  if (!sel) return;
  const current = sel.value;
  const catAgendaId = _atCatAgendaId();
  const cats = state.categorias
    .filter((c) => c.id !== catAgendaId)
    .slice().sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  sel.innerHTML = `<option value="">Todas as categorias</option>` +
    cats.map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");
  if (current) sel.value = current;
}

/* ----- cálculo ----- */
function computeAtividades(range) {
  const startIso = range.start;
  const endIso = range.end || todayLocalIso();
  const today = todayLocalIso();
  const filterBuyerId = document.getElementById("atBuyerFilter")?.value ?? "";
  const filterCategoriaId = document.getElementById("atCategoriaFilter")?.value ?? "";
  const catAgendaId = _atCatAgendaId();
  const ehGenerico = (o) => !o.fornecedor_id && o.categoria_id !== catAgendaId;
  const matchFilters = (o) =>
    (!filterBuyerId || o.comprador_id === filterBuyerId) &&
    (!filterCategoriaId || o.categoria_id === filterCategoriaId);

  const buildTarefa = (o, estado) => {
    const cat = categoriaById(o.categoria_id);
    const buyer = buyerById(o.comprador_id);
    return {
      id: o.id,
      titulo: o.titulo || "(sem título)",
      catId: o.categoria_id || "sem-cat",
      catNome: cat?.nome || "Sem categoria",
      catCor: cat?.cor || "#94a3b8",
      buyerId: buyer?.id || "sem-comprador",
      buyerName: buyer?.nome_comprador || "Sem comprador",
      dataPrevista: o.data_prevista || null,
      dataRealizacao: o.data_realizacao || null,
      estado,
      horaInicio: o.hora_inicio || null,
      horaFim: o.hora_fim || null,
    };
  };

  // Concluídas: pelo período (por data_realizacao)
  const concluidas = (state.auditOccurrences ?? [])
    .filter((o) => o.status === "REALIZADA" && ehGenerico(o) && matchFilters(o) && o.data_realizacao &&
      (!startIso || o.data_realizacao >= startIso) && (!endIso || o.data_realizacao <= endIso))
    .map((o) => buildTarefa(o, "concluida"));

  // Pendentes/atrasadas: retrato atual (todas em aberto)
  const abertas = (state.agenda ?? []).filter((o) => ehGenerico(o) && matchFilters(o));
  const pendentes = abertas.filter((o) => !o.data_prevista || o.data_prevista >= today).map((o) => buildTarefa(o, "pendente"));
  const atrasadas = abertas.filter((o) => o.data_prevista && o.data_prevista < today).map((o) => buildTarefa(o, "atrasada"));

  const tarefas = [...concluidas, ...pendentes, ...atrasadas];

  // KPIs
  const total = tarefas.length;
  const nConcl = concluidas.length, nPend = pendentes.length, nAtr = atrasadas.length;
  const nCategorias = new Set(tarefas.map((t) => t.catId)).size;
  const kpis = {
    total, concluidas: nConcl, pendentes: nPend, atrasadas: nAtr,
    taxaConclusao: total > 0 ? nConcl / total : null,
    nCategorias,
  };

  // Agregação por categoria
  const catMap = new Map();
  tarefas.forEach((t) => {
    if (!catMap.has(t.catId)) catMap.set(t.catId, { catId: t.catId, nome: t.catNome, cor: t.catCor, total: 0, concluida: 0, pendente: 0, atrasada: 0 });
    const g = catMap.get(t.catId);
    g.total++; g[t.estado]++;
  });
  const catRows = Array.from(catMap.values()).sort((a, b) => b.total - a.total);

  // Agregação por comprador (com categorias aninhadas p/ drill)
  const buyerMap = new Map();
  tarefas.forEach((t) => {
    if (!buyerMap.has(t.buyerId)) buyerMap.set(t.buyerId, { buyerId: t.buyerId, buyerName: t.buyerName, total: 0, concluida: 0, pendente: 0, atrasada: 0, _cats: new Map() });
    const g = buyerMap.get(t.buyerId);
    g.total++; g[t.estado]++;
    if (!g._cats.has(t.catId)) g._cats.set(t.catId, { catId: t.catId, nome: t.catNome, cor: t.catCor, total: 0, concluida: 0, pendente: 0, atrasada: 0, tarefas: [] });
    const c = g._cats.get(t.catId);
    c.total++; c[t.estado]++; c.tarefas.push(t);
  });
  const buyerRows = Array.from(buyerMap.values()).map((g) => ({
    buyerId: g.buyerId, buyerName: g.buyerName, total: g.total,
    concluida: g.concluida, pendente: g.pendente, atrasada: g.atrasada,
    taxaConclusao: g.total > 0 ? g.concluida / g.total : null,
    categorias: Array.from(g._cats.values()).sort((a, b) => b.total - a.total),
  })).sort((a, b) => b.total - a.total);

  // Tendência: concluídas por semana (segunda-feira)
  const semanaMap = new Map();
  concluidas.forEach((t) => {
    if (!t.dataRealizacao) return;
    const seg = _atWeekStart(t.dataRealizacao);
    semanaMap.set(seg, (semanaMap.get(seg) || 0) + 1);
  });
  const tendencia = Array.from(semanaMap.keys()).sort().map((seg) => ({
    semana: seg, label: isoToBr(seg).slice(0, 5), concluidas: semanaMap.get(seg),
  }));

  return { kpis, catRows, buyerRows, tendencia, tarefas };
}

/* ----- render ----- */
function renderAtividades() {
  const pane = document.getElementById("auditPaneAtividades");
  if (!pane) return;
  syncAtividadesPeriodInputs();
  _populateAtBuyerFilter();
  _populateAtCategoriaFilter();

  const range = getAtividadesRange();
  const data = computeAtividades(range);
  _atLastData = data; _atLastRange = range;

  _renderAtKpis(data.kpis);
  _renderAtCharts(data);
  _renderAtDrill(data.buyerRows);
}

function _renderAtKpis(k) {
  const grid = document.getElementById("atSummaryGrid");
  if (!grid) return;
  const cards = [
    { label: "Total de tarefas", value: String(k.total), hint: "no período (concluídas) + em aberto" },
    { label: "Concluídas", value: String(k.concluidas), hint: "no período selecionado" },
    { label: "Pendentes", value: String(k.pendentes), hint: "em aberto (situação atual)" },
    { label: "Atrasadas", value: String(k.atrasadas), hint: "vencidas e ainda em aberto" },
    { label: "Taxa de conclusão", value: _atPct(k.taxaConclusao), hint: "concluídas ÷ total exibido" },
    { label: "Categorias ativas", value: String(k.nCategorias), hint: "com ao menos 1 tarefa" },
  ];
  grid.innerHTML = cards.map((c) => `
    <div class="kpi-card">
      <span class="kpi-card-label">${c.label}</span>
      <span class="kpi-card-value">${c.value}</span>
      <span class="kpi-card-hint muted">${c.hint}</span>
    </div>`).join("");
}

function _atDestroy(c) { if (c) { try { c.destroy(); } catch { /* noop */ } } }

/* Stubs substituídos nas Tasks 3, 4 e 5. Precisam existir já aqui porque
   renderAtividades() os chama e o listener de export referencia a função no
   boot (senão dá ReferenceError em bindEvents). */
function _renderAtCharts() { /* Task 3 */ }
function _renderAtDrill() { /* Task 4 */ }
function exportAtividadesToExcel() { /* Task 5 */ }

/* ----- troca de abas do modal de Auditoria ----- */
function switchAuditTab(tab) {
  const paneAgenda = document.getElementById("auditPaneAgenda");
  const paneAtiv = document.getElementById("auditPaneAtividades");
  const tabAgenda = document.getElementById("auditTabAgenda");
  const tabAtiv = document.getElementById("auditTabAtividades");
  const headerExport = document.getElementById("exportAuditButton");
  const headerRefresh = document.getElementById("refreshAuditButton");
  if (!paneAgenda || !paneAtiv) return;

  const isAtiv = tab === "atividades";
  paneAgenda.hidden = isAtiv;
  paneAtiv.hidden = !isAtiv;
  tabAgenda?.classList.toggle("active", !isAtiv);
  tabAtiv?.classList.toggle("active", isAtiv);
  tabAgenda?.setAttribute("aria-selected", String(!isAtiv));
  tabAtiv?.setAttribute("aria-selected", String(isAtiv));
  // Os botões do cabeçalho agem sobre a aba Agenda; escondê-los na aba Atividades
  // (que tem seus próprios Exportar/Atualizar).
  if (headerExport) headerExport.style.display = isAtiv ? "none" : "";
  if (headerRefresh) headerRefresh.style.display = isAtiv ? "none" : "";

  if (isAtiv) renderAtividades();
}
```

- [ ] **Step 2: Ligar os listeners no `bindEvents` de `frontend/script_data.js`.**

Logo após a linha `document.getElementById("efExportButton")?.addEventListener("click", exportEficienciaToExcel);` (~linha 294), inserir:

```js
  // Aba "Outras Atividades" da Auditoria
  document.getElementById("auditTabAgenda")?.addEventListener("click", () => switchAuditTab("agenda"));
  document.getElementById("auditTabAtividades")?.addEventListener("click", () => switchAuditTab("atividades"));
  setupDatePickerField("atStartDate", "atStartDateNative", "atStartDatePickerButton");
  setupDatePickerField("atEndDate", "atEndDateNative", "atEndDatePickerButton");
  document.getElementById("atPeriodPreset")?.addEventListener("change", renderAtividades);
  document.getElementById("atStartDate")?.addEventListener("change", renderAtividades);
  document.getElementById("atEndDate")?.addEventListener("change", renderAtividades);
  document.getElementById("atBuyerFilter")?.addEventListener("change", renderAtividades);
  document.getElementById("atCategoriaFilter")?.addEventListener("change", renderAtividades);
  document.getElementById("atRefreshButton")?.addEventListener("click", renderAtividades);
  document.getElementById("atExportButton")?.addEventListener("click", exportAtividadesToExcel);
```

- [ ] **Step 3: Resetar para a aba "Agenda de Compras" ao abrir a Auditoria.**

Em `frontend/script_forms.js`, dentro de `unlockAuditView()` (~linha 112-116), logo antes de `document.getElementById("auditModal").showModal();`, inserir:

```js
  if (typeof switchAuditTab === "function") switchAuditTab("agenda");
```

- [ ] **Step 4: Verificar os KPIs com dados reais e um oráculo independente.**

Servidor local rodando (Task 1, Step 5). Via Playwright: abrir a Auditoria, clicar em "Outras Atividades". Esperado: pane troca, botões do cabeçalho somem, KPIs aparecem em `#atSummaryGrid`.

Confirme os números com uma recontagem independente via `browser_evaluate`:

```js
(() => {
  const catAgendaId = state.categorias.find(c => c.nome === "Agenda de Compras")?.id;
  const eh = o => !o.fornecedor_id && o.categoria_id !== catAgendaId;
  const today = todayLocalIso();
  const r = getAtividadesRange();
  const concl = (state.auditOccurrences||[]).filter(o => o.status==="REALIZADA" && eh(o) && o.data_realizacao && (!r.start||o.data_realizacao>=r.start) && (!r.end||o.data_realizacao<=r.end)).length;
  const abertas = (state.agenda||[]).filter(eh);
  const pend = abertas.filter(o => !o.data_prevista || o.data_prevista>=today).length;
  const atr = abertas.filter(o => o.data_prevista && o.data_prevista<today).length;
  const k = computeAtividades(r).kpis;
  return { oracle: {concl, pend, atr, total: concl+pend+atr}, kpis: k, ok: k.concluidas===concl && k.pendentes===pend && k.atrasadas===atr && k.total===concl+pend+atr };
})()
```

Esperado: `ok === true`. `browser_console_messages` sem erros.

- [ ] **Step 5: Commit.**

```bash
git add frontend/script_atividades.js frontend/script_data.js frontend/script_forms.js
git commit -m "feat(auditoria): modulo Outras Atividades - calculo, troca de abas e KPIs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Gráficos (categoria, comprador, tendência)

**Files:**
- Modify: `frontend/script_atividades.js` (substituir o stub `_renderAtCharts`)

**Interfaces:**
- Consumes: `computeAtividades()` output (`catRows`, `buyerRows`, `tendencia`); Chart.js global `Chart`; canvas `#atChartCategoria`/`#atChartComprador`/`#atChartTendencia`; `_atDestroy`, `AT_ESTADO`, `AT_FALLBACK_CORES`.
- Produces: gráficos renderizados; atualiza `_atChartCategoria/_atChartComprador/_atChartTendencia`.

- [ ] **Step 1: Substituir o stub `_renderAtCharts()` pela implementação real.**

```js
function _renderAtCharts(data) {
  if (typeof Chart === "undefined") return;
  const { catRows, buyerRows, tendencia } = data;

  // 1. Tarefas por categoria (rosca) — cores reais das categorias
  const ctxCat = document.getElementById("atChartCategoria")?.getContext("2d");
  if (ctxCat) {
    _atDestroy(_atChartCategoria);
    const cores = catRows.map((c, i) => c.cor || AT_FALLBACK_CORES[i % AT_FALLBACK_CORES.length]);
    _atChartCategoria = new Chart(ctxCat, {
      type: "doughnut",
      data: { labels: catRows.map((c) => c.nome), datasets: [{ data: catRows.map((c) => c.total), backgroundColor: cores }] },
      options: { plugins: { legend: { position: "bottom" } }, responsive: true, maintainAspectRatio: false },
    });
  }

  // 2. Tarefas por comprador — barras horizontais empilhadas por estado
  const ctxBuyer = document.getElementById("atChartComprador")?.getContext("2d");
  if (ctxBuyer) {
    _atDestroy(_atChartComprador);
    _atChartComprador = new Chart(ctxBuyer, {
      type: "bar",
      data: {
        labels: buyerRows.map((b) => b.buyerName),
        datasets: [
          { label: AT_ESTADO.concluida.label, data: buyerRows.map((b) => b.concluida), backgroundColor: AT_ESTADO.concluida.cor },
          { label: AT_ESTADO.pendente.label,  data: buyerRows.map((b) => b.pendente),  backgroundColor: AT_ESTADO.pendente.cor },
          { label: AT_ESTADO.atrasada.label,  data: buyerRows.map((b) => b.atrasada),  backgroundColor: AT_ESTADO.atrasada.cor },
        ],
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } },
      },
    });
  }

  // 3. Concluídas por semana (linha)
  const ctxTend = document.getElementById("atChartTendencia")?.getContext("2d");
  if (ctxTend) {
    _atDestroy(_atChartTendencia);
    _atChartTendencia = new Chart(ctxTend, {
      type: "line",
      data: { labels: tendencia.map((t) => t.label), datasets: [{ label: "Concluídas", data: tendencia.map((t) => t.concluidas), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.15)", fill: true, tension: 0.3 }] },
      options: { plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }
}
```

- [ ] **Step 2: Verificar os gráficos no navegador.**

Via Playwright na aba "Outras Atividades": os 3 gráficos desenham. `browser_evaluate` para confirmar tipos e contagem:

```js
({
  categoria: _atChartCategoria?.config.type,
  comprador: _atChartComprador?.config.type,
  tendencia: _atChartTendencia?.config.type,
  fatiasCategoria: _atChartCategoria?.data.labels.length,
  datasetsComprador: _atChartComprador?.data.datasets.length,
})
```

Esperado: `categoria: "doughnut"`, `comprador: "bar"`, `tendencia: "line"`, `datasetsComprador: 3`. Trocar o filtro de período e confirmar que os gráficos redesenham sem erro no console (destroy inline funciona).

- [ ] **Step 3: Commit.**

```bash
git add frontend/script_atividades.js
git commit -m "feat(auditoria): graficos da aba Outras Atividades (categoria, comprador, tendencia)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Drill-down (comprador → categoria → tarefas)

**Files:**
- Modify: `frontend/script_atividades.js` (substituir o stub `_renderAtDrill`)

**Interfaces:**
- Consumes: `buyerRows` de `computeAtividades()`; `escapeHtml`, `formatDate`, `AT_ESTADO`, `_atPct`.
- Produces: HTML de `<details>` aninhados em `#atDrill`.

- [ ] **Step 1: Substituir o stub `_renderAtDrill()` pela implementação real.**

```js
function _atEstadoPill(estado) {
  const e = AT_ESTADO[estado];
  return `<span class="ef-flag" style="background:${e.cor}22;color:${e.cor}">${e.label}</span>`;
}

function _renderAtDrill(buyerRows) {
  const el = document.getElementById("atDrill");
  if (!el) return;
  if (!buyerRows.length) { el.innerHTML = `<div class="msg info">Nenhuma tarefa para os filtros selecionados.</div>`; return; }
  el.innerHTML = buyerRows.map((b) => `
    <details class="ef-buyer-group" open>
      <summary>
        <span class="ef-buyer-name">${escapeHtml(b.buyerName)}</span>
        <span class="ef-buyer-meta muted">${b.total} tarefa(s) · ${b.concluida} concluída(s) · ${b.pendente} pendente(s) · ${b.atrasada} atrasada(s) · ${_atPct(b.taxaConclusao)} conclusão</span>
      </summary>
      <div class="ef-forn-list">
        ${b.categorias.map((c) => `
          <details class="ef-forn-card">
            <summary>
              <span class="ef-forn-title"><span class="cat-pill" style="background:${c.cor}22;color:${c.cor}">${escapeHtml(c.nome)}</span></span>
              <span class="ef-forn-flags muted">${c.total} · ${c.concluida}✓ ${c.pendente}⏳ ${c.atrasada}⚠️</span>
            </summary>
            <div class="ef-forn-body">
              ${_renderAtTarefasTable(c.tarefas)}
            </div>
          </details>`).join("")}
      </div>
    </details>`).join("");
}

function _renderAtTarefasTable(tarefas) {
  if (!tarefas.length) return `<p class="muted ef-empty">Sem tarefas.</p>`;
  const ordenadas = tarefas.slice().sort((a, b) => (b.dataRealizacao || b.dataPrevista || "").localeCompare(a.dataRealizacao || a.dataPrevista || ""));
  return `
    <table class="audit-event-table ef-pedidos-table">
      <thead><tr><th>Tarefa</th><th>Categoria</th><th>Prevista</th><th>Realizada</th><th>Status</th><th>Horário</th></tr></thead>
      <tbody>
        ${ordenadas.map((t) => `
          <tr>
            <td>${escapeHtml(t.titulo)}</td>
            <td><span class="cat-pill" style="background:${t.catCor}22;color:${t.catCor}">${escapeHtml(t.catNome)}</span></td>
            <td>${t.dataPrevista ? formatDate(t.dataPrevista) : "—"}</td>
            <td>${t.dataRealizacao ? formatDate(t.dataRealizacao) : "—"}</td>
            <td>${_atEstadoPill(t.estado)}</td>
            <td>${t.horaInicio ? escapeHtml(t.horaInicio) + (t.horaFim ? "–" + escapeHtml(t.horaFim) : "") : "—"}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}
```

- [ ] **Step 2: Adicionar CSS do `.cat-pill` ao fim de `frontend/styles.css`.**

```css
.cat-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.82em;
  font-weight: 600;
  white-space: nowrap;
}
```

- [ ] **Step 3: Verificar o drill no navegador.**

Via Playwright na aba "Outras Atividades": `#atDrill` mostra um `<details>` por comprador; expandir mostra `<details>` por categoria; expandir mostra a tabela de tarefas com pill de categoria colorida e pill de status. `browser_evaluate` para conferir contagem de grupos:

```js
document.querySelectorAll("#atDrill > details").length
```

Esperado: igual a `computeAtividades(getAtividadesRange()).buyerRows.length`. Conferir em tema claro E escuro que os textos das pills são legíveis (contraste do `22` alpha sobre a cor).

- [ ] **Step 4: Commit.**

```bash
git add frontend/script_atividades.js frontend/styles.css
git commit -m "feat(auditoria): drill-down comprador>categoria>tarefa em Outras Atividades

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Exportação Excel (3 abas)

**Files:**
- Modify: `frontend/script_atividades.js` (implementar `exportAtividadesToExcel`)

**Interfaces:**
- Consumes: `_atLastData` (`catRows`, `buyerRows`, `tarefas`), `_atLastRange`; `XLSX` global; `formatDate`, `setFeedback`, `AT_ESTADO`.
- Produces: `exportAtividadesToExcel()` — baixa `.xlsx` com abas *Por Categoria*, *Por Comprador*, *Tarefas*.

- [ ] **Step 1: Substituir o stub `exportAtividadesToExcel()` (criado na Task 2) pela implementação real em `frontend/script_atividades.js`.**

```js
/* ----- exportação Excel ----- */
function exportAtividadesToExcel() {
  if (typeof XLSX === "undefined") { setFeedback("Biblioteca de exportação indisponível.", "warning"); return; }
  if (!_atLastData || !_atLastData.tarefas.length) { setFeedback("Nenhuma tarefa para exportar.", "warning"); return; }
  const { catRows, buyerRows, tarefas } = _atLastData;

  const catSheet = catRows.map((c) => ({
    "Categoria": c.nome, "Total": c.total, "Concluídas": c.concluida, "Pendentes": c.pendente, "Atrasadas": c.atrasada,
  }));
  const buyerSheet = buyerRows.map((b) => ({
    "Comprador": b.buyerName, "Total": b.total, "Concluídas": b.concluida, "Pendentes": b.pendente, "Atrasadas": b.atrasada,
    "Taxa conclusão %": b.taxaConclusao != null ? Math.round(b.taxaConclusao * 100) : "",
  }));
  const tarefaSheet = tarefas.map((t) => ({
    "Comprador": t.buyerName, "Categoria": t.catNome, "Tarefa": t.titulo,
    "Data prevista": t.dataPrevista ? formatDate(t.dataPrevista) : "",
    "Data realizada": t.dataRealizacao ? formatDate(t.dataRealizacao) : "",
    "Status": AT_ESTADO[t.estado].label,
    "Horário": t.horaInicio ? (t.horaInicio + (t.horaFim ? "–" + t.horaFim : "")) : "",
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catSheet), "Por Categoria");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buyerSheet), "Por Comprador");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tarefaSheet), "Tarefas");
  const range = _atLastRange || { start: "", end: "" };
  XLSX.writeFile(wb, `atividades_${range.start}_${range.end}.xlsx`);
}
```

- [ ] **Step 2: Verificar o download no navegador.**

Via Playwright na aba "Outras Atividades", clicar em "📤 Exportar". Esperado: download de `atividades_<inicio>_<fim>.xlsx`. `browser_evaluate` para validar a estrutura sem baixar arquivo:

```js
(() => {
  const d = _atLastData;
  return { temDados: !!d && d.tarefas.length > 0, cats: d?.catRows.length, buyers: d?.buyerRows.length, tarefas: d?.tarefas.length };
})()
```

Esperado: `temDados: true` e contagens coerentes com o drill. Console sem erros ao exportar.

- [ ] **Step 3: Commit.**

```bash
git add frontend/script_atividades.js
git commit -m "feat(auditoria): exportacao Excel (3 abas) da aba Outras Atividades

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Bump do Service Worker + entrada em Versões (v68)

**Files:**
- Modify: `frontend/sw.js` (constante `CACHE` + `LOCAL_ASSETS`)
- Modify: `frontend/script_state.js` (topo do array `VERSOES`, ~linha 127)
- Modify: `backend/app/data/versoes.py` (topo do array `VERSOES`, ~linha 11)

**Interfaces:**
- Consumes: nada.
- Produces: cache `agenda-compras-v68`; `script_atividades.js` cacheado; changelog `v68` visível no rodapé e no menu Versões.

- [ ] **Step 1: Bump do cache e inclusão do asset em `frontend/sw.js`.**

Trocar `const CACHE = 'agenda-compras-v67';` por:

```js
const CACHE = 'agenda-compras-v68';
```

Adicionar `'/script_atividades.js',` em `LOCAL_ASSETS`, logo após `'/script_eficiencia.js',`:

```js
  '/script_eficiencia.js',
  '/script_atividades.js',
```

- [ ] **Step 2: Adicionar a entrada `v68` no topo de `VERSOES` em `frontend/script_state.js`.**

Inserir como PRIMEIRO elemento do array (antes da entrada `v67`), logo após `const VERSOES = [`:

```js
  {
    versao: "v68",
    dataHora: "10/07/2026 — manhã",
    notas: [
      "Auditoria: nova aba \"Outras Atividades\" ao lado de \"Agenda de Compras\".",
      "Ela analisa os compromissos que não são de fornecedores (tarefas gerais da operação): total, concluídas, pendentes e atrasadas, com taxa de conclusão.",
      "Gráficos por categoria (com as cores de cada categoria), por comprador (mostrando o status de cada um) e a evolução de concluídas por semana.",
      "É possível abrir o detalhe por comprador e por categoria até a lista de tarefas, e exportar tudo para Excel.",
    ],
  },
```

- [ ] **Step 3: Adicionar a MESMA entrada no topo de `VERSOES` em `backend/app/data/versoes.py`.**

Inserir como PRIMEIRO elemento (antes da entrada `"v67"`), logo após `VERSOES = [`:

```python
    {
        "versao": "v68",
        "dataHora": "10/07/2026 — manhã",
        "notas": [
            "Auditoria: nova aba \"Outras Atividades\" ao lado de \"Agenda de Compras\".",
            "Ela analisa os compromissos que não são de fornecedores (tarefas gerais da operação): total, concluídas, pendentes e atrasadas, com taxa de conclusão.",
            "Gráficos por categoria (com as cores de cada categoria), por comprador (mostrando o status de cada um) e a evolução de concluídas por semana.",
            "É possível abrir o detalhe por comprador e por categoria até a lista de tarefas, e exportar tudo para Excel.",
        ],
    },
```

- [ ] **Step 4: Verificar sincronia e valores.**

```bash
grep -m1 "agenda-compras-v" frontend/sw.js
grep -c "script_atividades.js" frontend/sw.js
grep -m1 'versao: "v68"' frontend/script_state.js
grep -m1 '"versao": "v68"' backend/app/data/versoes.py
```

Esperado: SW `v68`; `1` ocorrência de `script_atividades.js` no sw.js; entrada `v68` presente nos dois arquivos de Versões. Conferir que a contagem de linhas `notas` é idêntica nos dois (4 linhas).

- [ ] **Step 5: Commit.**

```bash
git add frontend/sw.js frontend/script_state.js backend/app/data/versoes.py
git commit -m "chore(auditoria): SW v68 + entrada Versoes (aba Outras Atividades)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Validação end-to-end + regressão

**Files:** nenhum (validação; correções pontuais se surgirem).

**Interfaces:** exercita o fluxo completo no navegador.

- [ ] **Step 1: Regressão da aba "Agenda de Compras".**

Servidor local rodando. Via Playwright, logar e abrir a Auditoria. Confirmar que a aba "Agenda de Compras" (default) mostra o dashboard original completo (KPIs, timeline, pizza, barras, heatmap, top 5, recomendações, grupos por comprador, eventos de cadastro) idêntico ao comportamento anterior. Botões "Exportar"/"Atualizar" do cabeçalho visíveis e funcionando. `browser_console_messages` sem erros.

- [ ] **Step 2: Fluxo completo da aba "Outras Atividades".**

Clicar "Outras Atividades" → KPIs, 3 gráficos e drill renderizam; botões do cabeçalho somem; "Exportar"/"Atualizar" da própria aba presentes. Trocar filtro de período (30/60/90/120/180 e "Entre datas"), comprador e categoria — tudo re-renderiza sem erro. Voltar para "Agenda de Compras" e confirmar que os botões do cabeçalho reaparecem e o dashboard original segue intacto.

- [ ] **Step 3: Tema claro e escuro.**

Alternar o tema do portal (`agenda_ui_theme`). Confirmar legibilidade dos KPIs, gráficos, pills de categoria/status e tabelas do drill em ambos. Nenhuma cor hardcoded ilegível.

- [ ] **Step 4: Validação com dados da Drogaria SV (modelo pedido pelo usuário).**

Após o deploy (merge em `main`), abrir a produção logado no tenant Drogaria SV (`f0d557c6-9dd9-4e80-96e0-2094da4a40ff`) e conferir que os números da aba "Outras Atividades" batem com os compromissos genéricos reais do tenant (concluídos no período + pendentes/atrasados em aberto). Este é o mesmo padrão de validação usado na Eficiência. Se a produção estiver com cache preso, usar `/?limpar=1` (reset nuclear).

- [ ] **Step 5: Nenhum commit adicional se a validação passar.**

Se forem necessárias correções, cada uma vira seu próprio commit com mensagem descritiva. Ao final, a feature está pronta para merge `staging → main`.
