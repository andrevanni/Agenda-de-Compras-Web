function updateBuyerPreview() {
  const existingPhoto = document.getElementById("compradorFotoAtual").value.trim();
  const preview = document.getElementById("compradorFotoPreview");
  const name = document.getElementById("compradorNome").value.trim() || "Comprador";
  const file = document.getElementById("compradorFotoArquivo").files[0];

  if (file) {
    const temporaryUrl = URL.createObjectURL(file);
    preview.outerHTML = `<img id="compradorFotoPreview" class="avatar avatar-lg" src="${temporaryUrl}" alt="${name}">`;
    return;
  }

  if (existingPhoto) {
    const photoPath = existingPhoto;
    preview.outerHTML = `<img id="compradorFotoPreview" class="avatar avatar-lg" src="${photoPath}" alt="${name}">`;
    return;
  }

  preview.outerHTML = `<div id="compradorFotoPreview" class="avatar avatar-lg avatar-placeholder">${buyerInitials(name)}</div>`;
}

function populateSettings() {
  const settings = getSettings();
  document.getElementById("supabaseUrl").value = settings.supabaseUrl;
  document.getElementById("supabaseKey").value = settings.supabaseKey;
  document.getElementById("tenantId").value = settings.tenantId;
  const weekdaysSel = document.getElementById("calendarWeekdays");
  if (weekdaysSel) weekdaysSel.value = localStorage.getItem(storageKeys.calendarWeekdays) ?? "seg-dom";
  const apiBaseUrlEl = document.getElementById("apiBaseUrl");
  if (apiBaseUrlEl) apiBaseUrlEl.value = localStorage.getItem(storageKeys.apiBaseUrl) ?? "";
  const durComp = document.getElementById("duracaoPadraoCompromissos");
  if (durComp) durComp.value = localStorage.getItem(storageKeys.duracaoPadraoCompromissos) ?? "30";
  const durAgenda = document.getElementById("duracaoPadraoAgenda");
  if (durAgenda) durAgenda.value = localStorage.getItem(storageKeys.duracaoPadraoAgenda) ?? "30";
  applyLogo();
}

