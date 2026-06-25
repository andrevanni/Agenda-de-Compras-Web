/* =========================================================================
   Eficiência da Agenda — análise de efetividade da Agenda de Compras.
   Reusa state.auditOccurrences (REALIZADA com dados de pedido), state.suppliers
   e state.buyers — não faz query nova. Visível só para admin/gestor.
   ========================================================================= */

// O valor da frequência ≈ pedidos esperados por ciclo de 28 dias:
// 1=mensal, 2=quinzenal, 4=semanal, 8=2×/semana, 12=3×/semana.
const VALORES_FREQUENCIA = [1, 2, 4, 8, 12];
const FREQ_LABEL = { 1: "Mensal", 2: "Quinzenal", 4: "Semanal", 8: "2×/semana", 12: "3×/semana" };

// Limiares de alerta de ineficiência
const EF_ADERENCIA_ALERTA = 0.75;   // realizado < 75% do esperado
const EF_CONVERSAO_ALERTA = 0.60;   // < 60% das agendas viram pedido
const EF_INTERVALO_DESVIO = 0.40;   // intervalo real desvia >40% do teórico

let efFilter = { preset: "28dias", startDate: "", endDate: "" };
let _efChartConversao = null;
let _efChartMotivos = null;
let _efChartGap = null;
let _efChartValor = null;
let _efChartTendencia = null;
let _efLastRows = null;   // cache p/ exportação
let _efLastRange = null;

function intervaloTeoricoDias(freq) {
  return freq > 0 ? 28 / freq : null;
}

function esperadoNoPeriodo(freq, periodDays) {
  return freq > 0 ? freq * (periodDays / 28) : 0;
}

function sugerirFrequencia(pedidosPor28) {
  if (!pedidosPor28 || pedidosPor28 <= 0) return null;
  let best = VALORES_FREQUENCIA[0];
  let bestDiff = Infinity;
  for (const v of VALORES_FREQUENCIA) {
    const d = Math.abs(v - pedidosPor28);
    if (d < bestDiff) { bestDiff = d; best = v; }
  }
  return best;
}

