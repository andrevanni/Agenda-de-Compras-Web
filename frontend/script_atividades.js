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
