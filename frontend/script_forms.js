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
  if (getLoggedPortalRole() === "buyer" && settings.loggedBuyerId && state.buyers.some((buyer) => buyer.id === settings.loggedBuyerId)) {
    localStorage.setItem(storageKeys.activeBuyerId, settings.loggedBuyerId);
  } else if (getLoggedPortalRole() === "admin_client") {
    const adminBuyer = (settings.loggedBuyerId && state.buyers.some((buyer) => buyer.id === settings.loggedBuyerId))
      ? state.buyers.find((buyer) => buyer.id === settings.loggedBuyerId)
      : buyerByEmail(getLoggedPortalEmail() || getClientAdminEmail());
    if (adminBuyer) {
      localStorage.setItem(storageKeys.activeBuyerId, adminBuyer.id);
      localStorage.setItem(storageKeys.loggedBuyerId, adminBuyer.id);
    } else if (!settings.activeBuyerId && state.buyers.length) {
      localStorage.setItem(storageKeys.activeBuyerId, state.buyers[0].id);
    } else if (!settings.activeBuyerId && !state.buyers.length) {
      localStorage.setItem(storageKeys.activeBuyerId, UNASSIGNED_BUYER_VALUE);
    }
  } else if (!settings.activeBuyerId && settings.loggedBuyerId && state.buyers.some((buyer) => buyer.id === settings.loggedBuyerId)) {
    localStorage.setItem(storageKeys.activeBuyerId, settings.loggedBuyerId);
  } else if (!settings.activeBuyerId && state.buyers.length) {
    localStorage.setItem(storageKeys.activeBuyerId, state.buyers[0].id);
  } else if (!settings.activeBuyerId && !state.buyers.length) {
    localStorage.setItem(storageKeys.activeBuyerId, UNASSIGNED_BUYER_VALUE);
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

    let safeEstoque = Number.isNaN(parametroEstoque) ? frequencia : parametroEstoque;
    if (safeEstoque < frequencia) safeEstoque = frequencia;
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
      _import_warning: estoqueRaw !== "" && !Number.isNaN(parametroEstoque) && parametroEstoque < frequencia
        ? `Fornecedor ${codigo}: parâmetro ajustado para ${frequencia} porque não pode ser menor que a frequência.`
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

function buildAuditRecommendations(entries) {
  const metrics = aggregateAuditMetrics(entries);
  const recommendations = [];

  recommendations.push({
    title: "Resumo executivo",
    text: `${metrics.total} evento(s) auditado(s), com ${metrics.cumpridas} agenda(s) cumprida(s), ${metrics.postergadas} postergações, ${metrics.aumentos} aumento(s) e ${metrics.reducoes} redução(ões) de parâmetro.`,
  });

  if (metrics.postergadas >= 3) {
    recommendations.push({
      title: "Risco de atraso acumulado",
      text: "A quantidade de postergações sugere revisar a carga por comprador, os dias de compra e a aderência da frequência de revisão por fornecedor.",
    });
  }

  if (metrics.aumentos > metrics.reducoes) {
    recommendations.push({
      title: "Pressão de estoque",
      text: "Os aumentos de parâmetro superaram as reduções. Vale revisar fornecedores com recorrência de ajuste para elevar o parâmetro base ou o lead time esperado.",
    });
  } else if (metrics.reducoes > metrics.aumentos) {
    recommendations.push({
      title: "Espaço para enxugar estoque",
      text: "As reduções de parâmetro estão predominando. Considere revisar fornecedores com sobrecobertura e ajustar a política base de parâmetro.",
    });
  }

  const withoutBuyer = entries.filter((entry) => entry.buyerId === "sem-comprador").length;
  if (withoutBuyer) {
    recommendations.push({
      title: "Carteira sem dono",
      text: `${withoutBuyer} evento(s) ainda estão sem comprador vinculado. O ideal é distribuir esses fornecedores para fechar a rastreabilidade da auditoria.`,
    });
  }

  if (recommendations.length === 1) {
    recommendations.push({
      title: "Operação estável",
      text: "Não foram detectados desvios relevantes. Mantenha a rotina de revisão e acompanhe a evolução semanal dos eventos por comprador.",
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

function renderAuditDashboard() {
  const summaryGrid = document.getElementById("auditSummaryGrid");
  const insights = document.getElementById("auditInsights");
  const aiAnalysis = document.getElementById("auditAiAnalysis");
  const buyerGroups = document.getElementById("auditBuyerGroups");
  syncAuditPeriodInputs();
  const range = getAuditRange();

  const entries = state.auditOccurrences
    .map(classifyAuditEvent)
    .filter((entry) => entry.status !== "PENDENTE" || entry.meta)
    .filter((entry) => {
      if (!entry.actionDate) return false;
      if (range.start && entry.actionDate < range.start) return false;
      if (range.end && entry.actionDate > range.end) return false;
      return true;
    })
    .sort((left, right) => String(right.actionDate).localeCompare(String(left.actionDate)));

  const metrics = aggregateAuditMetrics(entries);
  summaryGrid.innerHTML = [
    ["Eventos", metrics.total],
    ["Cumpridas", metrics.cumpridas],
    ["Postergadas", metrics.postergadas],
    ["Aumentos", metrics.aumentos],
    ["Reduções", metrics.reducoes],
    ["Antecipadas", metrics.antecipadas],
  ].map(([label, value]) => `
    <div class="kpi-card">
      <span class="muted">${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");

  const syntheticCards = [
    {
      title: "Eventos auditáveis",
      text: metrics.total ? "A trilha combina ocorrências tratadas, parâmetros ajustados e reprogramações feitas na agenda." : "Ainda não há eventos suficientes para a auditoria.",
    },
    {
      title: "Acompanhamento por comprador",
      text: `A visão abaixo agrupa o histórico por comprador e permite expandir o detalhamento dos eventos registrados no período ${range.label.toLowerCase()}.`,
    },
  ];

  insights.innerHTML = syntheticCards.map((item) => `
    <article class="audit-insight-card">
      <strong>${item.title}</strong>
      <div>${item.text}</div>
    </article>
  `).join("");

  aiAnalysis.innerHTML = buildAuditRecommendations(entries).map((item) => `
    <article class="audit-insight-card">
      <strong>${item.title}</strong>
      <div>${item.text}</div>
    </article>
  `).join("");

  const grouped = new Map();
  entries.forEach((entry) => {
    if (!grouped.has(entry.buyerId)) grouped.set(entry.buyerId, []);
    grouped.get(entry.buyerId).push(entry);
  });

  buyerGroups.innerHTML = grouped.size
    ? Array.from(grouped.entries()).map(([buyerId, buyerEntries]) => {
      const buyerMetrics = aggregateAuditMetrics(buyerEntries);
      return `
        <details class="audit-group" ${buyerId !== "sem-comprador" ? "open" : ""}>
          <summary>
            <div class="audit-group-summary">
              <strong>${buyerEntries[0].buyerName}</strong>
              <span class="muted">${buyerEntries.length} evento(s) auditado(s)</span>
            </div>
            <div class="audit-group-metrics">
              <span class="audit-pill">Cumpridas: ${buyerMetrics.cumpridas}</span>
              <span class="audit-pill">Postergadas: ${buyerMetrics.postergadas}</span>
              <span class="audit-pill">Aumentos: ${buyerMetrics.aumentos}</span>
            </div>
          </summary>
          <div class="audit-group-body table-wrap">
            <table class="audit-event-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Fornecedor</th>
                  <th>Evento</th>
                  <th>Impacto</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                ${buyerEntries.map((entry) => `
                  <tr>
                    <td>${entry.actionDate ? formatDate(entry.actionDate) : "-"}</td>
                    <td>${entry.supplierCode} - ${entry.supplierName}</td>
                    <td>${entry.tipo}</td>
                    <td>
                      Parâmetro: ${Number(entry.meta?.incremento_parametro_dias ?? 0)} dia(s)<br>
                      Próxima data: ${Number(entry.meta?.ajuste_proxima_data_dias ?? 0)} dia(s)
                    </td>
                    <td class="audit-event-note">${entry.resumo}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </details>
      `;
    }).join("")
    : `<div class="msg info">Ainda não há histórico suficiente para montar a auditoria detalhada.</div>`;
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