function _efAvg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function _efStdDev(arr) {
  if (arr.length < 2) return 0;
  const m = _efAvg(arr);
  const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function _efBRL(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function _efPct(v) {
  if (v == null || isNaN(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

function _efNum(v, dec = 1) {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/* ----- período (espelha getAuditRange, com preset de ciclo) ----- */
function getEficienciaRange() {
  const preset = document.getElementById("efPeriodPreset")?.value ?? efFilter.preset;
  const customStart = brToIso(document.getElementById("efStartDate")?.value ?? "");
  const customEnd = brToIso(document.getElementById("efEndDate")?.value ?? "");
  const today = todayLocalIso();

  if (preset === "90dias") {
    return { start: addDaysLocalIso(today, -89), end: today, label: "Últimos 90 dias" };
  }
  if (preset === "ultimo_mes") {
    const range = previousMonthRange();
    return { start: range.start, end: range.end, label: `Último mês: ${formatDate(range.start)} até ${formatDate(range.end)}` };
  }
  if (preset === "personalizado") {
    return {
      start: customStart || "",
      end: customEnd || "",
      label: customStart && customEnd
        ? `Período: ${formatDate(customStart)} até ${formatDate(customEnd)}`
        : "Período personalizado em aberto",
    };
  }
  return { start: addDaysLocalIso(today, -27), end: today, label: "Últimos 28 dias (1 ciclo)" };
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
  const base = filterBuyerId
    ? state.suppliers.filter((s) => s.comprador_id === filterBuyerId)
    : state.suppliers;
  sel.innerHTML = `<option value="">Todos os fornecedores</option>` +
    base.slice().sort((a, b) => (a.nome_fornecedor || "").localeCompare(b.nome_fornecedor || ""))
      .map((s) => `<option value="${s.id}">${escapeHtml(s.codigo_fornecedor)} — ${escapeHtml(s.nome_fornecedor)}</option>`)
      .join("");
  if (current && base.some((s) => s.id === current)) sel.value = current;
  else sel.value = "";
}

/* ----- cálculo das métricas ----- */
function computeEficiencia(range) {
  const startIso = range.start;
  const endIso = range.end;
  const periodDays = (startIso && endIso) ? Math.max(1, diffDays(endIso, startIso) + 1) : 28;
  const filterBuyerId = document.getElementById("efBuyerFilter")?.value ?? "";
  const filterSupplierId = document.getElementById("efSupplierFilter")?.value ?? "";

  // Ocorrências da Agenda de Compras (fornecedor_id) tratadas no período
  const occ = (state.auditOccurrences ?? []).filter((o) =>
    o.fornecedor_id &&
    o.status === "REALIZADA" &&
    o.data_realizacao &&
    (!startIso || o.data_realizacao >= startIso) &&
    (!endIso || o.data_realizacao <= endIso)
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
    const list = bySupplier.get(s.id) || [];
    const freq = Number(s.frequencia_revisao) || 0;
    const buyer = buyerById(s.comprador_id);
    const tratadas = list.length;
    const pedidos = list.filter((o) => o.pedido_realizado === true);
    const naoPedidos = list.filter((o) => o.pedido_realizado === false);
    const nPedidos = pedidos.length;
    const esperado = esperadoNoPeriodo(freq, periodDays);

    const valores = pedidos.map((o) => Number(o.pedido_valor)).filter((v) => v != null && !isNaN(v));
    const valorTotal = valores.reduce((a, b) => a + b, 0);
    const valorMedio = valores.length ? valorTotal / valores.length : 0;
    const desvioValor = _efStdDev(valores);
    const cv = valorMedio ? desvioValor / valorMedio : 0;
    const quantTotal = pedidos.reduce((a, o) => a + (Number(o.pedido_quantidade) || 0), 0);

    const atrasos = list
      .map((o) => (o.data_prevista && o.data_realizacao) ? diffDays(o.data_realizacao, o.data_prevista) : null)
      .filter((v) => v != null);
    const atrasoMedio = atrasos.length ? _efAvg(atrasos) : 0;
    const pontuais = atrasos.filter((a) => a <= 0).length;
    const pontualidade = atrasos.length ? pontuais / atrasos.length : null;

    const datasPedido = pedidos.map((o) => o.data_realizacao).sort();
    let intervaloReal = null;
    if (datasPedido.length >= 2) {
      const gaps = [];
      for (let i = 1; i < datasPedido.length; i++) gaps.push(diffDays(datasPedido[i], datasPedido[i - 1]));
      intervaloReal = _efAvg(gaps);
    }
    const intervaloTeorico = intervaloTeoricoDias(freq);

    const pedidosPor28 = periodDays ? nPedidos / (periodDays / 28) : 0;
    const freqSugerida = sugerirFrequencia(pedidosPor28);
    const aderencia = esperado > 0 ? nPedidos / esperado : null;
    const conversao = tratadas > 0 ? nPedidos / tratadas : null;

    const motivos = {};
    naoPedidos.forEach((o) => {
      const m = o.pedido_motivo_nao || "OUTROS";
      motivos[m] = (motivos[m] || 0) + 1;
    });

    const fantasma = nPedidos === 0;
    const intervaloDivergente = intervaloReal != null && intervaloTeorico &&
      Math.abs(intervaloReal - intervaloTeorico) > intervaloTeorico * EF_INTERVALO_DESVIO;
    const ineficiente =
      (aderencia != null && aderencia < EF_ADERENCIA_ALERTA) ||
      (conversao != null && conversao < EF_CONVERSAO_ALERTA) ||
      intervaloDivergente;

    return {
      id: s.id,
      nome: s.nome_fornecedor || "(sem nome)",
      codigo: s.codigo_fornecedor || "-",
      buyerId: buyer?.id ?? "sem-comprador",
      buyerName: buyer?.nome_comprador ?? "Sem comprador",
      freq, freqLabel: FREQ_LABEL[freq] || `Freq ${freq}`,
      tratadas, nPedidos, nNaoPedidos: naoPedidos.length, esperado,
      aderencia, conversao,
      valorTotal, valorMedio, desvioValor, cv, quantTotal,
      atrasoMedio, pontualidade,
      intervaloReal, intervaloTeorico, intervaloDivergente,
      freqSugerida, freqDivergente: freqSugerida != null && freqSugerida !== freq,
      motivos, ineficiente, fantasma,
      ocorrencias: list.slice().sort((a, b) => (a.data_realizacao || "").localeCompare(b.data_realizacao || "")),
    };
  });

  // Agregação por comprador
  const byBuyer = new Map();
  fornRows.forEach((r) => {
    if (!byBuyer.has(r.buyerId)) {
      byBuyer.set(r.buyerId, {
        buyerId: r.buyerId, buyerName: r.buyerName,
        fornecedores: [], esperado: 0, nPedidos: 0, tratadas: 0,
        valorTotal: 0, atrasos: [], pontuais: 0, comAtraso: 0, fantasmas: 0,
      });
    }
    const g = byBuyer.get(r.buyerId);
    g.fornecedores.push(r);
    g.esperado += r.esperado;
    g.nPedidos += r.nPedidos;
    g.tratadas += r.tratadas;
    g.valorTotal += r.valorTotal;
    if (r.fantasma) g.fantasmas += 1;
    if (r.pontualidade != null) {
      g.comAtraso += r.tratadas;
      g.pontuais += Math.round(r.pontualidade * r.tratadas);
    }
  });
  const buyerRows = Array.from(byBuyer.values()).map((g) => ({
    ...g,
    aderencia: g.esperado > 0 ? g.nPedidos / g.esperado : null,
    conversao: g.tratadas > 0 ? g.nPedidos / g.tratadas : null,
    pontualidade: g.comAtraso > 0 ? g.pontuais / g.comAtraso : null,
    nFornecedores: g.fornecedores.length,
  })).sort((a, b) => (b.aderencia ?? -1) - (a.aderencia ?? -1));

  // KPIs gerais
  const totEsperado = fornRows.reduce((a, r) => a + r.esperado, 0);
  const totPedidos = fornRows.reduce((a, r) => a + r.nPedidos, 0);
  const totTratadas = fornRows.reduce((a, r) => a + r.tratadas, 0);
  const totValor = fornRows.reduce((a, r) => a + r.valorTotal, 0);
  const allAtrasos = [];
  fornRows.forEach((r) => r.ocorrencias.forEach((o) => {
    if (o.data_prevista && o.data_realizacao) allAtrasos.push(diffDays(o.data_realizacao, o.data_prevista));
  }));
  const kpis = {
    aderencia: totEsperado > 0 ? totPedidos / totEsperado : null,
    conversao: totTratadas > 0 ? totPedidos / totTratadas : null,
    valorTotal: totValor,
    pontualidade: allAtrasos.length ? allAtrasos.filter((a) => a <= 0).length / allAtrasos.length : null,
    atrasoMedio: allAtrasos.length ? _efAvg(allAtrasos) : 0,
    totPedidos, totTratadas, totEsperado,
    fantasmas: fornRows.filter((r) => r.fantasma).length,
    ineficientes: fornRows.filter((r) => r.ineficiente).length,
    nFornecedores: fornRows.length,
  };

  // Tendência mensal (aderência por mês dentro do período)
  const totFreqScope = fornRows.reduce((a, r) => a + r.freq, 0);
  const meses = new Map();
  fornRows.forEach((r) => r.ocorrencias.forEach((o) => {
    if (o.pedido_realizado !== true) return;
    const mes = (o.data_realizacao || "").slice(0, 7);
    if (!mes) return;
    meses.set(mes, (meses.get(mes) || 0) + 1);
  }));
  const tendencia = Array.from(meses.keys()).sort().map((mes) => {
    const diasMes = _efDiasDoMesNoRange(mes, startIso, endIso);
    const esperadoMes = totFreqScope * (diasMes / 28);
    const pedidosMes = meses.get(mes);
    return { mes, aderencia: esperadoMes > 0 ? pedidosMes / esperadoMes : null, pedidos: pedidosMes };
  });

  return { fornRows, buyerRows, kpis, tendencia, periodDays };
}

function _efDiasDoMesNoRange(mesYYYYMM, startIso, endIso) {
  const [y, m] = mesYYYYMM.split("-").map(Number);
  const primeiro = `${mesYYYYMM}-01`;
  const ultimoDia = new Date(y, m, 0).getDate();
  const ultimo = `${mesYYYYMM}-${String(ultimoDia).padStart(2, "0")}`;
  const ini = startIso && startIso > primeiro ? startIso : primeiro;
  const fim = endIso && endIso < ultimo ? endIso : ultimo;
  return Math.max(1, diffDays(fim, ini) + 1);
}

/* ----- render principal ----- */
function renderEficiencia() {
  const root = document.getElementById("eficiencia");
  if (!root) return;
  syncEficienciaPeriodInputs();
  _populateEfBuyerFilter();
  const filterBuyerId = document.getElementById("efBuyerFilter")?.value ?? "";
  _populateEfSupplierFilter(filterBuyerId);

  const range = getEficienciaRange();
  const data = computeEficiencia(range);
  _efLastRows = data;
  _efLastRange = range;

  _renderEfKpis(data.kpis);
  _renderEfCharts(data);
  _renderEfBuyerTable(data.buyerRows);
  _renderEfDetalhe(data.buyerRows);
}

function _renderEfKpis(k) {
  const grid = document.getElementById("efSummaryGrid");
  if (!grid) return;
  const cards = [
    { label: "Aderência geral", value: _efPct(k.aderencia), hint: `${k.totPedidos} de ${_efNum(k.totEsperado, 0)} esperados` },
    { label: "Taxa de conversão", value: _efPct(k.conversao), hint: `${k.totPedidos} pedidos / ${k.totTratadas} agendas` },
    { label: "Valor total comprado", value: _efBRL(k.valorTotal), hint: `${k.totPedidos} pedidos` },
    { label: "Pontualidade", value: _efPct(k.pontualidade), hint: `atraso médio ${_efNum(k.atrasoMedio, 1)}d` },
    { label: "Fornecedores ineficientes", value: String(k.ineficientes), hint: `de ${k.nFornecedores} no escopo` },
    { label: "Fornecedores sem pedido", value: String(k.fantasmas), hint: "0 pedidos no período" },
  ];
  grid.innerHTML = cards.map((c) => `
    <div class="kpi-card">
      <span class="kpi-card-label">${c.label}</span>
      <span class="kpi-card-value">${c.value}</span>
      <span class="kpi-card-hint muted">${c.hint}</span>
    </div>`).join("");
}

function _efDestroy(chart) { if (chart) { try { chart.destroy(); } catch { /* noop */ } } }

function _renderEfCharts(data) {
  if (typeof Chart === "undefined") return;
  const { fornRows, buyerRows, kpis, tendencia } = data;

  // 1. Donut conversão (deu pedido vs não deu)
  const ctxConv = document.getElementById("efChartConversao")?.getContext("2d");
  if (ctxConv) {
    _efDestroy(_efChartConversao);
    const naoPedidos = kpis.totTratadas - kpis.totPedidos;
    _efChartConversao = new Chart(ctxConv, {
      type: "doughnut",
      data: {
        labels: ["Deu pedido", "Não deu pedido"],
        datasets: [{ data: [kpis.totPedidos, Math.max(0, naoPedidos)], backgroundColor: ["#10b981", "#ef4444"] }],
      },
      options: { plugins: { legend: { position: "bottom" } }, responsive: true, maintainAspectRatio: false },
    });
  }

  // 2. Pizza motivos de não-pedido
  const ctxMot = document.getElementById("efChartMotivos")?.getContext("2d");
  if (ctxMot) {
    _efDestroy(_efChartMotivos);
    const agg = {};
    fornRows.forEach((r) => Object.entries(r.motivos).forEach(([m, n]) => { agg[m] = (agg[m] || 0) + n; }));
    const labels = Object.keys(agg);
    _efChartMotivos = new Chart(ctxMot, {
      type: "pie",
      data: {
        labels: labels.map((m) => PEDIDO_MOTIVO_LABEL[m] || m),
        datasets: [{ data: labels.map((m) => agg[m]), backgroundColor: ["#f59e0b", "#ef4444", "#6366f1", "#94a3b8", "#0ea5e9"] }],
      },
      options: { plugins: { legend: { position: "bottom" } }, responsive: true, maintainAspectRatio: false },
    });
  }

  // 3. Colunas esperado vs realizado (top 8 por gap)
  const ctxGap = document.getElementById("efChartGap")?.getContext("2d");
  if (ctxGap) {
    _efDestroy(_efChartGap);
    const top = fornRows
      .filter((r) => r.esperado > 0)
      .map((r) => ({ ...r, gap: r.esperado - r.nPedidos }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 8);
    _efChartGap = new Chart(ctxGap, {
      type: "bar",
      data: {
        labels: top.map((r) => r.nome.length > 18 ? r.nome.slice(0, 16) + "…" : r.nome),
        datasets: [
          { label: "Esperado", data: top.map((r) => Math.round(r.esperado * 10) / 10), backgroundColor: "#94a3b8" },
          { label: "Realizado", data: top.map((r) => r.nPedidos), backgroundColor: "#2563eb" },
        ],
      },
      options: { plugins: { legend: { position: "bottom" } }, responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    });
  }

  // 4. Colunas valor comprado por comprador
  const ctxVal = document.getElementById("efChartValor")?.getContext("2d");
  if (ctxVal) {
    _efDestroy(_efChartValor);
    const top = buyerRows.filter((b) => b.valorTotal > 0).slice().sort((a, b) => b.valorTotal - a.valorTotal);
    _efChartValor = new Chart(ctxVal, {
      type: "bar",
      data: {
        labels: top.map((b) => b.buyerName),
        datasets: [{ label: "Valor comprado (R$)", data: top.map((b) => Math.round(b.valorTotal)), backgroundColor: "#16a34a" }],
      },
      options: { plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    });
  }

  // 5. Linha tendência mensal de aderência
  const ctxTend = document.getElementById("efChartTendencia")?.getContext("2d");
  if (ctxTend) {
    _efDestroy(_efChartTendencia);
    _efChartTendencia = new Chart(ctxTend, {
      type: "line",
      data: {
        labels: tendencia.map((t) => t.mes),
        datasets: [{
          label: "Aderência (%)",
          data: tendencia.map((t) => t.aderencia != null ? Math.round(t.aderencia * 100) : null),
          borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.15)", fill: true, tension: 0.3,
        }],
      },
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
        <th>Comprador</th><th>Aderência</th><th>Conversão</th><th>Pedidos</th>
        <th>Valor total</th><th>Pontualidade</th><th>Fornec.</th><th>Sem pedido</th>
      </tr></thead>
      <tbody>
        ${buyerRows.map((b) => `
          <tr>
            <td><strong>${escapeHtml(b.buyerName)}</strong></td>
            <td class="${b.aderencia != null && b.aderencia < EF_ADERENCIA_ALERTA ? "ef-alert" : ""}">${_efPct(b.aderencia)}</td>
            <td class="${b.conversao != null && b.conversao < EF_CONVERSAO_ALERTA ? "ef-alert" : ""}">${_efPct(b.conversao)}</td>
            <td>${b.nPedidos}/${_efNum(b.esperado, 0)}</td>
            <td>${_efBRL(b.valorTotal)}</td>
            <td>${_efPct(b.pontualidade)}</td>
            <td>${b.nFornecedores}</td>
            <td>${b.fantasmas || "—"}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function _renderEfDetalhe(buyerRows) {
  const el = document.getElementById("efDetalhe");
  if (!el) return;
  if (!buyerRows.length) { el.innerHTML = ""; return; }
  el.innerHTML = buyerRows.map((b) => `
    <details class="ef-buyer-group" open>
      <summary>
        <span class="ef-buyer-name">${escapeHtml(b.buyerName)}</span>
        <span class="ef-buyer-meta muted">${b.nFornecedores} fornec. · aderência ${_efPct(b.aderencia)} · ${_efBRL(b.valorTotal)}</span>
      </summary>
      <div class="ef-forn-list">
        ${b.fornecedores.slice().sort((a, c) => (c.ineficiente - a.ineficiente) || (a.aderencia ?? 9) - (c.aderencia ?? 9)).map(_renderEfFornCard).join("")}
      </div>
    </details>`).join("");
}

function _renderEfFornCard(r) {
  const flags = [];
  if (r.fantasma) flags.push(`<span class="ef-flag ef-flag-ghost">👻 Sem pedido</span>`);
  if (r.ineficiente && !r.fantasma) flags.push(`<span class="ef-flag ef-flag-bad">⚠️ Ineficiente</span>`);
  if (r.freqDivergente) flags.push(`<span class="ef-flag ef-flag-sug">💡 Sugerir freq ${r.freqSugerida} (${FREQ_LABEL[r.freqSugerida] || r.freqSugerida})</span>`);
  const intervalo = r.intervaloReal != null
    ? `${_efNum(r.intervaloReal, 1)}d real / ${_efNum(r.intervaloTeorico, 1)}d teórico`
    : `— / ${_efNum(r.intervaloTeorico, 1)}d teórico`;
  return `
    <details class="ef-forn-card${r.ineficiente ? " ef-forn-bad" : ""}">
      <summary>
        <span class="ef-forn-title">${escapeHtml(r.codigo)} — ${escapeHtml(r.nome)} <span class="muted">(${r.freqLabel})</span></span>
        <span class="ef-forn-flags">${flags.join(" ")}</span>
      </summary>
      <div class="ef-forn-body">
        <div class="ef-metric-grid">
          <div class="ef-metric"><span>Aderência</span><strong class="${r.aderencia != null && r.aderencia < EF_ADERENCIA_ALERTA ? "ef-alert" : ""}">${_efPct(r.aderencia)}</strong><em>${r.nPedidos} de ${_efNum(r.esperado, 1)}</em></div>
          <div class="ef-metric"><span>Conversão</span><strong class="${r.conversao != null && r.conversao < EF_CONVERSAO_ALERTA ? "ef-alert" : ""}">${_efPct(r.conversao)}</strong><em>${r.nPedidos}/${r.tratadas} agendas</em></div>
          <div class="ef-metric"><span>Valor médio</span><strong>${_efBRL(r.valorMedio)}</strong><em>σ ${_efBRL(r.desvioValor)} · CV ${_efPct(r.cv)}</em></div>
          <div class="ef-metric"><span>Valor total</span><strong>${_efBRL(r.valorTotal)}</strong><em>${_efNum(r.quantTotal, 0)} un.</em></div>
          <div class="ef-metric"><span>Intervalo</span><strong class="${r.intervaloDivergente ? "ef-alert" : ""}">${intervalo}</strong><em>entre pedidos</em></div>
          <div class="ef-metric"><span>Pontualidade</span><strong>${_efPct(r.pontualidade)}</strong><em>atraso médio ${_efNum(r.atrasoMedio, 1)}d</em></div>
        </div>
        ${_renderEfPedidosTable(r.ocorrencias)}
      </div>
    </details>`;
}

function _renderEfPedidosTable(ocorrencias) {
  if (!ocorrencias.length) return `<p class="muted ef-empty">Nenhuma agenda tratada no período.</p>`;
  return `
    <table class="audit-event-table ef-pedidos-table">
      <thead><tr>
        <th>Prevista</th><th>Realizada</th><th>Atraso</th><th>Pedido</th><th>Qtd</th><th>Valor</th><th>Motivo / obs.</th>
      </tr></thead>
      <tbody>
        ${ocorrencias.map((o) => {
          const atraso = (o.data_prevista && o.data_realizacao) ? diffDays(o.data_realizacao, o.data_prevista) : null;
          const atrasoTxt = atraso == null ? "—" : atraso > 0 ? `+${atraso}d` : atraso < 0 ? `${atraso}d` : "no prazo";
          const atrasoCls = atraso > 0 ? "ef-alert" : atraso < 0 ? "ef-good" : "";
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
    "Comprador": r.buyerName,
    "Código": r.codigo,
    "Fornecedor": r.nome,
    "Frequência": `${r.freq} (${r.freqLabel})`,
    "Esperado": Math.round(r.esperado * 10) / 10,
    "Realizados": r.nPedidos,
    "Aderência %": r.aderencia != null ? Math.round(r.aderencia * 100) : "",
    "Agendas tratadas": r.tratadas,
    "Conversão %": r.conversao != null ? Math.round(r.conversao * 100) : "",
    "Valor médio": Math.round(r.valorMedio * 100) / 100,
    "Desvio (σ)": Math.round(r.desvioValor * 100) / 100,
    "CV %": Math.round(r.cv * 100),
    "Valor total": Math.round(r.valorTotal * 100) / 100,
    "Qtd total": r.quantTotal,
    "Intervalo real (d)": r.intervaloReal != null ? Math.round(r.intervaloReal * 10) / 10 : "",
    "Intervalo teórico (d)": r.intervaloTeorico != null ? Math.round(r.intervaloTeorico * 10) / 10 : "",
    "Atraso médio (d)": Math.round(r.atrasoMedio * 10) / 10,
    "Pontualidade %": r.pontualidade != null ? Math.round(r.pontualidade * 100) : "",
    "Freq sugerida": r.freqDivergente ? r.freqSugerida : "",
    "Ineficiente": r.ineficiente ? "Sim" : "",
  }));

  const buyerSheet = buyerRows.map((b) => ({
    "Comprador": b.buyerName,
    "Aderência %": b.aderencia != null ? Math.round(b.aderencia * 100) : "",
    "Conversão %": b.conversao != null ? Math.round(b.conversao * 100) : "",
    "Pedidos": b.nPedidos,
    "Esperado": Math.round(b.esperado * 10) / 10,
    "Valor total": Math.round(b.valorTotal * 100) / 100,
    "Pontualidade %": b.pontualidade != null ? Math.round(b.pontualidade * 100) : "",
    "Fornecedores": b.nFornecedores,
    "Sem pedido": b.fantasmas,
  }));

  const pedidoSheet = [];
  fornRows.forEach((r) => r.ocorrencias.forEach((o) => {
    const atraso = (o.data_prevista && o.data_realizacao) ? diffDays(o.data_realizacao, o.data_prevista) : "";
    pedidoSheet.push({
      "Comprador": r.buyerName,
      "Fornecedor": `${r.codigo} — ${r.nome}`,
      "Data prevista": o.data_prevista ? formatDate(o.data_prevista) : "",
      "Data realizada": o.data_realizacao ? formatDate(o.data_realizacao) : "",
      "Atraso (d)": atraso,
      "Deu pedido": o.pedido_realizado === true ? "Sim" : o.pedido_realizado === false ? "Não" : "",
      "Quantidade": o.pedido_quantidade ?? "",
      "Valor": o.pedido_valor ?? "",
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

/* ----- visibilidade do menu (admin/gestor) ----- */
function canSeeEficiencia() {
  const role = getLoggedPortalRole();
  if (role === "admin_portal" || role === "admin_client") return true;
  if (role === "buyer") return !!loggedBuyer()?.is_gestor;
  return false;
}

function applyEficienciaAccess() {
  const nav = document.getElementById("navEficiencia");
  if (nav) nav.style.display = canSeeEficiencia() ? "" : "none";
}