async function saveSettings() {
  const supabaseUrl = document.getElementById("supabaseUrl").value.trim();
  const supabaseKey = document.getElementById("supabaseKey").value.trim();
  const tenantId = document.getElementById("tenantId").value.trim();
  const logoFile = document.getElementById("logoArquivo").files[0];

  if (!supabaseUrl || !supabaseKey || !tenantId) {
    setFeedback("Preencha URL do Supabase, chave publishable e tenant operacional.", "error");
    return;
  }

  localStorage.setItem(storageKeys.supabaseUrl, supabaseUrl);
  localStorage.setItem(storageKeys.supabaseKey, supabaseKey);
  localStorage.setItem(storageKeys.tenantId, tenantId);
  const apiBaseUrlVal = document.getElementById("apiBaseUrl")?.value.trim() ?? "";
  localStorage.setItem(storageKeys.apiBaseUrl, apiBaseUrlVal);
  const weekdays = document.getElementById("calendarWeekdays")?.value ?? "seg-dom";
  localStorage.setItem(storageKeys.calendarWeekdays, weekdays);
  applyCalendarWeekdays();
  const durComp = parseInt(document.getElementById("duracaoPadraoCompromissos")?.value || "30");
  localStorage.setItem(storageKeys.duracaoPadraoCompromissos, String(Math.max(5, Math.min(480, durComp))));
  const durAgenda = parseInt(document.getElementById("duracaoPadraoAgenda")?.value || "30");
  localStorage.setItem(storageKeys.duracaoPadraoAgenda, String(Math.max(5, Math.min(480, durAgenda))));

  let logoDataUrl = localStorage.getItem(storageKeys.logoUrl) ?? defaultSettings.logoUrl;
  if (logoFile) {
    logoDataUrl = await fileToDataUrl(logoFile);
    localStorage.setItem(storageKeys.logoUrl, logoDataUrl);
  } else if (!localStorage.getItem(storageKeys.logoUrl)) {
    localStorage.setItem(storageKeys.logoUrl, defaultSettings.logoUrl);
  }

  try {
    if (state.clientRecordId && logoDataUrl) {
      const currentClientRows = await fetchSupabase(`/rest/v1/clientes?select=id,observacoes&id=eq.${state.clientRecordId}&limit=1`);
      const currentClient = currentClientRows[0] ?? null;
      await fetchSupabase(`/rest/v1/clientes?id=eq.${state.clientRecordId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: {
          observacoes: buildClientObservacoes(currentClient?.observacoes, { logo_url: logoDataUrl }),
        },
      });
    }
  } catch (error) {
    setFeedback(`A logomarca foi aplicada localmente, mas não foi possível salvar no Supabase: ${error.message}`, "warning");
  }

  populateSettings();
  document.getElementById("settingsModal").close();
  await loadPortalData();
}

function openAuditPasswordModal() {
  clearFeedback(document.getElementById("auditPasswordFeedback"));
  document.getElementById("auditPasswordInput").value = "";
  document.getElementById("auditPasswordModal").showModal();
}

function unlockAuditView() {
  const typedPassword = document.getElementById("auditPasswordInput").value.trim();
  const feedbackTarget = document.getElementById("auditPasswordFeedback");
  const configuredPassword = state.clientMeta.audit_password ?? "";

  if (!configuredPassword) {
    setFeedback("A senha da auditoria ainda não foi cadastrada no Painel Administrativo.", "warning", feedbackTarget);
    return;
  }

  if (typedPassword !== configuredPassword) {
    setFeedback("Senha de auditoria inválida.", "error", feedbackTarget);
    return;
  }

  clearFeedback(feedbackTarget);
  closeModal("auditPasswordModal");
  syncAuditPeriodInputs();
  renderAuditDashboard();
  document.getElementById("auditModal").showModal();
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal?.open) {
    modal.close();
  }
}

function normalizeColumnName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveColumnIndex(headers, aliases) {
  const normalized = headers.map((item) => normalizeColumnName(item));
  const aliasSet = aliases.map(normalizeColumnName);
  return normalized.findIndex((item) => aliasSet.includes(item));
}

function splitCsvLine(line, delimiter) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }
    if (char === delimiter && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((item) => item.trim());
}

function buildPostgrestInFilter(values) {
  return values
    .map((value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
}

function parseImportDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return todayIso();
  if (text.includes("/")) {
    const [day, month, year] = text.split("/");
    if (!day || !month || !year) return todayIso();
    return `${year.padStart(4, "20")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  return todayIso();
}

function parseImportFrequency(value) {
  const parsed = Number(String(value ?? "").trim());
  return [1, 2, 4, 8, 12].includes(parsed) ? parsed : 1;
}

function normalizeImportDay(value) {
  const normalized = normalizeColumnName(value).replace(/ feira/g, "").replace(/\s+/g, " ").trim();
  const map = {
    segunda: "SEGUNDA",
    terca: "TERCA",
    terça: "TERCA",
    quarta: "QUARTA",
    quinta: "QUINTA",
    sexta: "SEXTA",
    sabado: "SABADO",
    sábado: "SABADO",
    domingo: "DOMINGO",
  };
  return map[normalized] ?? null;
}

function parseImportDays(value, frequency) {
  const required = DIAS_POR_FREQUENCIA[frequency] ?? 1;
  const parts = String(value ?? "")
    .split(/[|,/;-]/)
    .map((item) => normalizeImportDay(item))
    .filter(Boolean);

  const unique = orderedDays([...new Set(parts)]);
  const fallback = DEFAULT_DAYS_BY_FREQUENCY[frequency] ?? ["SEGUNDA"];
  const completed = [...unique];
  for (const day of fallback) {
    if (completed.length >= required) break;
    if (!completed.includes(day)) completed.push(day);
  }
  return orderedDays(completed).slice(0, required);
}

function downloadSupplierCsvTemplate() {
  gerarExcelFornecedores();
}

function camposSelecionados() {
  const campos = ["Codigo", "Nome"];
  if (document.getElementById("fieldDataPedido")?.checked) campos.push("Data Pedido");
  if (document.getElementById("fieldFrequencia")?.checked) campos.push("Frequencia");
  if (document.getElementById("fieldDias")?.checked) campos.push("Dias");
  if (document.getElementById("fieldParametro")?.checked) campos.push("Parametro Estoque");
  if (document.getElementById("fieldLeadTime")?.checked) campos.push("Lead Time");
  if (document.getElementById("fieldComprador")?.checked) campos.push("Comprador");
  return campos;
}

const CAMPO_DESCRICAO = {
  "Codigo": "Código único do fornecedor (ex: F001)",
  "Nome": "Nome do fornecedor",
  "Data Pedido": "Data do primeiro pedido DD/MM/AAAA (ex: 25/02/2026)",
  "Frequencia": "Frequência de compra: 1, 2, 4, 8 ou 12",
  "Dias": "Dias da semana: SEGUNDA, TERCA, QUARTA, QUINTA, SEXTA, SABADO (separe com |)",
  "Parametro Estoque": "Cobertura de estoque em dias (número)",
  "Lead Time": "Dias entre o pedido e a entrega (número)",
  "Comprador": "Nome exato do comprador cadastrado no sistema",
};

function exportarFornecedores() {
  if (typeof XLSX === "undefined") {
    setFeedback("Biblioteca Excel não carregada. Recarregue a página.", "error");
    return;
  }
  if (!state.suppliers.length) {
    setFeedback("Nenhum fornecedor cadastrado para exportar.", "warning");
    return;
  }
  const headers = ["Codigo", "Nome", "Data Pedido", "Frequencia", "Dias", "Parametro Estoque", "Lead Time", "Comprador"];
  const rows = state.suppliers.map((s) => ({
    "Codigo": s.codigo_fornecedor,
    "Nome": s.nome_fornecedor,
    "Data Pedido": formatDate(s.data_primeiro_pedido),
    "Frequencia": s.frequencia_revisao,
    "Dias": s.dias_compra.join("|"),
    "Parametro Estoque": s.parametro_estoque,
    "Lead Time": s.lead_time_entrega,
    "Comprador": s.comprador_nome ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 20) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Fornecedores");
  XLSX.writeFile(wb, `fornecedores_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function gerarExcelFornecedores() {
  if (typeof XLSX === "undefined") {
    setFeedback("Biblioteca Excel não carregada. Tente recarregar a página.", "error");
    return;
  }
  const campos = camposSelecionados();
  const exemplo1 = {
    "Codigo": "F001", "Nome": "Fornecedor Exemplo A",
    "Data Pedido": "25/02/2026", "Frequencia": 4,
    "Dias": "TERCA", "Parametro Estoque": 30,
    "Lead Time": 5, "Comprador": state.buyers[0]?.nome_comprador ?? "Nome do Comprador",
  };
  const exemplo2 = { "Codigo": "F002", "Nome": "Fornecedor Exemplo B" };

  const linhaDescricao = {};
  const linhaEx1 = {};
  const linhaEx2 = {};
  campos.forEach((c) => {
    linhaDescricao[c] = CAMPO_DESCRICAO[c] ?? "";
    linhaEx1[c] = exemplo1[c] ?? "";
    linhaEx2[c] = exemplo2[c] ?? "";
  });

  const ws = XLSX.utils.json_to_sheet([linhaDescricao, linhaEx1], { header: campos });

  // Estilo do cabeçalho
  const range = XLSX.utils.decode_range(ws["!ref"]);
  campos.forEach((_, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (!ws[cellRef]) return;
    ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: "1E3A5F" } } };
  });

  // Largura das colunas
  ws["!cols"] = campos.map((c) => ({ wch: Math.max(c.length + 4, 20) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Fornecedores");
  XLSX.writeFile(wb, "modelo_fornecedores.xlsx");
}

async function importarArquivoFornecedores(file) {
  if (!file) return;
  let text;
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    if (typeof XLSX === "undefined") {
      setFeedback("Biblioteca Excel não carregada.", "error");
      return;
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Converte para CSV para reaprovitar o parser existente
    text = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    // Remove linha de descrição se for a segunda linha (começando por "Código único")
    const lines = text.split("\n");
    if (lines[1] && lines[1].includes("Código único")) {
      lines.splice(1, 1);
      text = lines.join("\n");
    }
  } else {
    text = await file.text();
  }
  await importSuppliersFromFile({ text, name: file.name });
}

function ensureBuyerSelection() {
  const settings = getSettings();
  const isAdminPortal = getLoggedPortalRole() === "admin_portal";
  const setActive = (id) => {
    if (isAdminPortal) sessionStorage.setItem(storageKeys.activeBuyerId, id);
    else localStorage.setItem(storageKeys.activeBuyerId, id);
  };
  if (getLoggedPortalRole() === "buyer" && settings.loggedBuyerId && state.buyers.some((buyer) => buyer.id === settings.loggedBuyerId)) {
    setActive(settings.loggedBuyerId);
  } else if (getLoggedPortalRole() === "admin_client") {
    const adminBuyer = (settings.loggedBuyerId && state.buyers.some((buyer) => buyer.id === settings.loggedBuyerId))
      ? state.buyers.find((buyer) => buyer.id === settings.loggedBuyerId)
      : buyerByEmail(getLoggedPortalEmail() || getClientAdminEmail());
    if (adminBuyer) {
      localStorage.setItem(storageKeys.activeBuyerId, adminBuyer.id);
      localStorage.setItem(storageKeys.loggedBuyerId, adminBuyer.id);
    } else if (!settings.activeBuyerId && state.buyers.length) {
      setActive(state.buyers[0].id);
    } else if (!settings.activeBuyerId && !state.buyers.length) {
      setActive(UNASSIGNED_BUYER_VALUE);
    }
  } else if (!settings.activeBuyerId && settings.loggedBuyerId && state.buyers.some((buyer) => buyer.id === settings.loggedBuyerId)) {
    setActive(settings.loggedBuyerId);
  } else if (!settings.activeBuyerId && state.buyers.length) {
    setActive(state.buyers[0].id);
  } else if (!settings.activeBuyerId && !state.buyers.length) {
    setActive(UNASSIGNED_BUYER_VALUE);
  }
}

function occurrenceRows() {
  return state.agenda
    .map((occurrence) => {
      const supplier = supplierById(occurrence.fornecedor_id);
      return {
        ...occurrence,
        supplier,
        codigo_fornecedor: supplier?.codigo_fornecedor ?? "-",
        nome_fornecedor: supplier?.nome_fornecedor ?? "Fornecedor não localizado",
        frequencia_revisao: supplier?.frequencia_revisao ?? 0,
        dias_compra: supplier?.dias_compra ?? [],
        comprador_nome: supplier?.comprador_nome ?? "Sem Comprador",
      };
    })
    .filter((row) => row.supplier);
}

function parseSuppliersCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("O CSV precisa ter cabeçalho e pelo menos uma linha.");
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter);
  const codigoIndex = resolveColumnIndex(headers, ["codigo", "codigo fornecedor", "cod fornecedor", "cod"]);
  const fabricanteIndex = resolveColumnIndex(headers, ["fabricante", "nome fornecedor", "fornecedor", "nome"]);
  const dataPedidoIndex = resolveColumnIndex(headers, ["data pedido", "data do pedido", "data primeiro pedido"]);
  const frequenciaIndex = resolveColumnIndex(headers, ["frequencia", "frequência", "freq"]);
  const estoqueIndex = resolveColumnIndex(headers, ["parametro estoque", "parametro de estoque", "parâmetro estoque", "parâmetro de estoque"]);
  const leadIndex = resolveColumnIndex(headers, ["lead time", "lead time entrega", "leadtime", "leadtime entrega"]);
  const compradorIndex = resolveColumnIndex(headers, ["comprador", "nome comprador"]);
  const diasIndex = resolveColumnIndex(headers, ["dias", "dias compra", "dias da semana", "dias de compra"]);

  if ([codigoIndex, fabricanteIndex].some((index) => index < 0)) {
    throw new Error("CSV inválido. Use colunas: Código e Nome.");
  }

  return lines.slice(1).map((line, rowIndex) => {
    const parts = splitCsvLine(line, delimiter);
    const codigo = String(parts[codigoIndex] ?? "").trim().toUpperCase();
    const fabricante = String(parts[fabricanteIndex] ?? "").trim();
    const frequencia = parseImportFrequency(frequenciaIndex >= 0 ? parts[frequenciaIndex] : "");
    const estoqueRaw = String(estoqueIndex >= 0 ? parts[estoqueIndex] ?? "" : "").trim();
    const leadRaw = String(leadIndex >= 0 ? parts[leadIndex] ?? "" : "").trim();
    const parametroEstoque = Number(estoqueRaw.replace(",", "."));
    const leadTime = Number(leadRaw.replace(",", "."));
    const compradorNome = String(compradorIndex >= 0 ? parts[compradorIndex] ?? "" : "").trim();
    const buyer = state.buyers.find((item) => item.nome_comprador.toLowerCase() === compradorNome.toLowerCase());
    const diasCompra = parseImportDays(diasIndex >= 0 ? parts[diasIndex] : "", frequencia);

    if (!codigo || !fabricante) {
      return null;
    }

    const minimoEstoque = PARAMETRO_MINIMO_FREQUENCIA[frequencia] ?? frequencia;
    let safeEstoque = Number.isNaN(parametroEstoque) ? minimoEstoque : parametroEstoque;
    if (safeEstoque < minimoEstoque) safeEstoque = minimoEstoque;
    const safeLead = Number.isNaN(leadTime) || leadRaw === "" ? 1 : leadTime;

    return {
      tenant_id: getSettings().tenantId,
      codigo_fornecedor: codigo,
      nome_fornecedor: fabricante,
      data_primeiro_pedido: parseImportDate(dataPedidoIndex >= 0 ? parts[dataPedidoIndex] : ""),
      frequencia_revisao: frequencia,
      parametro_estoque: safeEstoque,
      lead_time_entrega: safeLead,
      comprador_id: buyer?.id ?? null,
      _dias_compra: diasCompra,
      _row_number: rowIndex + 2,
      _import_warning: estoqueRaw !== "" && !Number.isNaN(parametroEstoque) && parametroEstoque < minimoEstoque
        ? `Fornecedor ${codigo}: parâmetro ajustado para ${minimoEstoque} dias (mínimo da frequência ${frequencia}).`
        : null,
    };
  }).filter(Boolean);
}

function validateSuppliersCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("O CSV precisa ter cabeçalho e pelo menos uma linha.");
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter);
  const codigoIndex = resolveColumnIndex(headers, ["codigo", "codigo fornecedor", "cod fornecedor", "cod"]);
  const nomeIndex = resolveColumnIndex(headers, ["fabricante", "nome fornecedor", "fornecedor", "nome"]);

  if ([codigoIndex, nomeIndex].some((index) => index < 0)) {
    throw new Error("CSV inválido. Use pelo menos as colunas Código e Nome.");
  }

  let validRows = 0;
  const issues = [];
  const notices = [];

  lines.slice(1).forEach((line, rowIndex) => {
    const parts = splitCsvLine(line, delimiter);
    const codigo = String(parts[codigoIndex] ?? "").trim();
    const nome = String(parts[nomeIndex] ?? "").trim();
    if (codigo && nome) {
      validRows += 1;
    } else {
      issues.push(`Linha ${rowIndex + 2}: código ou nome ausente.`);
    }
  });

  try {
    const mappedRows = parseSuppliersCsv(text);
    mappedRows.forEach((row) => {
      if (row._import_warning) notices.push(row._import_warning);
    });
  } catch {
    // a validação principal acima já cobre os erros impeditivos
  }

  return {
    totalRows: lines.length - 1,
    validRows,
    issues,
    notices,
  };
}

function renderAgendaTables() {
  const sections = [
    ["agendaDiaTable", "agenda-dia", "Sem agendas pendentes para hoje.", 6],
    ["proximasAgendasTable", "proximas-agendas", "Sem próximas agendas.", 6],
    ["atrasadasTable", "atrasadas", "Sem agendas atrasadas.", 6],
  ];

  sections.forEach(([targetId, scope, emptyText, colspan]) => {
    const rows = filteredRows(scope);
    document.getElementById(targetId).innerHTML = rows.length
      ? rows.map(tableRowForAgenda).join("")
      : `<tr><td colspan="${colspan}">${emptyText}</td></tr>`;
  });

  document.querySelectorAll("[data-open-occurrence]").forEach((button) => {
    button.addEventListener("click", () => openAgendaDetail(button.dataset.openOccurrence));
  });
}

function renderSemComprador() {
  const rows = state.suppliers.filter((supplier) => !supplier.comprador_id);
  document.getElementById("semCompradorTable").innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${row.codigo_fornecedor}</td>
        <td>${row.nome_fornecedor}</td>
        <td>${row.dias_compra.join(", ")}</td>
        <td>${row.frequencia_revisao}</td>
        <td class="td-actions">
          <button class="btn btn-outline btn-sm btn-table" data-edit-supplier="${row.id}">Editar Fornecedor</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="5">Todos os fornecedores estão vinculados.</td></tr>`;

  document.querySelectorAll("[data-edit-supplier]").forEach((button) => {
    button.addEventListener("click", () => editSupplier(button.dataset.editSupplier));
  });
}

function buildAuditRecommendations(entries, allEntries = null) {
  const metrics = aggregateAuditMetrics(entries);
  const base = allEntries ?? entries;
  const recommendations = [];

  // 1) Resumo executivo
  const adimplencia = metrics.total > 0 ? Math.round((metrics.cumpridas / metrics.total) * 100) : 0;
  recommendations.push({
    title: "📊 Resumo executivo",
    text: `${metrics.total} evento(s) auditado(s) — adimplência ${adimplencia}%: ${metrics.cumpridas} cumprida(s), ${metrics.postergadas} postergada(s), ${metrics.antecipadas} antecipada(s). Ajustes de parâmetro: +${metrics.aumentos} aumento(s), −${metrics.reducoes} redução(ões).`,
  });

  // 2) Risco de atraso acumulado
  if (metrics.postergadas >= 3) {
    const taxa = metrics.total > 0 ? Math.round((metrics.postergadas / metrics.total) * 100) : 0;
    recommendations.push({
      title: "⚠️ Risco de atraso acumulado",
      text: `${taxa}% das agendas foram postergadas. Revise a carga por comprador, os dias de compra e a aderência da frequência de revisão por fornecedor.`,
    });
  }

  // 3) Comprador mais postergador
  const byBuyer = new Map();
  base.forEach((e) => {
    if (!byBuyer.has(e.buyerName)) byBuyer.set(e.buyerName, { total: 0, postergadas: 0, aumentos: 0 });
    const b = byBuyer.get(e.buyerName);
    b.total++;
    b.postergadas += e.metrics.postergada;
    b.aumentos += e.metrics.aumentoParametro;
  });
  const maisPostergado = Array.from(byBuyer.entries())
    .filter(([, v]) => v.total >= 3)
    .sort(([, a], [, b]) => (b.postergadas / b.total) - (a.postergadas / a.total))[0];
  if (maisPostergado && maisPostergado[1].postergadas > 0) {
    const [nome, v] = maisPostergado;
    const pct = Math.round((v.postergadas / v.total) * 100);
    if (pct >= 30) {
      recommendations.push({
        title: `📋 Comprador sobrecarregado: ${nome}`,
        text: `${pct}% das agendas de ${nome} foram postergadas (${v.postergadas} de ${v.total}). Sinal de carga excessiva ou carteira difícil — vale revisar distribuição.`,
      });
    }
  }

  // 4) Pressão vs. enxugar estoque
  if (metrics.aumentos > metrics.reducoes && metrics.aumentos >= 3) {
    recommendations.push({
      title: "📈 Pressão de estoque",
      text: `${metrics.aumentos} aumento(s) contra ${metrics.reducoes} redução(ões). Vale revisar fornecedores com ajuste recorrente para elevar o parâmetro base ou o lead time esperado.`,
    });
  } else if (metrics.reducoes > metrics.aumentos && metrics.reducoes >= 3) {
    recommendations.push({
      title: "📉 Espaço para enxugar estoque",
      text: `${metrics.reducoes} redução(ões) contra ${metrics.aumentos} aumento(s). Considere revisar fornecedores com sobrecobertura e ajustar a política base de parâmetro.`,
    });
  }

  // 5) Carteira sem dono
  const semComprador = entries.filter((e) => e.buyerId === "sem-comprador").length;
  if (semComprador) {
    recommendations.push({
      title: "👤 Carteira sem dono",
      text: `${semComprador} evento(s) sem comprador vinculado. Distribua esses fornecedores para fechar a rastreabilidade da auditoria.`,
    });
  }

  // 6) Fornecedor "elástico" — muitos ajustes (aumento + redução) no período
  const supplierStats = new Map();
  entries.forEach((e) => {
    const name = e.supplierName || "(sem fornecedor)";
    if (!supplierStats.has(name)) supplierStats.set(name, { ajustes: 0, aumentos: 0, reducoes: 0, antecipadas: 0, postergadas: 0, total: 0, dows: {} });
    const s = supplierStats.get(name);
    s.ajustes += e.metrics.aumentoParametro + e.metrics.reducaoParametro;
    s.aumentos += e.metrics.aumentoParametro;
    s.reducoes += e.metrics.reducaoParametro;
    s.antecipadas += e.metrics.antecipada;
    s.postergadas += e.metrics.postergada;
    s.total += 1;
    if (e.actionDate) {
      const dow = new Date(e.actionDate + "T00:00:00").getDay();
      s.dows[dow] = (s.dows[dow] ?? 0) + (e.metrics.postergada || 0);
    }
  });

  const elasticos = Array.from(supplierStats.entries())
    .filter(([, s]) => s.ajustes >= 4)
    .sort((a, b) => b[1].ajustes - a[1].ajustes)[0];
  if (elasticos) {
    const [nome, s] = elasticos;
    recommendations.push({
      title: `📐 Fornecedor com parâmetro instável: ${nome}`,
      text: `${s.ajustes} ajuste(s) de parâmetro no período (${s.aumentos} aumento(s) + ${s.reducoes} redução(ões)). Frequência de revisão pode estar mal calibrada — vale recalcular.`,
    });
  }

  // 7) Fornecedor sempre antecipado — sugere reduzir parâmetro
  const sempreAntecipado = Array.from(supplierStats.entries())
    .filter(([, s]) => s.total >= 3 && s.antecipadas >= Math.ceil(s.total * 0.6) && s.antecipadas > s.postergadas)
    .sort((a, b) => b[1].antecipadas - a[1].antecipadas)[0];
  if (sempreAntecipado) {
    const [nome, s] = sempreAntecipado;
    recommendations.push({
      title: `♻️ Parâmetro alto demais? ${nome}`,
      text: `${s.antecipadas} de ${s.total} agendas foram antecipadas (>60%). Esse fornecedor pode estar com parâmetro de compra maior que o necessário — considere reduzir.`,
    });
  }

  // 8) Fornecedor concentrando atrasos num dia da semana
  const sazonal = Array.from(supplierStats.entries())
    .filter(([, s]) => s.postergadas >= 3)
    .map(([nome, s]) => {
      const dias = Object.entries(s.dows).sort((a, b) => b[1] - a[1]);
      if (!dias.length) return null;
      const [dowTop, qtd] = dias[0];
      const taxa = qtd / s.postergadas;
      return { nome, dow: Number(dowTop), qtd, total: s.postergadas, taxa };
    })
    .filter((x) => x && x.taxa >= 0.6)
    .sort((a, b) => b.qtd - a.qtd)[0];
  if (sazonal) {
    recommendations.push({
      title: `🔁 Padrão semanal: ${sazonal.nome}`,
      text: `${sazonal.qtd} das ${sazonal.total} agendas postergadas de ${sazonal.nome} caem em ${DIAS_SEMANA_HEATMAP[sazonal.dow]}. Considere mover o pedido para outro dia.`,
    });
  }

  // 9) Fornecedor com mais aumentos de parâmetro (mantém — independente do elástico)
  const maisAumento = Array.from(supplierStats.entries())
    .filter(([, s]) => s.aumentos >= 2)
    .sort((a, b) => b[1].aumentos - a[1].aumentos)[0];
  if (maisAumento && (!elasticos || maisAumento[0] !== elasticos[0])) {
    const [nome, s] = maisAumento;
    recommendations.push({
      title: `🏭 Fornecedor em alerta: ${nome}`,
      text: `${s.aumentos} ajuste(s) de aumento de parâmetro. Considere revisar o parâmetro base ou o lead time desse fornecedor.`,
    });
  }

  // 10) Execução fora da carteira — auditoria de governança
  const foraDaCarteira = entries.filter((e) => e.meta?.executado_fora_da_carteira).length;
  if (foraDaCarteira >= 2) {
    const pct = Math.round((foraDaCarteira / metrics.total) * 100);
    recommendations.push({
      title: "🛡️ Execução fora da carteira",
      text: `${foraDaCarteira} evento(s) (${pct}%) foram tratados por alguém diferente do comprador titular. Confirme se isso reflete substituição planejada ou se há gargalo.`,
    });
  }

  // Fallback: operação estável
  if (recommendations.length === 1) {
    recommendations.push({
      title: "✅ Operação estável",
      text: "Nenhum desvio relevante detectado. Mantenha a rotina de revisão e acompanhe a evolução semanal por comprador.",
    });
  }

  return recommendations;
}

function getAuditRange() {
  const preset = document.getElementById("auditPeriodPreset")?.value ?? state.auditFilter.preset;
  const customStart = brToIso(document.getElementById("auditStartDate")?.value ?? "");
  const customEnd = brToIso(document.getElementById("auditEndDate")?.value ?? "");
  const today = todayLocalIso();

  if (preset === "ultima_semana") {
    return { start: addDaysLocalIso(today, -6), end: today, label: "Últimos 7 dias" };
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
        ? `Período personalizado: ${formatDate(customStart)} até ${formatDate(customEnd)}`
        : "Período personalizado em aberto",
    };
  }

  return { start: addDaysLocalIso(today, -29), end: today, label: "Últimos 30 dias" };
}

function syncAuditPeriodInputs() {
  const presetInput = document.getElementById("auditPeriodPreset");
  const startInput = document.getElementById("auditStartDate");
  const endInput = document.getElementById("auditEndDate");
  const summary = document.getElementById("auditPeriodSummary");
  if (!presetInput || !startInput || !endInput || !summary) return;

  const preset = presetInput.value;
  const today = todayLocalIso();
  let start = "";
  let end = "";

  if (preset === "30dias") {
    start = addDaysLocalIso(today, -29);
    end = today;
  } else if (preset === "ultima_semana") {
    start = addDaysLocalIso(today, -6);
    end = today;
  } else if (preset === "ultimo_mes") {
    const range = previousMonthRange();
    start = range.start;
    end = range.end;
  } else {
    start = brToIso(startInput.value) || state.auditFilter.startDate || "";
    end = brToIso(endInput.value) || state.auditFilter.endDate || "";
  }

  state.auditFilter = { preset, startDate: start, endDate: end };
  startInput.value = isoToBr(start);
  endInput.value = isoToBr(end);
  startInput.disabled = preset !== "personalizado";
  endInput.disabled = preset !== "personalizado";

  const range = getAuditRange();
  summary.textContent = range.label;
}

let _auditChartPie = null;
let _auditChartBar = null;
let _auditChartTimeline = null;
let _auditChartTopFornecedores = null;

function _destroyAuditCharts() {
  if (_auditChartPie) { _auditChartPie.destroy(); _auditChartPie = null; }
  if (_auditChartBar) { _auditChartBar.destroy(); _auditChartBar = null; }
  if (_auditChartTimeline) { _auditChartTimeline.destroy(); _auditChartTimeline = null; }
  if (_auditChartTopFornecedores) { _auditChartTopFornecedores.destroy(); _auditChartTopFornecedores = null; }
}

function _renderAuditCharts(entries) {
  _destroyAuditCharts();
  if (typeof Chart === "undefined") return;

  const metrics = aggregateAuditMetrics(entries);
  const pieCtx = document.getElementById("auditChartPie")?.getContext("2d");
  if (pieCtx && metrics.total > 0) {
    _auditChartPie = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels: ["Cumpridas", "Postergadas", "Antecipadas"],
        datasets: [{ data: [metrics.cumpridas, metrics.postergadas, metrics.antecipadas], backgroundColor: ["#10b981", "#ef4444", "#f59e0b"], borderWidth: 2 }],
      },
      options: { responsive: false, plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } }, cutout: "60%" },
    });
  }

  const grouped = new Map();
  entries.forEach((e) => {
    if (!grouped.has(e.buyerName)) grouped.set(e.buyerName, { cumpridas: 0, postergadas: 0, antecipadas: 0 });
    const b = grouped.get(e.buyerName);
    b.cumpridas += e.metrics.cumprida;
    b.postergadas += e.metrics.postergada;
    b.antecipadas += e.metrics.antecipada;
  });

  const barCtx = document.getElementById("auditChartBar")?.getContext("2d");
  if (barCtx && grouped.size > 0) {
    const labels = Array.from(grouped.keys());
    _auditChartBar = new Chart(barCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Cumpridas", data: labels.map((n) => grouped.get(n).cumpridas), backgroundColor: "#10b981" },
          { label: "Postergadas", data: labels.map((n) => grouped.get(n).postergadas), backgroundColor: "#ef4444" },
          { label: "Antecipadas", data: labels.map((n) => grouped.get(n).antecipadas), backgroundColor: "#f59e0b" },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } },
        scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true } },
      },
    });
  }
}

