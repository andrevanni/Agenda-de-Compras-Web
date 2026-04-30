function renderTables() {
  renderBuyerSelect();
  renderKpis();
  renderAgendaTables();
  renderSemComprador();
  renderSuppliers();
  renderPainel();
  renderBuyers();
  renderFeriadosTable();
  renderCompromissos();
}

function renderCompromissos() {
  const { activeBuyerId, tenantId } = getSettings();
  const catAgendaId = state.categorias.find((c) => c.nome === "Agenda de Compras")?.id;

  const rows = [...state.agenda]
    .filter((occ) => !occ.fornecedor_id)
    .filter((occ) => occ.categoria_id !== catAgendaId)
    .filter((occ) => {
      if (!activeBuyerId || activeBuyerId === UNASSIGNED_BUYER_VALUE) return true;
      return occ.comprador_id === activeBuyerId || !occ.comprador_id;
    })
    .sort((a, b) => {
      const da = (a.data_prevista ?? "") + (a.hora_inicio ?? "00:00");
      const db = (b.data_prevista ?? "") + (b.hora_inicio ?? "00:00");
      return da.localeCompare(db);
    });

  const tbody = document.getElementById("compromissosTable");
  if (!tbody) return;

  tbody.innerHTML = rows.length
    ? rows.map((occ) => {
        const cat = categoriaById(occ.categoria_id);
        const buyer = buyerById(occ.comprador_id);
        const horario = occ.hora_inicio
          ? occ.hora_inicio + (occ.hora_fim ? " – " + occ.hora_fim : "")
          : "-";
        return `<tr>
          <td>${formatDate(occ.data_prevista)}</td>
          <td>${occ.titulo ?? "-"}</td>
          <td>${cat ? `<span class="pill" style="background:${cat.cor};color:#fff;">${cat.nome}</span>` : "-"}</td>
          <td>${horario}</td>
          <td>${buyer?.nome_comprador ?? "<span class='muted'>Sem resp.</span>"}</td>
          <td class="td-actions">
            <button class="btn btn-danger btn-sm btn-table" data-delete-compromisso="${occ.id}">Excluir</button>
          </td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="6">Nenhum compromisso agendado para este comprador.</td></tr>`;

  tbody.querySelectorAll("[data-delete-compromisso]").forEach((btn) => {
    btn.addEventListener("click", () => deleteCompromisso(btn.dataset.deleteCompromisso));
  });
}

async function deleteCompromisso(id) {
  if (!confirm("Excluir este compromisso permanentemente?")) return;
  try {
    await fetchSupabase(
      `/rest/v1/agenda_ocorrencias?id=eq.${id}&tenant_id=eq.${getSettings().tenantId}`,
      { method: "DELETE" }
    );
    state.agenda = state.agenda.filter((occ) => occ.id !== id);
    renderCompromissos();
    refreshCalendar();
    setFeedback("Compromisso excluído.", "success");
  } catch (err) {
    setFeedback(`Erro ao excluir: ${err.message}`, "error");
  }
}

function classifyAuditEvent(entry) {
  const meta = parseOccurrenceObservacao(entry.observacao);
  const supplier = supplierById(entry.fornecedor_id);
  const buyer = buyerById(entry.comprador_id) ?? buyerById(supplier?.comprador_id) ?? null;
  const actionDate = entry.data_realizacao || entry.updated_at?.slice(0, 10) || entry.created_at?.slice(0, 10) || entry.data_prevista;
  const metrics = {
    cumprida: entry.status === "REALIZADA" ? 1 : 0,
    postergada: 0,
    antecipada: 0,
    aumentoParametro: 0,
    reducaoParametro: 0,
  };

  let tipo = entry.status;
  let resumo = "Evento operacional registrado.";

  if (meta?.type === "agenda_treatment") {
    const ajuste = Number(meta.ajuste_proxima_data_dias ?? 0);
    const incrementoParametro = Number(meta.incremento_parametro_dias ?? 0);
    if (ajuste > 0) metrics.postergada = 1;
    if (ajuste < 0) metrics.antecipada = 1;
    if (incrementoParametro > 0) metrics.aumentoParametro = 1;
    if (incrementoParametro < 0) metrics.reducaoParametro = 1;

    tipo = ajuste > 0 ? "Agenda postergada" : ajuste < 0 ? "Agenda antecipada" : "Agenda cumprida";
    resumo = meta.note || meta.summary || "Tratamento da agenda realizado pelo portal.";
  } else if (entry.status === "ADIADA") {
    metrics.postergada = 1;
    tipo = "Agenda adiada";
    resumo = meta?.note || "Ocorrencia marcada como adiada.";
  } else if (entry.status === "REALIZADA") {
    tipo = "Agenda cumprida";
    resumo = meta?.note || "Ocorrencia tratada sem detalhamento estruturado.";
  }

  return {
    id: entry.id,
    buyerId: buyer?.id ?? "sem-comprador",
    buyerName: buyer?.nome_comprador ?? "Sem comprador",
    supplierName: supplier?.nome_fornecedor ?? "Fornecedor não localizado",
    supplierCode: supplier?.codigo_fornecedor ?? "-",
    actionDate,
    plannedDate: entry.data_prevista,
    status: entry.status,
    tipo,
    resumo,
    meta,
    metrics,
  };
}

function aggregateAuditMetrics(entries) {
  return entries.reduce((acc, entry) => {
    acc.total += 1;
    acc.cumpridas += entry.metrics.cumprida;
    acc.postergadas += entry.metrics.postergada;
    acc.antecipadas += entry.metrics.antecipada;
    acc.aumentos += entry.metrics.aumentoParametro;
    acc.reducoes += entry.metrics.reducaoParametro;
    return acc;
  }, {
    total: 0,
    cumpridas: 0,
    postergadas: 0,
    antecipadas: 0,
    aumentos: 0,
    reducoes: 0,
  });
}

function showSection(sectionId) {
  state.currentSection = sectionId;
  clearFeedback();
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === sectionId);
  });
  document.querySelectorAll(".section-view").forEach((section) => {
    section.classList.toggle("hidden", section.id !== sectionId);
  });
  if (sectionId === "calendario") {
    if (state.calendarInstance) {
      setTimeout(() => state.calendarInstance.updateSize(), 50);
    } else {
      initCalendar();
    }
  }
}

