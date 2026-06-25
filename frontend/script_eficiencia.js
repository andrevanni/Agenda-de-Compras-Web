/* =========================================================================
   Eficiência da Agenda — valida se a FREQUÊNCIA de cada fornecedor está
   funcionando: compara o intervalo REAL entre pedidos com o intervalo-ALVO
   determinado pela frequência cadastrada do fornecedor.
   Reusa state.auditOccurrences + state.suppliers + state.buyers (sem query nova).
   ========================================================================= */

const VALORES_FREQUENCIA = [1, 2, 4, 8, 12];
const FREQ_LABEL = { 1: "Mensal", 2: "Quinzenal", 4: "Semanal", 8: "2×/semana", 12: "3×/semana" };
// Intervalo-alvo entre pedidos (dias) determinado pela frequência do fornecedor.
const INTERVALO_ALVO_FREQ = { 1: 28, 2: 14, 4: 7, 8: 3.5, 12: 2.33 };

// Tolerância: acima de +10% do intervalo-alvo já é problema — o estoque de
// segurança não cobre pedidos mais espaçados que o previsto.
const EF_TOLERANCIA = 0.10;
const EF_CONVERSAO_ALERTA = 0.60;   // < 60% das agendas viram pedido

const EF_STATUS = {
  no_ritmo:        { label: "No ritmo",          icon: "✅", cor: "#10b981" },
  abaixo:          { label: "Abaixo do esperado", icon: "⚠️", cor: "#ef4444" },
  acima:           { label: "Acima do esperado",  icon: "🔵", cor: "#3b82f6" },
  sem_pedido:      { label: "Sem pedido",         icon: "⚪", cor: "#94a3b8" },
  dados_limitados: { label: "Dados limitados",    icon: "⏳", cor: "#a78bfa" },
};

let efFilter = { preset: "90dias", startDate: "", endDate: "" };
const EF_PERIODO_PADRAO_DIAS = 90;
let _efChartStatus = null;
let _efChartMotivos = null;
let _efChartDesvio = null;
let _efChartValor = null;
let _efChartTendencia = null;
let _efLastRows = null;
let _efLastRange = null;

function intervaloAlvo(freq) {
  return INTERVALO_ALVO_FREQ[freq] ?? null;
}

// Sugere a frequência cujo intervalo-alvo é o mais próximo do intervalo real.
function sugerirFrequenciaPorIntervalo(intervaloReal) {
  if (!intervaloReal || intervaloReal <= 0) return null;
  let best = null, bestDiff = Infinity;
  for (const f of VALORES_FREQUENCIA) {
    const d = Math.abs(INTERVALO_ALVO_FREQ[f] - intervaloReal);
    if (d < bestDiff) { bestDiff = d; best = f; }
  }
  return best;
}