function _renderAuditTimelineChart(entries, range) {
  if (typeof Chart === "undefined") return;
  const ctx = document.getElementById("auditChartTimeline")?.getContext("2d");
  if (!ctx) return;
  if (!entries.length || !range.start || !range.end) return;

  // Gera lista de dias entre start e end
  const days = [];
  const cursor = new Date(range.start + "T00:00:00");
  const endDate = new Date(range.end + "T00:00:00");
  while (cursor <= endDate) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  if (days.length > 90) return; // Períodos muito longos: pula gráfico

  const cumpridas = days.map(() => 0);
  const postergadas = days.map(() => 0);
  const antecipadas = days.map(() => 0);
  entries.forEach((e) => {
    const idx = days.indexOf(e.actionDate);
    if (idx === -1) return;
    if (e.metrics.cumprida) cumpridas[idx] += 1;
    if (e.metrics.postergada) postergadas[idx] += 1;
    if (e.metrics.antecipada) antecipadas[idx] += 1;
  });

  _auditChartTimeline = new Chart(ctx, {
    type: "line",
    data: {
      labels: days.map((d) => formatDate(d).slice(0, 5)),
      datasets: [
        { label: "Cumpridas", data: cumpridas, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,.15)", tension: .3, fill: true },
        { label: "Postergadas", data: postergadas, borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,.15)", tension: .3, fill: true },
        { label: "Antecipadas", data: antecipadas, borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,.15)", tension: .3, fill: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

const DIAS_SEMANA_HEATMAP = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function _renderAuditHeatmap(entries) {
  const wrap = document.getElementById("auditHeatmap");
  if (!wrap) return;
  if (!entries.length) {
    wrap.innerHTML = `<div class="muted" style="padding:24px;text-align:center;font-size:12px;">Sem dados no período.</div>`;
    return;
  }

  // matrix[metric][weekday] = count
  const metricas = [
    { key: "cumprida", label: "✅ Cumpridas", color: [16, 185, 129] },
    { key: "postergada", label: "⏰ Postergadas", color: [239, 68, 68] },
    { key: "aumentoParametro", label: "⬆ Aumentos", color: [245, 158, 11] },
    { key: "reducaoParametro", label: "⬇ Reduções", color: [59, 130, 246] },
  ];
  const matrix = metricas.map(() => Array(7).fill(0));
  entries.forEach((e) => {
    if (!e.actionDate) return;
    const dow = new Date(e.actionDate + "T00:00:00").getDay();
    metricas.forEach((m, i) => {
      if (e.metrics[m.key]) matrix[i][dow] += 1;
    });
  });
  const maxPorLinha = matrix.map((row) => Math.max(1, ...row));

  let html = `<div class="audit-heatmap-grid">`;
  html += `<div class="audit-heatmap-cell audit-heatmap-corner"></div>`;
  DIAS_SEMANA_HEATMAP.forEach((d) => {
    html += `<div class="audit-heatmap-cell audit-heatmap-header">${d}</div>`;
  });
  metricas.forEach((m, i) => {
    html += `<div class="audit-heatmap-cell audit-heatmap-rowlabel">${m.label}</div>`;
    for (let d = 0; d < 7; d++) {
      const v = matrix[i][d];
      const intensity = v / maxPorLinha[i];
      const alpha = v === 0 ? 0.06 : 0.25 + intensity * 0.65;
      const [r, g, b] = m.color;
      const bg = `rgba(${r},${g},${b},${alpha})`;
      const textColor = intensity > 0.55 ? "#fff" : "var(--text)";
      html += `<div class="audit-heatmap-cell audit-heatmap-value" style="background:${bg};color:${textColor};">${v || ""}</div>`;
    }
  });
  html += `</div>`;
  wrap.innerHTML = html;
}

function _renderAuditTopFornecedores(entries) {
  if (typeof Chart === "undefined") return;
  const ctx = document.getElementById("auditChartTopFornecedores")?.getContext("2d");
  if (!ctx) return;
  if (!entries.length) return;

  // Agrupa por fornecedor: postergadas, aumentos, reduções
  const grouped = new Map();
  entries.forEach((e) => {
    const name = e.supplierName || "(sem fornecedor)";
    if (!grouped.has(name)) grouped.set(name, { postergadas: 0, aumentos: 0, reducoes: 0, total: 0 });
    const g = grouped.get(name);
    g.postergadas += e.metrics.postergada;
    g.aumentos += e.metrics.aumentoParametro;
    g.reducoes += e.metrics.reducaoParametro;
    g.total += e.metrics.postergada + e.metrics.aumentoParametro + e.metrics.reducaoParametro;
  });

  const top = Array.from(grouped.entries())
    .filter(([, g]) => g.total > 0)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);

  if (!top.length) return;

  _auditChartTopFornecedores = new Chart(ctx, {
    type: "bar",
    data: {
      labels: top.map(([n]) => n.length > 24 ? n.slice(0, 22) + "…" : n),
      datasets: [
        { label: "Postergadas", data: top.map(([, g]) => g.postergadas), backgroundColor: "#ef4444" },
        { label: "Aumentos", data: top.map(([, g]) => g.aumentos), backgroundColor: "#f59e0b" },
        { label: "Reduções", data: top.map(([, g]) => g.reducoes), backgroundColor: "#3b82f6" },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } },
      scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true } },
    },
  });
}

function _populateAuditBuyerFilter() {
  const sel = document.getElementById("auditBuyerFilter");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Todos</option>' +
    state.buyers.map((b) => `<option value="${b.id}"${b.id === current ? " selected" : ""}>${b.nome_comprador}</option>`).join("");
}

function _populateAuditSupplierFilter(filterBuyerId = "") {
  const sel = document.getElementById("auditSupplierFilter");
  if (!sel) return;
  const current = sel.value;
  const base = filterBuyerId
    ? state.auditOccurrences.filter((o) => o.comprador_id === filterBuyerId)
    : state.auditOccurrences;
  const usedIds = new Set(base.map((o) => o.fornecedor_id).filter(Boolean));
  const suppliers = state.suppliers
    .filter((s) => usedIds.has(s.id))
    .sort((a, b) => a.nome_fornecedor.localeCompare(b.nome_fornecedor));
  const validCurrent = suppliers.some((s) => s.id === current) ? current : "";
  sel.innerHTML = '<option value="">Todos</option>' +
    suppliers.map((s) => `<option value="${s.id}"${s.id === validCurrent ? " selected" : ""}>${s.nome_fornecedor}</option>`).join("");
}

function renderPedidoCell(entry) {
  if (entry.pedidoRealizado === true) {
    const qtd = entry.pedidoQuantidade ?? "—";
    const val = entry.pedidoValor != null
      ? "R$ " + entry.pedidoValor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—";
    return `<span style="color:#10b981;font-weight:600">✅</span> ${qtd} un · <strong>${val}</strong>`;
  }
  if (entry.pedidoRealizado === false) {
    const motivo = PEDIDO_MOTIVO_LABEL[entry.pedidoMotivoNao] ?? "Sem motivo";
    const detalhe = entry.pedidoMotivoDetalhe ? ` <span class="muted" title="${entry.pedidoMotivoDetalhe.replace(/"/g, '&quot;')}">📝</span>` : "";
    return `<span style="color:#ef4444;font-weight:600">❌</span> <span style="font-size:12px">${motivo}</span>${detalhe}`;
  }
  return `<span class="muted">—</span>`;
}

function exportAuditToExcel(entries, range) {
  if (!entries.length) { setFeedback("Nenhum dado para exportar.", "warning"); return; }
  const rows = entries.map((e) => ({
    "Comprador": e.buyerName,
    "Código": e.supplierCode,
    "Fornecedor": e.supplierName,
    "Data ação": e.actionDate ? formatDate(e.actionDate) : "-",
    "Data prevista": e.plannedDate ? formatDate(e.plannedDate) : "-",
    "Tipo": e.tipo,
    "Pedido": e.pedidoRealizado === true ? "Sim" : e.pedidoRealizado === false ? "Não" : "",
    "Quantidade pedida": e.pedidoQuantidade ?? "",
    "Valor pedido (R$)": e.pedidoValor ?? "",
    "Motivo não pedido": PEDIDO_MOTIVO_LABEL[e.pedidoMotivoNao] ?? "",
    "Detalhe motivo": e.pedidoMotivoDetalhe ?? "",
    "Δ Parâmetro (dias)": Number(e.meta?.incremento_parametro_dias ?? 0),
    "Δ Próxima data (dias)": Number(e.meta?.ajuste_proxima_data_dias ?? 0),
    "Detalhe": e.resumo,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
  XLSX.writeFile(wb, `auditoria_${range.start}_${range.end}.xlsx`);
}

const AUDIT_ACAO_LABEL = { criacao: "Criação", exclusao: "Exclusão", alteracao: "Alteração" };
const AUDIT_OBJETO_LABEL = { fornecedor: "Fornecedor", comprador: "Comprador" };
const AUDIT_CAMPO_LABEL = {
  codigo_fornecedor: "Código",
  nome_fornecedor: "Nome",
  comprador_nome: "Comprador",
  frequencia_revisao: "Frequência",
  parametro_estoque: "Parâm. Estoque",
  lead_time_entrega: "Lead Time",
  dias_compra: "Dias de Compra",
  hora_inicio: "Horário Início",
  hora_fim: "Horário Fim",
  nome_comprador: "Nome",
  email: "E-mail",
};

function renderAuditDashboard() {
  const summaryGrid = document.getElementById("auditSummaryGrid");
  const insights = document.getElementById("auditInsights");
  const aiAnalysis = document.getElementById("auditAiAnalysis");
  const buyerGroups = document.getElementById("auditBuyerGroups");
  syncAuditPeriodInputs();
  _populateAuditBuyerFilter();
  const filterBuyerId = document.getElementById("auditBuyerFilter")?.value ?? "";
  _populateAuditSupplierFilter(filterBuyerId);
  const range = getAuditRange();
  const filterSupplierId = document.getElementById("auditSupplierFilter")?.value ?? "";

  const allEntries = state.auditOccurrences
    .filter((raw) => !filterSupplierId || raw.fornecedor_id === filterSupplierId)
    .map(classifyAuditEvent)
    .filter((entry) => entry.status !== "PENDENTE" || entry.meta)
    .filter((entry) => {
      if (!entry.actionDate) return false;
      if (range.start && entry.actionDate < range.start) return false;
      if (range.end && entry.actionDate > range.end) return false;
      return true;
    })
    .sort((left, right) => String(right.actionDate).localeCompare(String(left.actionDate)));

  const entries = filterBuyerId ? allEntries.filter((e) => e.buyerId === filterBuyerId) : allEntries;

  const metrics = aggregateAuditMetrics(entries);
  const pedidosRespondidos = metrics.pedidosSim + metrics.pedidosNao;
  const taxaPedido = pedidosRespondidos > 0 ? Math.round((metrics.pedidosSim / pedidosRespondidos) * 100) : null;
  const valorTotalFmt = "R$ " + metrics.valorTotalPedidos.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  summaryGrid.innerHTML = [
    ["Eventos", metrics.total],
    ["Cumpridas", metrics.cumpridas],
    ["Postergadas", metrics.postergadas],
    ["Aumentos", metrics.aumentos],
    ["Reduções", metrics.reducoes],
    ["Antecipadas", metrics.antecipadas],
    ["Taxa de pedido", taxaPedido === null ? "—" : `${taxaPedido}%`],
    ["Valor total", valorTotalFmt],
  ].map(([label, value]) => `
    <div class="kpi-card">
      <span class="muted">${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");

  _renderAuditCharts(entries);
  _renderAuditTimelineChart(entries, range);
  _renderAuditHeatmap(entries);
  _renderAuditTopFornecedores(entries);

  // Leitura sintética
  const txAdimplencia = metrics.total > 0 ? Math.round((metrics.cumpridas / metrics.total) * 100) : 0;
  insights.innerHTML = [
    {
      title: "Taxa de adimplência",
      text: metrics.total
        ? `${txAdimplencia}% das agendas foram cumpridas no prazo (${metrics.cumpridas} de ${metrics.total}). ${txAdimplencia >= 80 ? "Performance dentro do esperado." : "Performance abaixo de 80% — recomenda-se revisão da carga."}`
        : "Ainda não há eventos suficientes para calcular a taxa.",
    },
    {
      title: "Acompanhamento por comprador",
      text: `${range.label}. Use o filtro acima para isolar um comprador. Expanda os grupos abaixo para drill-down por evento.`,
    },
  ].map((item) => `
    <article class="audit-insight-card">
      <strong>${item.title}</strong>
      <div>${item.text}</div>
    </article>
  `).join("");

  // Inteligência — recomendações gerais + por comprador
  aiAnalysis.innerHTML = buildAuditRecommendations(entries, allEntries).map((item) => `
    <article class="audit-insight-card">
      <strong>${item.title}</strong>
      <div>${item.text}</div>
    </article>
  `).join("");

  // Agrupamento por comprador
  const grouped = new Map();
  entries.forEach((entry) => {
    if (!grouped.has(entry.buyerId)) grouped.set(entry.buyerId, []);
    grouped.get(entry.buyerId).push(entry);
  });

  buyerGroups.innerHTML = grouped.size
    ? Array.from(grouped.entries()).map(([buyerId, buyerEntries]) => {
      const bm = aggregateAuditMetrics(buyerEntries);
      const adimplencia = bm.total > 0 ? Math.round((bm.cumpridas / bm.total) * 100) : 0;
      return `
        <details class="audit-group" open>
          <summary>
            <div class="audit-group-summary">
              <strong>${buyerEntries[0].buyerName}</strong>
              <span class="muted">${buyerEntries.length} evento(s) — ${adimplencia}% adimplência</span>
            </div>
            <div class="audit-group-metrics">
              <span class="audit-pill">✅ ${bm.cumpridas}</span>
              <span class="audit-pill" style="background:var(--danger-light,#fee2e2);color:var(--danger,#dc2626)">⏰ ${bm.postergadas}</span>
              <span class="audit-pill" style="background:#fef3c7;color:#92400e">⬆ ${bm.aumentos}</span>
              <span class="audit-pill" style="background:#d1fae5;color:#065f46">⬇ ${bm.reducoes}</span>
            </div>
          </summary>
          <div class="audit-group-body table-wrap">
            <table class="audit-event-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Fornecedor</th>
                  <th>Evento</th>
                  <th>Pedido</th>
                  <th>Δ Parâm.</th>
                  <th>Δ Data</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                ${buyerEntries.map((entry) => {
                  const dp = Number(entry.meta?.incremento_parametro_dias ?? 0);
                  const dd = Number(entry.meta?.ajuste_proxima_data_dias ?? 0);
                  const dpColor = dp > 0 ? "color:#f59e0b" : dp < 0 ? "color:#10b981" : "color:#6b7280";
                  const ddColor = dd > 0 ? "color:#ef4444" : dd < 0 ? "color:#10b981" : "color:#6b7280";
                  const justificativa = entry.meta?.justificativa ?? "";
                  const detalheHtml = justificativa
                    ? `${entry.resumo}<br><span class="audit-justificativa">📝 ${justificativa}</span>`
                    : entry.resumo;
                  return `
                    <tr>
                      <td>${entry.actionDate ? formatDate(entry.actionDate) : "-"}</td>
                      <td>${entry.supplierCode} — ${entry.supplierName}</td>
                      <td>${entry.tipo}</td>
                      <td class="audit-pedido-cell">${renderPedidoCell(entry)}</td>
                      <td style="${dpColor};font-weight:600">${dp > 0 ? "+" : ""}${dp}d</td>
                      <td style="${ddColor};font-weight:600">${dd > 0 ? "+" : ""}${dd}d</td>
                      <td class="audit-event-note">${detalheHtml}</td>
                    </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </details>`;
    }).join("")
    : `<div class="msg info">Nenhum evento encontrado para os filtros selecionados.</div>`;

  // Seção: Eventos de Cadastro (fornecedor / comprador)
  const cadastroSection = document.getElementById("auditCadastroSection");
  if (cadastroSection) {
    const auditLogs = (state.auditLogs ?? []).filter((log) => {
      const d = log.created_at?.slice(0, 10) ?? "";
      if (range.start && d < range.start) return false;
      if (range.end && d > range.end) return false;
      return true;
    });
    if (!auditLogs.length) {
      cadastroSection.innerHTML = `<div class="msg info">Nenhum evento de cadastro no período.</div>`;
    } else {
      cadastroSection.innerHTML = `<table class="audit-event-table">
        <thead><tr>
          <th>Data</th><th>Tipo</th><th>Objeto</th><th>Ação</th><th>Alterações</th><th>Por</th>
        </tr></thead>
        <tbody>
          ${auditLogs.map((log) => {
            const dt = log.created_at ? new Date(log.created_at) : null;
            const dtLabel = dt ? dt.toLocaleDateString("pt-BR") : "-";
            const campos = log.campos_alterados ?? {};
            const diffsHtml = Object.entries(campos)
              .filter(([k]) => k !== "comprador_id")
              .map(([campo, val]) => {
                const label = AUDIT_CAMPO_LABEL[campo] ?? campo;
                const de = val.de !== null && val.de !== undefined ? String(Array.isArray(val.de) ? val.de.join(", ") : val.de) : "—";
                const para = val.para !== null && val.para !== undefined ? String(Array.isArray(val.para) ? val.para.join(", ") : val.para) : "—";
                if (val.de === null) return `<em>${label}:</em> ${para}`;
                if (val.para === null) return `<em>${label}:</em> ${de} <span style="color:#dc2626">removido</span>`;
                return `<em>${label}:</em> ${de} → ${para}`;
              })
              .join("<br>");
            return `<tr>
              <td style="white-space:nowrap">${dtLabel}</td>
              <td><span class="audit-pill" style="background:#e0e7ff;color:#3730a3">${AUDIT_OBJETO_LABEL[log.tipo_objeto] ?? log.tipo_objeto}</span></td>
              <td>${log.objeto_nome ?? "-"}</td>
              <td><span class="audit-pill" style="${log.acao === "exclusao" ? "background:#fee2e2;color:#991b1b" : log.acao === "criacao" ? "background:#d1fae5;color:#065f46" : "background:#fef3c7;color:#92400e"}">${AUDIT_ACAO_LABEL[log.acao] ?? log.acao}</span></td>
              <td style="font-size:12px;line-height:1.6">${diffsHtml || "—"}</td>
              <td style="font-size:12px;color:#64748b">${log.executor_nome ?? "-"}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;
    }
  }

  // Bind export button
  document.getElementById("exportAuditButton")?.addEventListener("click", () => exportAuditToExcel(entries, range), { once: true });

  // Bind filter changes
  document.getElementById("auditBuyerFilter")?.addEventListener("change", renderAuditDashboard, { once: true });
  document.getElementById("auditSupplierFilter")?.addEventListener("change", renderAuditDashboard, { once: true });
}

function refreshSupplierSuggestion() {
  const frequency = Number(document.getElementById("fornecedorFrequencia").value || 0);
  const baseDate = brToIso(document.getElementById("fornecedorDataPrimeiroPedido").value);
  const days = selectedSupplierDays();
  if (!baseDate || !frequency || !days.length) {
    sugestaoProximaData.textContent = "Preencha Data Pedido, Frequência e Dias para ver a sugestão.";
    return;
  }
  const suggested = calculateSuggestedDate(baseDate, frequency, days);
  sugestaoProximaData.textContent = suggested ? `${formatDate(suggested)} (${DIAS_LABEL[parseIsoToWeekdayName(suggested)]})` : "Não foi possível calcular.";
}

function updateParametroEstoqueHint() {
  const freqInput = document.getElementById("fornecedorFrequencia");
  const estoqueInput = document.getElementById("fornecedorParametroEstoque");
  const hint = document.getElementById("fornecedorParametroEstoqueHint");
  if (!freqInput || !estoqueInput || !hint) return;
  const freq = Number(freqInput.value || 0);
  if (!freq || !PARAMETRO_MINIMO_FREQUENCIA[freq]) {
    hint.textContent = "";
    estoqueInput.min = "0";
    return;
  }
  const minimo = PARAMETRO_MINIMO_FREQUENCIA[freq];
  estoqueInput.min = String(minimo);
  const atual = Number(estoqueInput.value || 0);
  if (atual && atual < minimo) {
    hint.textContent = `Mínimo para frequência ${freq}: ${minimo} dias`;
    hint.style.color = "#dc2626";
  } else {
    hint.textContent = `Mínimo para essa frequência: ${minimo} dias`;
    hint.style.color = "var(--muted)";
  }
}

async function synchronizePendingAgendaSeeds() {
  setFeedback("Sincronizando a agenda dos fornecedores com a base operacional...", "info");
  try {
    let createdCount = 0;
    for (const supplier of state.suppliers) {
      const result = await ensurePendingOccurrenceForSupplier(supplier);
      if (result.created) createdCount += 1;
    }
    await loadPortalData({ silent: true, preserveFeedback: true });
    setFeedback(
      createdCount
        ? `Sincronização concluída. ${createdCount} agenda(s) pendente(s) foram geradas.`
        : "Sincronização concluída. Todos os fornecedores já estavam com agenda pendente ativa.",
      "success"
    );
  } catch (error) {
    setFeedback(`Não foi possível sincronizar a agenda operacional: ${error.message}`, "error");
  }
}

// ============================================================
// LOG DE E-MAILS
// ============================================================

const TIPO_LABEL = {
  auditoria:           "Auditoria D-1",
  agenda_proximo:      "Agenda Próxima",
  consolidado_gestor:  "Consolidado Gestor",
};

async function loadEmailLog() {
  const tbody = document.getElementById("emailLogTable");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="muted">Carregando...</td></tr>`;
  const dias = parseInt(document.getElementById("emailLogFilter")?.value ?? "30", 10);
  const { tenantId } = getSettings();
  if (!tenantId) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Tenant não configurado.</td></tr>`;
    return;
  }
  const desde = addDaysLocalIso(todayLocalIso(), -dias);
  try {
    const rows = await fetchSupabase(
      `/rest/v1/relatorio_log?select=created_at,tipo,email_destino,status,erro_mensagem,compradores(nome_comprador)` +
      `&tenant_id=eq.${tenantId}&created_at=gte.${desde}T00:00:00&order=created_at.desc&limit=100`
    );
    if (!rows?.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Nenhum e-mail registrado no período.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => {
      const dt = r.created_at ? new Date(r.created_at) : null;
      const dtLabel = dt
        ? `${dt.toLocaleDateString("pt-BR")} ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
        : "—";
      const compradorNome = Array.isArray(r.compradores)
        ? (r.compradores[0]?.nome_comprador ?? "—")
        : (r.compradores?.nome_comprador ?? "—");
      const tipoLabel = TIPO_LABEL[r.tipo] ?? r.tipo;
      const statusHtml = r.status === "enviado"
        ? `<span class="kpi-chip" style="background:#d1fae5;color:#065f46;">✅ Enviado</span>`
        : `<span class="kpi-chip" style="background:#fee2e2;color:#991b1b;" title="${r.erro_mensagem ?? ""}">❌ Erro</span>`;
      return `<tr>
        <td style="white-space:nowrap;">${dtLabel}</td>
        <td>${compradorNome}</td>
        <td>${tipoLabel}</td>
        <td style="font-size:12px;color:var(--text-muted);">${r.email_destino}</td>
        <td>${statusHtml}</td>
      </tr>`;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Erro ao carregar: ${err.message}</td></tr>`;
  }
}

// ============================================================
// FERIADOS
// ============================================================

function populateFeriadoAnoSelect() {
  const sel = document.getElementById("feriadoAnoSelect");
  if (!sel) return;
  const anoAtual = new Date().getFullYear();
  sel.innerHTML = [anoAtual - 1, anoAtual, anoAtual + 1]
    .map((a) => `<option value="${a}"${a === anoAtual ? " selected" : ""}>${a}</option>`)
    .join("");
}

async function saveFeriado(event) {
  event.preventDefault();
  const settings = getSettings();
  const id = document.getElementById("feriadoId").value;
  const data = brToIso(document.getElementById("feriadoData").value);
  const nome = document.getElementById("feriadoNome").value.trim();
  const feedbackEl = document.getElementById("feriadosFeedback");

  if (!data || !nome) {
    setFeedback("Informe a data e o nome do feriado.", "error", feedbackEl);
    feedbackEl.classList.remove("hidden");
    return;
  }

  try {
    if (id) {
      await fetchSupabase(`/rest/v1/feriados?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { data, nome },
      });
    } else {
      await fetchSupabase("/rest/v1/feriados", {
        method: "POST",
        headers: { Prefer: "return=minimal,resolution=merge-duplicates", "on_conflict": "tenant_id,data" },
        body: { tenant_id: settings.tenantId, data, nome, tipo: "personalizado" },
      });
    }
    document.getElementById("feriadoForm").reset();
    document.getElementById("feriadoId").value = "";
    feedbackEl.classList.add("hidden");
    await loadPortalData({ silent: true });
    refreshCalendar();
  } catch (error) {
    setFeedback(`Não foi possível salvar o feriado: ${error.message}`, "error", feedbackEl);
    feedbackEl.classList.remove("hidden");
  }
}

async function deleteFeriado(id) {
  const feedbackEl = document.getElementById("feriadosFeedback");
  try {
    await fetchSupabase(`/rest/v1/feriados?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await loadPortalData({ silent: true });
    refreshCalendar();
  } catch (error) {
    setFeedback(`Não foi possível excluir o feriado: ${error.message}`, "error", feedbackEl);
    feedbackEl.classList.remove("hidden");
  }
}

async function baixarFeriadosNacionais() {
  const settings = getSettings();
  const ano = document.getElementById("feriadoAnoSelect")?.value ?? new Date().getFullYear();
  const feedbackEl = document.getElementById("feriadosFeedback");
  const btn = document.getElementById("baixarFeriadosButton");

  if (btn) btn.disabled = true;
  setFeedback(`Buscando feriados nacionais de ${ano}...`, "info", feedbackEl);
  feedbackEl.classList.remove("hidden");

  try {
    const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`BrasilAPI retornou ${resp.status}`);
    const lista = await resp.json();

    let inseridos = 0;
    let ignorados = 0;
    for (const item of lista) {
      const jaExiste = state.feriados.some((f) => f.data === item.date);
      if (jaExiste) { ignorados++; continue; }
      await fetchSupabase("/rest/v1/feriados", {
        method: "POST",
        headers: { Prefer: "return=minimal,resolution=merge-duplicates", "on_conflict": "tenant_id,data" },
        body: { tenant_id: settings.tenantId, data: item.date, nome: item.name, tipo: "nacional" },
      });
      inseridos++;
    }

    await loadPortalData({ silent: true });
    refreshCalendar();
    setFeedback(
      `Feriados nacionais de ${ano} importados: ${inseridos} novo(s), ${ignorados} já existia(m).`,
      "success",
      feedbackEl
    );
    feedbackEl.classList.remove("hidden");
  } catch (error) {
    setFeedback(`Não foi possível baixar os feriados: ${error.message}`, "error", feedbackEl);
    feedbackEl.classList.remove("hidden");
  } finally {
    if (btn) btn.disabled = false;
  }
}