function mapSupplier(item) {
  const buyer = Array.isArray(item.compradores) ? item.compradores[0] : item.compradores;
  const fallbackNotes = getSupplierNote(item.id);
  return {
    id: item.id,
    codigo_fornecedor: item.codigo_fornecedor,
    nome_fornecedor: item.nome_fornecedor,
    data_primeiro_pedido: item.data_primeiro_pedido,
    frequencia_revisao: Number(item.frequencia_revisao),
    parametro_estoque: Number(item.parametro_estoque),
    lead_time_entrega: Number(item.lead_time_entrega),
    parametro_compra: Number(item.parametro_compra ?? (Number(item.parametro_estoque) + Number(item.lead_time_entrega))),
    comprador_id: item.comprador_id ?? null,
    comprador_nome: buyer?.nome_comprador ?? "Sem Comprador",
    dias_compra: orderedDays((item.fornecedor_dias_compra ?? []).map((row) => row.dia_semana)),
    notas_relacionamento: item.notas_relacionamento ?? fallbackNotes ?? "",
    hora_inicio: item.hora_inicio ?? null,
    hora_fim: item.hora_fim ?? null,
  };
}

async function fetchPersistedSuppliersByCodes(codes) {
  const normalizedCodes = [...new Set(
    (codes ?? []).map((code) => String(code ?? "").trim().toUpperCase()).filter(Boolean)
  )];

  if (!normalizedCodes.length) return [];

  const rows = await fetchSupabase(
    `/rest/v1/fornecedores?select=id,codigo_fornecedor,nome_fornecedor,data_primeiro_pedido,frequencia_revisao,parametro_estoque,lead_time_entrega,parametro_compra,comprador_id,hora_inicio,hora_fim,compradores(nome_comprador),fornecedor_dias_compra(dia_semana)&tenant_id=eq.${getSettings().tenantId}&codigo_fornecedor=in.(${buildPostgrestInFilter(normalizedCodes)})&order=nome_fornecedor.asc`
  );

  return (rows ?? []).map(mapSupplier);
}

async function detectSupplierNotesColumn() {
  try {
    const rows = await fetchSupabase(
      `/rest/v1/fornecedores?select=id,notas_relacionamento&tenant_id=eq.${getSettings().tenantId}&limit=1`
    );
    state.features.fornecedorNotasColuna = Array.isArray(rows);
  } catch {
    state.features.fornecedorNotasColuna = false;
  }
}