function _efAvg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function _efStdDev(arr) {
  if (arr.length < 2) return 0;
  const m = _efAvg(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}
function _efBRL(v) { return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function _efPct(v) { return (v == null || isNaN(v)) ? "—" : `${Math.round(v * 100)}%`; }
function _efSignedPct(v) { return (v == null || isNaN(v)) ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`; }
function _efNum(v, dec = 1) {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function _efFreqLabel(freq) {
  const alvo = intervaloAlvo(freq);
  return `${FREQ_LABEL[freq] || `Freq ${freq}`}${alvo ? ` (alvo ${_efNum(alvo, alvo % 1 ? 1 : 0)}d)` : ""}`;
}

/* ----- período ----- */
function getEficienciaRange() {
  const preset = document.getElementById("efPeriodPreset")?.value ?? efFilter.preset;
  const customStart = brToIso(document.getElementById("efStartDate")?.value ?? "");
  const customEnd = brToIso(document.getElementById("efEndDate")?.value ?? "");
  const today = todayLocalIso();

  if (preset === "personalizado") {
    return {
      start: customStart || "", end: customEnd || "",
      label: customStart && customEnd ? `Período: ${formatDate(customStart)} até ${formatDate(customEnd)}` : "Período personalizado em aberto",
    };
  }
  const m = /^(\d+)dias$/.exec(preset || "");
  const dias = m ? parseInt(m[1], 10) : EF_PERIODO_PADRAO_DIAS;
  return { start: addDaysLocalIso(today, -(dias - 1)), end: today, label: `Últimos ${dias} dias` };
}

function syncEficienciaPeriodInputs() {
  const presetInput = document.getElementById("efPeriodPreset");
  const startInput = document.getElementById("efStartDate");
  const endInput = document.getElementById("efEndDate");
  const summary = document.getElementById("efPeriodSummary");
  if (!presetInput || !startInput || !endInput) return;
  const range = getEficienciaRange();
  startInput.value = isoToBr(range.start);
  endInput.value = isoToBr(range.end);
  const isCustom = presetInput.value === "personalizado";
  startInput.disabled = !isCustom;
  endInput.disabled = !isCustom;
  if (summary) summary.textContent = range.label;
}

function _populateEfBuyerFilter() {
  const sel = document.getElementById("efBuyerFilter");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">Todos os compradores</option>` +
    state.buyers.map((b) => `<option value="${b.id}">${escapeHtml(b.nome_comprador)}</option>`).join("");
  if (current) sel.value = current;
}

function _populateEfSupplierFilter(filterBuyerId = "") {
  const sel = document.getElementById("efSupplierFilter");
  if (!sel) return;
  const current = sel.value;
  const base = filterBuyerId ? state.suppliers.filter((s) => s.comprador_id === filterBuyerId) : state.suppliers;
  sel.innerHTML = `<option value="">Todos os fornecedores</option>` +
    base.slice().sort((a, b) => (a.nome_fornecedor || "").localeCompare(b.nome_fornecedor || ""))
      .map((s) => `<option value="${s.id}">${escapeHtml(s.codigo_fornecedor)} — ${escapeHtml(s.nome_fornecedor)}</option>`).join("");
  if (current && base.some((s) => s.id === current)) sel.value = current; else sel.value = "";
}

/* ----- cálculo ----- */
function computeEficiencia(range) {
  const startIso = range.start;
  const endIso = range.end || todayLocalIso();
  const periodDays = (startIso && endIso) ? Math.max(1, diffDays(endIso, startIso) + 1) : EF_PERIODO_PADRAO_DIAS;
  const filterBuyerId = document.getElementById("efBuyerFilter")?.value ?? "";
  const filterSupplierId = document.getElementById("efSupplierFilter")?.value ?? "";

  const occ = (state.auditOccurrences ?? []).filter((o) =>
    o.fornecedor_id && o.status === "REALIZADA" && o.data_realizacao &&
    (!startIso || o.data_realizacao >= startIso) && (!endIso || o.data_realizacao <= endIso)
  );
  const bySupplier = new Map();
  occ.forEach((o) => {
    if (!bySupplier.has(o.fornecedor_id)) bySupplier.set(o.fornecedor_id, []);
    bySupplier.get(o.fornecedor_id).push(o);
  });

  let suppliers = (state.suppliers ?? []).slice();
  if (filterSupplierId) suppliers = suppliers.filter((s) => s.id === filterSupplierId);
  if (filterBuyerId) suppliers = suppliers.filter((s) => s.comprador_id === filterBuyerId);

  const fornRows = suppliers.map((s) => {
    const list = (bySupplier.get(s.id) || []).slice().sort((a, b) => (a.data_realizacao || "").localeCompare(b.data_realizacao || ""));
    const freq = Number(s.frequencia_revisao) || 0;
    const alvo = intervaloAlvo(freq);
    const buyer = buyerById(s.comprador_id);

    const tratadas = list.length;
    const pedidos = list.filter((o) => o.pedido_realizado === true);
    const naoPedidos = list.filter((o) => o.pedido_realizado === false);
    const nPedidos = pedidos.length;

    // Intervalo real entre PEDIDOS consecutivos (o que de fato saiu)
    const datasPedido = pedidos.map((o) => o.data_realizacao).sort();
    const gaps = [];
    for (let i = 1; i < datasPedido.length; i++) gaps.push(diffDays(datasPedido[i], datasPedido[i - 1]));
    const intervaloReal = gaps.length ? _efAvg(gaps) : null;
    const intervaloDesvioGaps = _efStdDev(gaps);     // regularidade dos intervalos
    const desvioPct = (intervaloReal != null && alvo) ? (intervaloReal - alvo) / alvo : null;
    const diasDesdeUltimo = datasPedido.length ? diffDays(endIso, datasPedido[datasPedido.length - 1]) : null;
    const vencido = alvo != null && diasDesdeUltimo != null && diasDesdeUltimo > alvo * (1 + EF_TOLERANCIA);

    // Status de aderência à frequência
    const esperadoNoPeriodo = alvo ? periodDays / alvo : 0;   // quantos pedidos eram esperados
    let status;
    if (nPedidos === 0) status = "sem_pedido";
    else if (intervaloReal == null) {
      // Só 1 pedido: se o período já esperava vários (≥2), é sub-pedido (Abaixo);
      // só fica "Dados limitados" quando o período é curto p/ a frequência.
      status = esperadoNoPeriodo >= 2 ? "abaixo" : "dados_limitados";
    }
    else if (desvioPct > EF_TOLERANCIA) status = "abaixo";             // mais espaçado que o alvo
    else if (desvioPct < -EF_TOLERANCIA) status = "acima";            // mais frequente que o alvo
    else status = "no_ritmo";

    const freqSugerida = sugerirFrequenciaPorIntervalo(intervaloReal);
    const freqDivergente = freqSugerida != null && freqSugerida !== freq;

    // Valores / conversão / pontualidade (mantidos)
    const valores = pedidos.map((o) => Number(o.pedido_valor)).filter((v) => v != null && !isNaN(v));
    const valorTotal = valores.reduce((a, b) => a + b, 0);
    const valorMedio = valores.length ? valorTotal / valores.length : 0;
    const desvioValor = _efStdDev(valores);
    const cvValor = valorMedio ? desvioValor / valorMedio : 0;
    const quantTotal = pedidos.reduce((a, o) => a + (Number(o.pedido_quantidade) || 0), 0);
    const conversao = tratadas > 0 ? nPedidos / tratadas : null;
    // "Não deu pedido" também é sinal de frequência não funcionando: a agenda gera
    // a revisão mas não rende pedido (frequência alta demais ou ineficaz).
    const baixaConversao = tratadas >= 2 && conversao != null && conversao < EF_CONVERSAO_ALERTA;
    const atrasos = list.map((o) => (o.data_prevista && o.data_realizacao) ? diffDays(o.data_realizacao, o.data_prevista) : null).filter((v) => v != null);
    const pontualidade = atrasos.length ? atrasos.filter((a) => a <= 0).length / atrasos.length : null;

    const problema = status === "abaixo" || status === "sem_pedido" || vencido || baixaConversao;

    const motivos = {};
    naoPedidos.forEach((o) => { const m = o.pedido_motivo_nao || "OUTROS"; motivos[m] = (motivos[m] || 0) + 1; });

    return {
      id: s.id, nome: s.nome_fornecedor || "(sem nome)", codigo: s.codigo_fornecedor || "-",
      buyerId: buyer?.id ?? "sem-comprador", buyerName: buyer?.nome_comprador ?? "Sem comprador",
      freq, freqLabel: FREQ_LABEL[freq] || `Freq ${freq}`, alvo,
      tratadas, nPedidos, nNaoPedidos: naoPedidos.length,
      intervaloReal, desvioPct, intervaloDesvioGaps, diasDesdeUltimo, vencido,
      status, problema, baixaConversao, freqSugerida, freqDivergente,
      valorTotal, valorMedio, desvioValor, cvValor, quantTotal, conversao, pontualidade,
      motivos,
      ocorrencias: list,
    };
  });

  // Agregação por comprador
  const byBuyer = new Map();
  fornRows.forEach((r) => {
    if (!byBuyer.has(r.buyerId)) byBuyer.set(r.buyerId, {
      buyerId: r.buyerId, buyerName: r.buyerName, fornecedores: [],
      noRitmo: 0, abaixo: 0, acima: 0, semPedido: 0, dadosLimitados: 0, vencidos: 0, valorTotal: 0, nPedidos: 0, tratadas: 0,
    });
    const g = byBuyer.get(r.buyerId);
    g.fornecedores.push(r);
    if (r.status === "no_ritmo") g.noRitmo++;
    else if (r.status === "abaixo") g.abaixo++;
    else if (r.status === "acima") g.acima++;
    else if (r.status === "sem_pedido") g.semPedido++;
    else if (r.status === "dados_limitados") g.dadosLimitados++;
    if (r.vencido) g.vencidos++;
    g.valorTotal += r.valorTotal; g.nPedidos += r.nPedidos; g.tratadas += r.tratadas;
  });
  const buyerRows = Array.from(byBuyer.values()).map((g) => {
    const total = g.fornecedores.length;
    return {
      ...g, nFornecedores: total,
      // % no ritmo sobre o TOTAL de fornecedores (não só os "analisáveis")
      pctNoRitmo: total > 0 ? g.noRitmo / total : null,
      conversao: g.tratadas > 0 ? g.nPedidos / g.tratadas : null,
    };
  }).sort((a, b) => (b.pctNoRitmo ?? -1) - (a.pctNoRitmo ?? -1));

  // KPIs
  const totTratadas = fornRows.reduce((a, r) => a + r.tratadas, 0);
  const totPedidos = fornRows.reduce((a, r) => a + r.nPedidos, 0);
  const kpis = {
    pctNoRitmo: fornRows.length ? fornRows.filter((r) => r.status === "no_ritmo").length / fornRows.length : null,
    noRitmo: fornRows.filter((r) => r.status === "no_ritmo").length,
    abaixo: fornRows.filter((r) => r.status === "abaixo").length,
    acima: fornRows.filter((r) => r.status === "acima").length,
    semPedido: fornRows.filter((r) => r.status === "sem_pedido").length,
    vencidos: fornRows.filter((r) => r.vencido).length,
    conversao: totTratadas > 0 ? totPedidos / totTratadas : null,
    valorTotal: fornRows.reduce((a, r) => a + r.valorTotal, 0),
    nFornecedores: fornRows.length,
  };

  // Pedidos por mês (volume) p/ a linha de tendência
  const meses = new Map();
  fornRows.forEach((r) => r.ocorrencias.forEach((o) => {
    if (o.pedido_realizado !== true) return;
    const m = (o.data_realizacao || "").slice(0, 7);
    if (m) meses.set(m, (meses.get(m) || 0) + 1);
  }));
  const tendencia = Array.from(meses.keys()).sort().map((m) => ({ mes: m, pedidos: meses.get(m) }));

  return { fornRows, buyerRows, kpis, tendencia };
}

/* ----- render ----- */
function renderEficiencia() {
  const root = document.getElementById("eficiencia");
  if (!root) return;
  syncEficienciaPeriodInputs();
  _populateEfBuyerFilter();
  _populateEfSupplierFilter(document.getElementById("efBuyerFilter")?.value ?? "");

  const range = getEficienciaRange();
  const data = computeEficiencia(range);
  _efLastRows = data; _efLastRange = range;

  _renderEfKpis(data.kpis);
  _renderEfCharts(data);
  _renderEfBuyerTable(data.buyerRows);
  _renderEfDetalhe(data.buyerRows);
}

function _renderEfKpis(k) {
  const grid = document.getElementById("efSummaryGrid");
  if (!grid) return;
  const cards = [
    { label: "Fornecedores no ritmo", value: _efPct(k.pctNoRitmo), hint: `${k.noRitmo} de ${k.nFornecedores} fornecedores` },
    { label: "Abaixo do esperado", value: String(k.abaixo), hint: "pedidos mais espaçados que a frequência" },
    { label: "Vencidos agora", value: String(k.vencidos), hint: "passou do intervalo sem novo pedido" },
    { label: "Sem pedido no período", value: String(k.semPedido), hint: `de ${k.nFornecedores} fornecedores` },
    { label: "Taxa de conversão", value: _efPct(k.conversao), hint: "agendas que viraram pedido" },
    { label: "Valor total comprado", value: _efBRL(k.valorTotal), hint: "no período" },
  ];
  grid.innerHTML = cards.map((c) => `
    <div class="kpi-card">
      <span class="kpi-card-label">${c.label}</span>
      <span class="kpi-card-value">${c.value}</span>
      <span class="kpi-card-hint muted">${c.hint}</span>
    </div>`).join("");
}

function _efDestroy(c) { if (c) { try { c.destroy(); } catch { /* noop */ } } }

function _renderEfCharts(data) {
  if (typeof Chart === "undefined") return;
  const { fornRows, buyerRows, tendencia } = data;

  // 1. Distribuição por status de frequência (pizza)
  const ctxStatus = document.getElementById("efChartStatus")?.getContext("2d");
  if (ctxStatus) {
    _efDestroy(_efChartStatus);
    const keys = ["no_ritmo", "abaixo", "acima", "sem_pedido", "dados_limitados"];
    const counts = keys.map((s) => fornRows.filter((r) => r.status === s).length);
    _efChartStatus = new Chart(ctxStatus, {
      type: "doughnut",
      data: { labels: keys.map((s) => EF_STATUS[s].label), datasets: [{ data: counts, backgroundColor: keys.map((s) => EF_STATUS[s].cor) }] },
      options: { plugins: { legend: { position: "bottom" } }, responsive: true, maintainAspectRatio: false },
    });
  }

  // 2. Motivos de não-pedido (pizza)
  const ctxMot = document.getElementById("efChartMotivos")?.getContext("2d");
  if (ctxMot) {
    _efDestroy(_efChartMotivos);
    const agg = {};
    fornRows.forEach((r) => Object.entries(r.motivos).forEach(([m, n]) => { agg[m] = (agg[m] || 0) + n; }));
    const labels = Object.keys(agg);
    _efChartMotivos = new Chart(ctxMot, {
      type: "pie",
      data: { labels: labels.map((m) => PEDIDO_MOTIVO_LABEL[m] || m), datasets: [{ data: labels.map((m) => agg[m]), backgroundColor: ["#f59e0b", "#ef4444", "#6366f1", "#94a3b8", "#0ea5e9"] }] },
      options: { plugins: { legend: { position: "bottom" } }, responsive: true, maintainAspectRatio: false },
    });
  }

  // 3. Maiores desvios: intervalo real × alvo (top 8 por |desvio|)
  const ctxDesvio = document.getElementById("efChartDesvio")?.getContext("2d");
  if (ctxDesvio) {
    _efDestroy(_efChartDesvio);
    const top = fornRows.filter((r) => r.intervaloReal != null && r.alvo)
      .sort((a, b) => Math.abs(b.desvioPct) - Math.abs(a.desvioPct)).slice(0, 8);
    _efChartDesvio = new Chart(ctxDesvio, {
      type: "bar",
      data: {
        labels: top.map((r) => r.nome.length > 18 ? r.nome.slice(0, 16) + "…" : r.nome),
        datasets: [
          { label: "Intervalo real (d)", data: top.map((r) => Math.round(r.intervaloReal * 10) / 10), backgroundColor: "#2563eb" },
          { label: "Alvo (d)", data: top.map((r) => r.alvo), backgroundColor: "#94a3b8" },
        ],
      },
      options: { plugins: { legend: { position: "bottom" } }, responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    });
  }

  // 4. Valor comprado por comprador
  const ctxVal = document.getElementById("efChartValor")?.getContext("2d");
  if (ctxVal) {
    _efDestroy(_efChartValor);
    const top = buyerRows.filter((b) => b.valorTotal > 0).slice().sort((a, b) => b.valorTotal - a.valorTotal);
    _efChartValor = new Chart(ctxVal, {
      type: "bar",
      data: { labels: top.map((b) => b.buyerName), datasets: [{ label: "Valor (R$)", data: top.map((b) => Math.round(b.valorTotal)), backgroundColor: "#16a34a" }] },
      options: { plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    });
  }

  // 5. Pedidos por mês (volume)
  const ctxTend = document.getElementById("efChartTendencia")?.getContext("2d");
  if (ctxTend) {
    _efDestroy(_efChartTendencia);
    _efChartTendencia = new Chart(ctxTend, {
      type: "line",
      data: { labels: tendencia.map((t) => t.mes), datasets: [{ label: "Pedidos", data: tendencia.map((t) => t.pedidos), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.15)", fill: true, tension: 0.3 }] },
      options: { plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    });
  }
}

function _renderEfBuyerTable(buyerRows) {
  const el = document.getElementById("efBuyerTable");
  if (!el) return;
  if (!buyerRows.length) { el.innerHTML = `<div class="msg info">Nenhum dado para os filtros selecionados.</div>`; return; }
  el.innerHTML = `
    <table class="audit-event-table ef-table">
      <thead><tr>
        <th>Comprador</th><th>% no ritmo</th><th>✅</th><th>⚠️ Abaixo</th><th>🔵 Acima</th>
        <th>⚪ Sem pedido</th><th>⏳ Dados lim.</th><th>🔴 Vencidos</th><th>Conversão</th><th>Valor total</th><th>Fornec.</th>
      </tr></thead>
      <tbody>
        ${buyerRows.map((b) => `
          <tr>
            <td><strong>${escapeHtml(b.buyerName)}</strong></td>
            <td>${_efPct(b.pctNoRitmo)} <span class="muted">(${b.noRitmo}/${b.nFornecedores})</span></td>
            <td>${b.noRitmo}</td>
            <td class="${b.abaixo ? "ef-alert" : ""}">${b.abaixo}</td>
            <td>${b.acima}</td>
            <td class="${b.semPedido ? "ef-alert" : ""}">${b.semPedido}</td>
            <td>${b.dadosLimitados}</td>
            <td class="${b.vencidos ? "ef-alert" : ""}">${b.vencidos}</td>
            <td>${_efPct(b.conversao)}</td>
            <td>${_efBRL(b.valorTotal)}</td>
            <td>${b.nFornecedores}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

const _EF_STATUS_ORDER = { abaixo: 0, sem_pedido: 1, acima: 2, dados_limitados: 3, no_ritmo: 4 };

function _renderEfDetalhe(buyerRows) {
  const el = document.getElementById("efDetalhe");
  if (!el) return;
  if (!buyerRows.length) { el.innerHTML = ""; return; }
  el.innerHTML = buyerRows.map((b) => `
    <details class="ef-buyer-group" open>
      <summary>
        <span class="ef-buyer-name">${escapeHtml(b.buyerName)}</span>
        <span class="ef-buyer-meta muted">${b.nFornecedores} fornec. · ${b.noRitmo}/${b.nFornecedores} no ritmo (${_efPct(b.pctNoRitmo)}) · ${b.abaixo} abaixo · ${b.semPedido} sem pedido · ${b.dadosLimitados} dados lim. · ${b.vencidos} vencidos · ${_efBRL(b.valorTotal)}</span>
      </summary>
      <div class="ef-forn-list">
        ${b.fornecedores.slice().sort((a, c) => (Number(c.problema) - Number(a.problema)) || (_EF_STATUS_ORDER[a.status] - _EF_STATUS_ORDER[c.status]) || (Math.abs(c.desvioPct ?? 0) - Math.abs(a.desvioPct ?? 0))).map(_renderEfFornCard).join("")}
      </div>
    </details>`).join("");
}

function _renderEfFornCard(r) {
  const st = EF_STATUS[r.status];
  const flags = [`<span class="ef-flag" style="background:${st.cor}22;color:${st.cor}">${st.icon} ${st.label}</span>`];
  if (r.vencido && r.status !== "sem_pedido") flags.push(`<span class="ef-flag ef-flag-bad">🔴 Vencido (${r.diasDesdeUltimo}d sem pedido)</span>`);
  if (r.baixaConversao) flags.push(`<span class="ef-flag ef-flag-bad">⚠️ Baixa conversão (${_efPct(r.conversao)} deu pedido)</span>`);
  if (r.freqDivergente) flags.push(`<span class="ef-flag ef-flag-sug">💡 Sugerir ${FREQ_LABEL[r.freqSugerida]}</span>`);

  const intervalo = r.intervaloReal != null
    ? `${_efNum(r.intervaloReal, 1)}d <span class="muted">/ alvo ${_efNum(r.alvo, r.alvo % 1 ? 1 : 0)}d</span>`
    : `— <span class="muted">/ alvo ${_efNum(r.alvo, r.alvo % 1 ? 1 : 0)}d</span>`;
  const desvioCls = r.desvioPct != null && r.desvioPct > EF_TOLERANCIA ? "ef-alert" : r.desvioPct != null && r.desvioPct < -EF_TOLERANCIA ? "" : "";

  return `
    <details class="ef-forn-card${r.problema ? " ef-forn-bad" : ""}">
      <summary>
        <span class="ef-forn-title">${escapeHtml(r.codigo)} — ${escapeHtml(r.nome)}</span>
        <span class="ef-forn-flags">${flags.join(" ")}</span>
      </summary>
      <div class="ef-forn-body">
        <div class="ef-metric-grid">
          <div class="ef-metric"><span>Frequência cadastrada</span><strong>${_efFreqLabel(r.freq)}</strong><em>pedido a cada ${_efNum(r.alvo, r.alvo % 1 ? 1 : 0)} dias</em></div>
          <div class="ef-metric"><span>Intervalo real × alvo</span><strong class="${desvioCls}">${intervalo}</strong><em>desvio ${_efSignedPct(r.desvioPct)}</em></div>
          <div class="ef-metric"><span>Último pedido</span><strong class="${r.vencido ? "ef-alert" : ""}">${r.diasDesdeUltimo != null ? r.diasDesdeUltimo + "d atrás" : "—"}</strong><em>${r.nPedidos} pedido(s) no período</em></div>
          <div class="ef-metric"><span>Regularidade</span><strong>± ${_efNum(r.intervaloDesvioGaps, 1)}d</strong><em>variação entre intervalos</em></div>
          <div class="ef-metric"><span>Conversão</span><strong class="${r.conversao != null && r.conversao < EF_CONVERSAO_ALERTA ? "ef-alert" : ""}">${_efPct(r.conversao)}</strong><em>${r.nPedidos}/${r.tratadas} agendas</em></div>
          <div class="ef-metric"><span>Valor médio</span><strong>${_efBRL(r.valorMedio)}</strong><em>σ ${_efBRL(r.desvioValor)} · total ${_efBRL(r.valorTotal)}</em></div>
        </div>
        ${r.freqDivergente ? `<p class="ef-sugestao">💡 O ritmo real (~${_efNum(r.intervaloReal, 1)}d entre pedidos) está mais próximo de <strong>${_efFreqLabel(r.freqSugerida)}</strong> do que da frequência atual <strong>${_efFreqLabel(r.freq)}</strong>.</p>` : ""}
        ${_renderEfPedidosTable(r.ocorrencias)}
      </div>
    </details>`;
}

function _renderEfPedidosTable(ocorrencias) {
  if (!ocorrencias.length) return `<p class="muted ef-empty">Nenhuma agenda tratada no período.</p>`;
  const ordenadas = ocorrencias.slice().sort((a, b) => (a.data_realizacao || "").localeCompare(b.data_realizacao || ""));
  let ultimoPedidoData = null;
  return `
    <table class="audit-event-table ef-pedidos-table">
      <thead><tr>
        <th>Prevista</th><th>Realizada</th><th>Intervalo</th><th>Atraso</th><th>Pedido</th><th>Qtd</th><th>Valor</th><th>Motivo / obs.</th>
      </tr></thead>
      <tbody>
        ${ordenadas.map((o) => {
          const atraso = (o.data_prevista && o.data_realizacao) ? diffDays(o.data_realizacao, o.data_prevista) : null;
          const atrasoTxt = atraso == null ? "—" : atraso > 0 ? `+${atraso}d` : atraso < 0 ? `${atraso}d` : "no prazo";
          const atrasoCls = atraso > 0 ? "ef-alert" : atraso < 0 ? "ef-good" : "";
          let intervaloTxt = "—";
          if (o.pedido_realizado === true) {
            if (ultimoPedidoData) intervaloTxt = `${diffDays(o.data_realizacao, ultimoPedidoData)}d`;
            ultimoPedidoData = o.data_realizacao;
          }
          const pedido = o.pedido_realizado === true ? "✅ Sim" : o.pedido_realizado === false ? "❌ Não" : "—";
          const meta = parseOccurrenceObservacao(o.observacao);
          let motivo = meta?.justificativa || "";
          if (o.pedido_realizado === false && o.pedido_motivo_nao) {
            motivo = (PEDIDO_MOTIVO_LABEL[o.pedido_motivo_nao] || o.pedido_motivo_nao) + (o.pedido_motivo_detalhe ? ` — ${o.pedido_motivo_detalhe}` : "");
          }
          return `
            <tr>
              <td>${o.data_prevista ? formatDate(o.data_prevista) : "—"}</td>
              <td>${o.data_realizacao ? formatDate(o.data_realizacao) : "—"}</td>
              <td>${intervaloTxt}</td>
              <td class="${atrasoCls}">${atrasoTxt}</td>
              <td>${pedido}</td>
              <td>${o.pedido_quantidade != null ? o.pedido_quantidade : "—"}</td>
              <td>${o.pedido_valor != null ? _efBRL(o.pedido_valor) : "—"}</td>
              <td class="ef-motivo">${escapeHtml(motivo)}</td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

/* ----- exportação Excel ----- */
function exportEficienciaToExcel() {
  if (typeof XLSX === "undefined") { setFeedback("Biblioteca de exportação indisponível.", "warning"); return; }
  if (!_efLastRows || !_efLastRows.fornRows.length) { setFeedback("Nenhum dado para exportar.", "warning"); return; }
  const { fornRows, buyerRows } = _efLastRows;

  const fornSheet = fornRows.map((r) => ({
    "Comprador": r.buyerName, "Código": r.codigo, "Fornecedor": r.nome,
    "Frequência": `${r.freq} (${r.freqLabel})`,
    "Intervalo alvo (d)": r.alvo,
    "Intervalo real (d)": r.intervaloReal != null ? Math.round(r.intervaloReal * 10) / 10 : "",
    "Desvio %": r.desvioPct != null ? Math.round(r.desvioPct * 100) : "",
    "Status": EF_STATUS[r.status].label,
    "Vencido": r.vencido ? "Sim" : "",
    "Dias desde último pedido": r.diasDesdeUltimo ?? "",
    "Freq sugerida": r.freqDivergente ? `${r.freqSugerida} (${FREQ_LABEL[r.freqSugerida]})` : "",
    "Pedidos no período": r.nPedidos, "Agendas tratadas": r.tratadas,
    "Conversão %": r.conversao != null ? Math.round(r.conversao * 100) : "",
    "Valor médio": Math.round(r.valorMedio * 100) / 100, "Desvio valor (σ)": Math.round(r.desvioValor * 100) / 100,
    "Valor total": Math.round(r.valorTotal * 100) / 100, "Qtd total": r.quantTotal,
  }));
  const buyerSheet = buyerRows.map((b) => ({
    "Comprador": b.buyerName, "% no ritmo": b.pctNoRitmo != null ? Math.round(b.pctNoRitmo * 100) : "",
    "No ritmo": b.noRitmo, "Abaixo": b.abaixo, "Acima": b.acima, "Sem pedido": b.semPedido, "Vencidos": b.vencidos,
    "Conversão %": b.conversao != null ? Math.round(b.conversao * 100) : "",
    "Valor total": Math.round(b.valorTotal * 100) / 100, "Fornecedores": b.nFornecedores,
  }));
  const pedidoSheet = [];
  fornRows.forEach((r) => r.ocorrencias.forEach((o) => {
    pedidoSheet.push({
      "Comprador": r.buyerName, "Fornecedor": `${r.codigo} — ${r.nome}`, "Frequência": r.freqLabel,
      "Data prevista": o.data_prevista ? formatDate(o.data_prevista) : "",
      "Data realizada": o.data_realizacao ? formatDate(o.data_realizacao) : "",
      "Deu pedido": o.pedido_realizado === true ? "Sim" : o.pedido_realizado === false ? "Não" : "",
      "Quantidade": o.pedido_quantidade ?? "", "Valor": o.pedido_valor ?? "",
      "Motivo não pedido": PEDIDO_MOTIVO_LABEL[o.pedido_motivo_nao] ?? "",
    });
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fornSheet), "Por Fornecedor");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buyerSheet), "Por Comprador");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pedidoSheet), "Pedidos");
  const range = _efLastRange || { start: "", end: "" };
  XLSX.writeFile(wb, `eficiencia_${range.start}_${range.end}.xlsx`);
}

/* ----- visibilidade do menu ----- */
// Visível para todos os usuários do portal (decisão de produto, 25/06/2026).
function canSeeEficiencia() { return true; }
function applyEficienciaAccess() {
  const nav = document.getElementById("navEficiencia");
  if (nav) nav.style.display = canSeeEficiencia() ? "" : "none";
}