async function fetchSupplierNotesRows() {
  if (!state.features.fornecedorNotasColuna) return [];
  try {
    return await fetchSupabase(
      `/rest/v1/fornecedores?select=id,notas_relacionamento&tenant_id=eq.${getSettings().tenantId}`
    );
  } catch {
    state.features.fornecedorNotasColuna = false;
    return [];
  }
}

async function fetchSupabase(path, options = {}) {
  const settings = getSettings();
  const response = await fetch(`${settings.supabaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: settings.supabaseKey,
      Authorization: `Bearer ${settings.supabaseKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message ?? data.details ?? data.error_description ?? `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength === "0") {
    return null;
  }

  const rawText = await response.text();
  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function diffDays(isoA, isoB) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const first = new Date(`${isoA}T12:00:00`);
  const second = new Date(`${isoB}T12:00:00`);
  return Math.round((first.getTime() - second.getTime()) / msPerDay);
}

function formatIncrement(value) {
  return `${value > 0 ? "+" : ""}${value} dia(s)`;
}

function openAgendaDetail(occurrenceId) {
  const row = occurrenceRows().find((item) => item.id === occurrenceId);
  if (!row) return;

  state.selectedOccurrenceId = occurrenceId;
  const supplier = row.supplier;
  const suggestedDate = calculateSuggestedDate(row.data_prevista, supplier.frequencia_revisao, supplier.dias_compra);
  const incrementoTratamentoBase = diffDays(row.data_prevista, todayIso());

  document.getElementById("agendaDetailGrid").innerHTML = [
    ["Fornecedor", row.nome_fornecedor],
    ["Data da Agenda", formatDate(row.data_prevista)],
    ["Frequ\u00eancia", supplier.frequencia_revisao],
    ["Dia da Semana", DIAS_LABEL[parseIsoToWeekdayName(row.data_prevista)]],
    ["Dias de Compra do Fornecedor", supplier.dias_compra.join(", ")],
    ["Data Pedido", formatDate(supplier.data_primeiro_pedido)],
    ["Par\u00e2metro de Estoque", supplier.parametro_estoque],
    ["Lead Time", supplier.lead_time_entrega],
    ["Par\u00e2metro de Compra", supplier.parametro_compra],
  ].map(([label, value]) => `
    <div>
      <strong>${label}</strong><br>
      ${value}
    </div>
  `).join("");

  document.getElementById("proximaDataInput").value = isoToBr(suggestedDate);
  document.getElementById("agendaObservacao").value = "Tratado pela tela";
  document.getElementById("agendaNota").value = row.nota ?? "";
  document.getElementById("incrementoTratamento").textContent = formatIncrement(incrementoTratamentoBase);
  document.getElementById("incrementoAjusteProxima").textContent = "+0 dia(s)";
  document.getElementById("incrementoParametroTotal").textContent = formatIncrement(incrementoTratamentoBase);
  document.getElementById("novoParametro").textContent = String(supplier.parametro_compra + incrementoTratamentoBase);
  refreshAgendaSupplierNotesState(supplier.id);
  clearFeedback(agendaDetailFeedback);
  document.getElementById("agendaDetailModal").showModal();
  updateAgendaAdjustment();
}

function refreshAgendaSupplierNotesState(supplierId) {
  const noteText = getSupplierNote(supplierId).trim();
  const notesButton = document.getElementById("openAgendaSupplierNotesButton");
  const preview = document.getElementById("agendaSupplierNotesPreview");

  if (notesButton) {
    notesButton.classList.toggle("has-note", Boolean(noteText));
    notesButton.textContent = noteText ? "Notas salvas" : "Notas";
  }

  if (preview) {
    preview.textContent = noteText || "Sem notas registradas.";
    preview.classList.toggle("muted", !noteText);
  }
}

function updateAgendaAdjustment() {
  const row = occurrenceRows().find((item) => item.id === state.selectedOccurrenceId);
  if (!row) return;
  const supplier = row.supplier;
  const suggestedDate = calculateSuggestedDate(row.data_prevista, supplier.frequencia_revisao, supplier.dias_compra);
  const chosenDate = brToIso(document.getElementById("proximaDataInput").value);
  const incrementoTratamentoBase = diffDays(row.data_prevista, todayIso());
  const incrementoAjuste = chosenDate ? diffDays(chosenDate, suggestedDate) : 0;
  const incrementoTotal = incrementoTratamentoBase + incrementoAjuste;
  document.getElementById("incrementoTratamento").textContent = formatIncrement(incrementoTratamentoBase);
  document.getElementById("incrementoAjusteProxima").textContent = formatIncrement(incrementoAjuste);
  document.getElementById("incrementoParametroTotal").textContent = formatIncrement(incrementoTotal);
  document.getElementById("novoParametro").textContent = String(supplier.parametro_compra + incrementoTotal);
}

async function tratarAgendaAtual() {
  const row = occurrenceRows().find((item) => item.id === state.selectedOccurrenceId);
  if (!row) return;
  const supplier = row.supplier;
  const executor = loggedPortalActor();
  const chosenDate = brToIso(document.getElementById("proximaDataInput").value);
  const observation = document.getElementById("agendaObservacao").value.trim() || "Tratado pela tela";
  const settings = getSettings();

  if (!chosenDate) {
    setFeedback("Informe a pr\u00f3xima data no formato DD/MM/AAAA.", "error", agendaDetailFeedback);
    return;
  }

  try {
    const feriadoWarningEl = document.getElementById("agendaDetailFeriadoWarning");
    const feriadoNaProxData = getFeriado(chosenDate);
    if (feriadoNaProxData && feriadoWarningEl) {
      setFeedback(`\u26a0\ufe0f ${formatDate(chosenDate)} \u00e9 feriado: "${feriadoNaProxData.nome}". Revise a pr\u00f3xima data antes de tratar.`, "warning", feriadoWarningEl);
      feriadoWarningEl.classList.remove("hidden");
    } else if (feriadoWarningEl) {
      feriadoWarningEl.classList.add("hidden");
    }

    const horaInicioProxima = supplier.hora_inicio ?? null;
    const horaFimProxima = supplier.hora_fim ?? null;
    const hasConflict = horaInicioProxima
      ? await checkEventConflict(settings.tenantId, chosenDate, horaInicioProxima, horaFimProxima, null)
      : false;
    if (hasConflict) {
      setFeedback(`Aten\u00e7\u00e3o: j\u00e1 existe outro compromisso no hor\u00e1rio ${horaInicioProxima}\u2013${horaFimProxima} em ${formatDate(chosenDate)}.`, "warning", agendaDetailFeedback);
      agendaDetailFeedback.classList.remove("hidden");
    }

    const weekdayName = parseIsoToWeekdayName(chosenDate);
    if (chosenDate && supplier.dias_compra.length && !supplier.dias_compra.includes(weekdayName)) {
      setFeedback(
        `Aviso: a pr\u00f3xima data escolhida cai em ${DIAS_LABEL[weekdayName]}, fora dos dias configurados (${supplier.dias_compra.join(", ")}). O sistema vai respeitar a data informada.`,
        "warning",
        agendaDetailFeedback
      );
    } else {
      clearFeedback(agendaDetailFeedback);
    }

    const suggestedDate = calculateSuggestedDate(row.data_prevista, supplier.frequencia_revisao, supplier.dias_compra);
    const incrementoTratamentoBase = diffDays(row.data_prevista, todayIso());
    const incrementoAjuste = diffDays(chosenDate, suggestedDate);
    const incrementoTotal = incrementoTratamentoBase + incrementoAjuste;
    const observacaoAuditoria = JSON.stringify({
      type: "agenda_treatment",
      note: observation,
      supplier_code: supplier.codigo_fornecedor,
      supplier_name: supplier.nome_fornecedor,
      original_date: row.data_prevista,
      suggested_date: suggestedDate,
      chosen_date: chosenDate,
      action_date: todayIso(),
      tratamento_incremento_dias: incrementoTratamentoBase,
      ajuste_proxima_data_dias: incrementoAjuste,
      incremento_parametro_dias: incrementoTotal,
      parametro_compra_anterior: supplier.parametro_compra,
      novo_parametro_compra: supplier.parametro_compra + incrementoTotal,
      buyer_id: supplier.comprador_id,
      buyer_name: supplier.comprador_nome,
      owner_buyer_id: supplier.comprador_id,
      owner_buyer_name: supplier.comprador_nome,
      executor_buyer_id: executor?.role === "buyer" ? executor.id : null,
      executor_buyer_name: executor?.role === "buyer" ? executor.nome : null,
      executor_admin_email: executor?.role === "admin_client" ? executor.email : null,
      executor_role: executor?.role ?? "anon",
      executor_display_name: executor?.displayName ?? "Execução sem login",
      executado_fora_da_carteira: executor?.role === "buyer"
        ? Boolean(executor?.id && supplier.comprador_id && executor.id !== supplier.comprador_id)
        : Boolean(executor?.role === "admin_client" && supplier.comprador_id),
      summary: incrementoAjuste > 0
        ? `Agenda postergada em ${incrementoAjuste} dia(s) com novo parametro sugerido de ${supplier.parametro_compra + incrementoTotal}.`
        : incrementoAjuste < 0
          ? `Agenda antecipada em ${Math.abs(incrementoAjuste)} dia(s) com novo parametro sugerido de ${supplier.parametro_compra + incrementoTotal}.`
          : `Agenda cumprida com novo parametro sugerido de ${supplier.parametro_compra + incrementoTotal}.`,
    });

    await fetchSupabase(`/rest/v1/agenda_ocorrencias?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: {
        status: "REALIZADA",
        data_realizacao: todayIso(),
        observacao: observacaoAuditoria,
        nota: document.getElementById("agendaNota").value.trim() || null,
      },
    });

    const existing = await fetchSupabase(`/rest/v1/agenda_ocorrencias?select=id&tenant_id=eq.${settings.tenantId}&fornecedor_id=eq.${row.fornecedor_id}&data_prevista=eq.${chosenDate}&status=eq.PENDENTE&limit=1`);
    if (!existing.length) {
      await fetchSupabase("/rest/v1/agenda_ocorrencias", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: {
          tenant_id: settings.tenantId,
          fornecedor_id: row.fornecedor_id,
          comprador_id: supplier.comprador_id,
          data_prevista: chosenDate,
          status: "PENDENTE",
          categoria_id: row.categoria_id ?? categoriaAgendaComprasId(),
          hora_inicio: supplier.hora_inicio ?? null,
          hora_fim: supplier.hora_fim ?? null,
        },
      });
    }

    setFeedback(`Agenda tratada. Pr\u00f3xima data programada: ${formatDate(chosenDate)}.`, "success");
    document.getElementById("agendaDetailModal").close();
    await loadPortalData({ silent: true });
  } catch (error) {
    setFeedback(`Não foi possível tratar a agenda: ${error.message}`, "error", agendaDetailFeedback);
  }
}

function syncNativeDateProxy(textInput, nativeInput) {
  if (!textInput || !nativeInput) return;
  const isoValue = brToIso(textInput.value);
  nativeInput.value = isoValue ?? "";
}

function setupDatePickerField(textInputId, nativeInputId, buttonId) {
  const textInput = document.getElementById(textInputId);
  const nativeInput = document.getElementById(nativeInputId);
  const button = document.getElementById(buttonId);
  let restoringFromPicker = false;
  let pickerOpen = false;

  if (!textInput || !nativeInput || !button || textInput.dataset.datePickerBound === "1") {
    return;
  }

  textInput.dataset.datePickerBound = "1";
  syncNativeDateProxy(textInput, nativeInput);

  const showNativeInput = () => {
    nativeInput.style.display = "block";
    nativeInput.style.position = "absolute";
    nativeInput.style.inset = "0";
    nativeInput.style.width = "1px";
    nativeInput.style.height = "1px";
    nativeInput.style.opacity = "0";
    nativeInput.style.pointerEvents = "none";
    nativeInput.style.zIndex = "-1";
  };

  const hideNativeInput = () => {
    nativeInput.style.display = "";
    nativeInput.style.position = "";
    nativeInput.style.inset = "";
    nativeInput.style.width = "";
    nativeInput.style.height = "";
    nativeInput.style.opacity = "";
    nativeInput.style.pointerEvents = "";
    nativeInput.style.zIndex = "";
    pickerOpen = false;
  };

  const restoreTextFromIso = (isoValue) => {
    restoringFromPicker = true;
    textInput.value = isoValue ? isoToBr(isoValue) : "";
    syncNativeDateProxy(textInput, nativeInput);
    hideNativeInput();
    window.setTimeout(() => {
      restoringFromPicker = false;
      textInput.dispatchEvent(new Event("change", { bubbles: true }));
    }, 0);
  };

  const openNativePicker = () => {
    const isoValue = brToIso(textInput.value) || nativeInput.value || "";
    nativeInput.value = isoValue || "";
    showNativeInput();
    pickerOpen = true;
    window.setTimeout(() => {
      if (typeof nativeInput.showPicker === "function") {
        nativeInput.showPicker();
      } else {
        nativeInput.focus();
        nativeInput.click();
      }
    }, 0);
  };

  textInput.addEventListener("change", () => {
    if (restoringFromPicker) return;
    syncNativeDateProxy(textInput, nativeInput);
  });

  textInput.addEventListener("blur", () => {
    syncNativeDateProxy(textInput, nativeInput);
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    openNativePicker();
  });

  nativeInput.addEventListener("change", () => {
    textInput.value = nativeInput.value ? isoToBr(nativeInput.value) : "";
    textInput.dispatchEvent(new Event("change", { bubbles: true }));
    hideNativeInput();
  });

  nativeInput.addEventListener("blur", () => {
    if (!pickerOpen) return;
    window.setTimeout(() => {
      if (pickerOpen) {
        hideNativeInput();
      }
    }, 0);
  });
}

async function saveBuyer(event) {
  event.preventDefault();
  const buyerId = document.getElementById("compradorId").value.trim();
  const existingPhoto = document.getElementById("compradorFotoAtual").value.trim();
  const file = document.getElementById("compradorFotoArquivo").files[0];
  const rawPassword = document.getElementById("compradorSenha").value.trim();
  const payload = {
    tenant_id: getSettings().tenantId,
    nome_comprador: document.getElementById("compradorNome").value.trim(),
    telefone: document.getElementById("compradorTelefone").value.trim() || null,
    email: document.getElementById("compradorEmail").value.trim().toLowerCase() || null,
    foto_path: existingPhoto || null,
  };

  if (file) {
    payload.foto_path = await fileToDataUrl(file);
  }

  if (!payload.nome_comprador || !payload.email) {
    setFeedback("Nome e email sao obrigatorios.", "error");
    return;
  }

  if (!buyerId && !rawPassword) {
    setFeedback("Defina uma senha de acesso para o comprador.", "error");
    return;
  }

  const isSelf = getLoggedPortalRole() === "buyer" && getSettings().loggedBuyerId === buyerId;
  const isAdmin = getLoggedPortalRole() !== "buyer";
  if (rawPassword && (isAdmin || isSelf)) {
    payload.senha_hash = rawPassword;
  }

  const duplicatedBuyer = state.buyers.find((buyer) => {
    if ((buyer.email ?? "").toLowerCase() !== payload.email) return false;
    return buyer.id !== buyerId;
  });
  const targetBuyerId = buyerId || duplicatedBuyer?.id || "";

  try {
    if (targetBuyerId) {
      await fetchSupabase(`/rest/v1/compradores?id=eq.${targetBuyerId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: payload,
      });
      if (buyerId) {
        setFeedback("Comprador atualizado com sucesso.", "success");
      } else {
        setFeedback("Ja existia um comprador com esse e-mail. O cadastro foi atualizado com a nova foto e os novos dados.", "success");
      }
    } else {
      await fetchSupabase("/rest/v1/compradores", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: payload,
      });
      setFeedback("Comprador cadastrado com sucesso.", "success");
    }
    resetBuyerForm();
    await loadPortalData({ silent: true });
  } catch (error) {
    setFeedback(`Não foi possível salvar o comprador: ${error.message}`, "error");
  }
}

async function saveSupplier(event) {
  event.preventDefault();
  const supplierId = document.getElementById("fornecedorId").value.trim();
  const supplierNotesDraft = document.getElementById("fornecedorNotasDraft").value.trim();
  const frequency = Number(document.getElementById("fornecedorFrequencia").value || 0);
  const selectedDays = orderedDays(selectedSupplierDays());
  const requiredDays = DIAS_POR_FREQUENCIA[frequency] ?? 0;
  const parametroEstoque = Number(document.getElementById("fornecedorParametroEstoque").value || 0);
  const leadTime = Number(document.getElementById("fornecedorLeadTime").value || 0);
  const payload = {
    tenant_id: getSettings().tenantId,
    codigo_fornecedor: document.getElementById("fornecedorCodigo").value.trim(),
    nome_fornecedor: document.getElementById("fornecedorNome").value.trim(),
    data_primeiro_pedido: brToIso(document.getElementById("fornecedorDataPrimeiroPedido").value),
    frequencia_revisao: frequency,
    parametro_estoque: parametroEstoque,
    lead_time_entrega: leadTime,
    comprador_id: fornecedorCompradorSelect.value || null,
    hora_inicio: document.getElementById("fornecedorHoraInicio").value || null,
    hora_fim: document.getElementById("fornecedorHoraFim").value || null,
  };

  if (state.features.fornecedorNotasColuna) {
    payload.notas_relacionamento = supplierNotesDraft || null;
  }

  if (!payload.codigo_fornecedor || !payload.nome_fornecedor || !payload.data_primeiro_pedido || !frequency) {
    setFeedback("Preencha codigo, nome, data do pedido no formato DD/MM/AAAA e frequencia.", "error");
    return;
  }

  if (parametroEstoque < frequency) {
    setFeedback("O parâmetro de estoque não pode ser menor que a frequência de revisão.", "error");
    return;
  }

  if (selectedDays.length !== requiredDays) {
    setFeedback(`A frequencia ${frequency} exige ${requiredDays} dia(s) de compra selecionado(s).`, "error");
    return;
  }

  try {
    let savedId = supplierId;
    if (supplierId) {
      await fetchSupabase(`/rest/v1/fornecedores?id=eq.${supplierId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: payload,
      });
      await fetchSupabase(`/rest/v1/fornecedor_dias_compra?fornecedor_id=eq.${supplierId}`, {
        method: "DELETE",
      });
    } else {
      const inserted = await fetchSupabase("/rest/v1/fornecedores", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: payload,
      });
      savedId = inserted?.[0]?.id ?? "";
    }

    if (!savedId) {
      throw new Error("Não foi possível identificar o fornecedor salvo.");
    }

    if (selectedDays.length) {
      await fetchSupabase("/rest/v1/fornecedor_dias_compra", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: selectedDays.map((dia) => ({
          tenant_id: getSettings().tenantId,
          fornecedor_id: savedId,
          dia_semana: dia,
        })),
      });
    }

    await persistSupplierNote(savedId, supplierNotesDraft);

    const agendaSeed = await ensurePendingOccurrenceForSupplier({
      id: savedId,
      tenant_id: payload.tenant_id,
      data_primeiro_pedido: payload.data_primeiro_pedido,
      frequencia_revisao: payload.frequencia_revisao,
      dias_compra: selectedDays,
      comprador_id: payload.comprador_id,
      hora_inicio: payload.hora_inicio,
      hora_fim: payload.hora_fim,
    });

    setFeedback(
      agendaSeed.created
        ? `${supplierId ? "Fornecedor atualizado" : "Fornecedor cadastrado"} com sucesso. Agenda inicial gerada para ${formatDate(agendaSeed.date)}.`
        : `${supplierId ? "Fornecedor atualizado" : "Fornecedor cadastrado"} com sucesso.`,
      "success"
    );

    resetSupplierForm();
    await loadPortalData({ silent: true });
  } catch (error) {
    setFeedback(`Não foi possível salvar o fornecedor: ${error.message}`, "error");
  }
}

// ============================================================
// FERIADOS
// ============================================================

function renderFeriadosTable() {
  const tbody = document.getElementById("feriadosTable");
  if (!tbody) return;

  if (!state.feriados.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted" style="text-align:center">Nenhum feriado cadastrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.feriados.map((f) => `
    <tr>
      <td>${formatDate(f.data)}</td>
      <td>${f.nome}</td>
      <td><span class="kpi-chip" style="background:${f.tipo === "nacional" ? "#FEF3C7;color:#92400E" : "#EDE9FE;color:#5B21B6"}">${f.tipo === "nacional" ? "Nacional" : "Personalizado"}</span></td>
      <td>
        <button class="btn btn-outline btn-sm" type="button" onclick="deleteFeriado('${f.id}')">Excluir</button>
      </td>
    </tr>
  `).join("");
}

