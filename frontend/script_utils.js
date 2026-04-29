
function getSettings() {
  return {
    supabaseUrl: localStorage.getItem(storageKeys.supabaseUrl) ?? defaultSettings.supabaseUrl,
    supabaseKey: localStorage.getItem(storageKeys.supabaseKey) ?? defaultSettings.supabaseKey,
    tenantId: localStorage.getItem(storageKeys.tenantId) ?? defaultSettings.tenantId,
    activeBuyerId: localStorage.getItem(storageKeys.activeBuyerId) ?? "",
    loggedBuyerId: localStorage.getItem(storageKeys.loggedBuyerId) ?? "",
    logoUrl: localStorage.getItem(storageKeys.logoUrl) ?? defaultSettings.logoUrl,
    theme: localStorage.getItem(storageKeys.theme) ?? "dark",
    apiBaseUrl: localStorage.getItem(storageKeys.apiBaseUrl) ?? defaultSettings.apiBaseUrl,
  };
}

function getJWT() {
  return localStorage.getItem(storageKeys.jwt) ?? "";
}

async function fetchApi(path, options = {}) {
  const { apiBaseUrl } = getSettings();
  if (!apiBaseUrl) throw new Error("API não configurada.");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "POST",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail ?? data.message ?? `HTTP ${response.status}`);
  return data;
}

function applyTheme(themeName = getSettings().theme) {
  document.body.dataset.theme = themeName;
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeChoice === themeName);
  });
}

function setFeedback(message, type = "info", target = feedbackBox) {
  target.textContent = message;
  target.className = `msg ${type}`;
}

function clearFeedback(target = feedbackBox) {
  target.textContent = "";
  target.className = "msg hidden";
}

function renderImportPreview(message, type = "info") {
  if (!importPreviewBox) return;
  importPreviewBox.textContent = message;
  importPreviewBox.className = `msg ${type}`;
}

function clearImportPreview() {
  if (!importPreviewBox) return;
  importPreviewBox.textContent = "";
  importPreviewBox.className = "msg hidden";
}

function formatDate(dateText) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${dateText}T00:00:00`));
}

function isoToBr(dateText) {
  if (!dateText) return "";
  const [year, month, day] = String(dateText).split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

function brToIso(dateText) {
  const value = String(dateText ?? "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = value.split("/");
  if (parts.length !== 3) return "";
  const [day, month, year] = parts.map((item) => item.trim());
  if (!day || !month || !year) return "";
  return `${year.padStart(4, "20")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function todayLocalIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysLocalIso(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function previousMonthRange() {
  const now = new Date();
  const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayPreviousMonth = new Date(firstDayCurrentMonth.getTime() - 86400000);
  const firstDayPreviousMonth = new Date(lastDayPreviousMonth.getFullYear(), lastDayPreviousMonth.getMonth(), 1);
  const start = `${firstDayPreviousMonth.getFullYear()}-${String(firstDayPreviousMonth.getMonth() + 1).padStart(2, "0")}-${String(firstDayPreviousMonth.getDate()).padStart(2, "0")}`;
  const end = `${lastDayPreviousMonth.getFullYear()}-${String(lastDayPreviousMonth.getMonth() + 1).padStart(2, "0")}-${String(lastDayPreviousMonth.getDate()).padStart(2, "0")}`;
  return { start, end };
}

function buyerInitials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseIsoToWeekdayName(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  return DIAS_SEMANA[(date.getDay() + 6) % 7];
}

function orderedDays(days) {
  return [...days].sort((left, right) => DIAS_PYTHON[left] - DIAS_PYTHON[right]);
}

function logoTargets() {
  return [document.getElementById("sidebarLogo"), document.getElementById("pageLogo"), document.getElementById("logoPreview")];
}

function applyLogo() {
  const { logoUrl } = getSettings();
  const footerLogo = document.getElementById("footerLogo");
  if (footerLogo) {
    footerLogo.src = "assets/logo_alta.jpg";
  }
  logoTargets().forEach((element) => {
    element.src = logoUrl;
  });
}

function parseClientObservacoes(value) {
  if (!value) return {};
  if (typeof value === "object") {
    return value;
  }
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildClientObservacoes(existingValue, updates) {
  const previous = parseClientObservacoes(existingValue);
  return JSON.stringify({ ...previous, ...updates });
}

function getSupplierNotesMap(source = state.clientMeta) {
  const notes = source?.supplier_notes;
  return notes && typeof notes === "object" ? notes : {};
}

function getSupplierNote(supplierId) {
  if (!supplierId) return "";
  const supplier = state.suppliers.find((item) => item.id === supplierId);
  if (supplier?.notas_relacionamento) {
    return String(supplier.notas_relacionamento);
  }
  return String(getSupplierNotesMap()[supplierId] ?? "");
}

function parseOccurrenceObservacao(value) {
  if (!value) return null;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return { note: value };
  }
}

function activeBuyer() {
  const { activeBuyerId } = getSettings();
  if (activeBuyerId === UNASSIGNED_BUYER_VALUE) return null;
  return state.buyers.find((buyer) => buyer.id === activeBuyerId) ?? null;
}

function loggedBuyer() {
  const { loggedBuyerId } = getSettings();
  return state.buyers.find((buyer) => buyer.id === loggedBuyerId) ?? null;
}

function supplierById(id) {
  return state.suppliers.find((supplier) => supplier.id === id) ?? null;
}

function buyerById(id) {
  return state.buyers.find((buyer) => buyer.id === id) ?? null;
}

function applyAvatarMarkup(elementId, buyer, sizeClass) {
  const element = document.getElementById(elementId);
  const initials = buyer ? buyerInitials(buyer.nome_comprador) : "SF";
  if (!element) return;

  if (buyer?.foto_path) {
    element.outerHTML = `<img id="${elementId}" class="avatar ${sizeClass}" src="${buyer.foto_path}" alt="${buyer.nome_comprador}">`;
  } else {
    element.outerHTML = `<div id="${elementId}" class="avatar ${sizeClass} avatar-placeholder">${initials}</div>`;
  }
}

function updateBuyerCard() {
  const { activeBuyerId } = getSettings();
  const filterBuyer = activeBuyer();
  const fallbackName = activeBuyerId === UNASSIGNED_BUYER_VALUE
    ? "Sem comprador"
    : filterBuyer?.nome_comprador ?? "Sem comprador";
  buyerNameLabel.textContent = fallbackName;
  topBuyerName.textContent = fallbackName;
  applyAvatarMarkup("buyerAvatar", filterBuyer, "avatar-lg");
  applyAvatarMarkup("topBuyerAvatar", filterBuyer, "avatar-sm");
}

function filteredRows(scope) {
  const rows = occurrenceRows();
  const { activeBuyerId } = getSettings();
  const filteredByBuyer = activeBuyerId === UNASSIGNED_BUYER_VALUE
    ? rows.filter((row) => !row.supplier.comprador_id)
    : activeBuyerId
      ? rows.filter((row) => row.supplier.comprador_id === activeBuyerId)
      : rows;

  if (scope === "agenda-dia") {
    return filteredByBuyer.filter((row) => row.data_prevista === todayIso());
  }
  if (scope === "proximas-agendas") {
    return filteredByBuyer.filter((row) => row.data_prevista >= todayIso());
  }
  if (scope === "atrasadas") {
    return filteredByBuyer.filter((row) => row.data_prevista < todayIso());
  }
  return filteredByBuyer;
}

function renderBuyerSelect() {
  const { activeBuyerId } = getSettings();
  activeBuyerSelect.innerHTML = [
    ...state.buyers.map((buyer) => `<option value="${buyer.id}">${buyer.nome_comprador}</option>`),
    `<option value="${UNASSIGNED_BUYER_VALUE}">Sem comprador</option>`,
  ].join("");

  if (activeBuyerId === UNASSIGNED_BUYER_VALUE) {
    activeBuyerSelect.value = UNASSIGNED_BUYER_VALUE;
  } else if (activeBuyerId && state.buyers.some((buyer) => buyer.id === activeBuyerId)) {
    activeBuyerSelect.value = activeBuyerId;
  } else if (state.buyers.length) {
    activeBuyerSelect.value = state.buyers[0].id;
    localStorage.setItem(storageKeys.activeBuyerId, state.buyers[0].id);
  } else {
    activeBuyerSelect.value = UNASSIGNED_BUYER_VALUE;
    localStorage.setItem(storageKeys.activeBuyerId, UNASSIGNED_BUYER_VALUE);
  }

  fornecedorCompradorSelect.innerHTML = [
    `<option value="">Sem Comprador</option>`,
    ...state.buyers.map((buyer) => `<option value="${buyer.id}">${buyer.nome_comprador}</option>`),
  ].join("");

  updateBuyerCard();
}

function tableRowForAgenda(row) {
  return `
    <tr>
      <td>${formatDate(row.data_prevista)}</td>
      <td>${row.codigo_fornecedor}</td>
      <td>${row.nome_fornecedor}</td>
      <td>${row.dias_compra.join(", ")}</td>
      <td>${row.frequencia_revisao}</td>
      <td class="td-actions">
        <button class="btn btn-outline btn-sm btn-table" data-open-occurrence="${row.id}">Ver Detalhe</button>
      </td>
    </tr>
  `;
}

function renderSuppliers() {
  document.getElementById("fornecedoresTable").innerHTML = state.suppliers.length
    ? state.suppliers.map((supplier) => `
      <tr>
        <td>${supplier.codigo_fornecedor}</td>
        <td>${supplier.nome_fornecedor}</td>
        <td>${formatDate(supplier.data_primeiro_pedido)}</td>
        <td>${supplier.dias_compra.join(", ")}</td>
        <td>${supplier.frequencia_revisao}</td>
        <td>${supplier.parametro_compra}</td>
        <td>${supplier.comprador_nome ?? "Sem Comprador"}</td>
        <td class="td-actions">
          <div class="actions">
            <button class="btn btn-outline btn-sm btn-table" data-edit-supplier="${supplier.id}">Editar</button>
            <button class="postit-button btn-sm btn-table ${getSupplierNote(supplier.id) ? "has-note" : ""}" data-note-supplier="${supplier.id}">Notas</button>
            <button class="btn btn-danger btn-sm btn-table" data-delete-supplier="${supplier.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="8">Sem fornecedores cadastrados.</td></tr>`;

  document.querySelectorAll("[data-edit-supplier]").forEach((button) => {
    button.addEventListener("click", () => editSupplier(button.dataset.editSupplier));
  });
  document.querySelectorAll("[data-note-supplier]").forEach((button) => {
    button.addEventListener("click", () => openSupplierNotes(button.dataset.noteSupplier));
  });
  document.querySelectorAll("[data-delete-supplier]").forEach((button) => {
    button.addEventListener("click", () => deleteSupplier(button.dataset.deleteSupplier));
  });
}

function buyerPhotoCell(buyer) {
  if (buyer.foto_path) {
    return `<img class="avatar avatar-sm" src="${buyer.foto_path}" alt="${buyer.nome_comprador}">`;
  }
  return `<div class="avatar avatar-sm avatar-placeholder">${buyerInitials(buyer.nome_comprador)}</div>`;
}

function renderBuyers() {
  document.getElementById("compradoresTable").innerHTML = state.buyers.length
    ? state.buyers.map((buyer) => `
      <tr>
        <td>${buyerPhotoCell(buyer)}</td>
        <td>${buyer.nome_comprador}</td>
        <td>${buyer.telefone ?? "-"}</td>
        <td>${buyer.email ?? "-"}</td>
        <td class="td-actions">
          <div class="actions">
            <button class="btn btn-outline btn-sm" data-edit-buyer="${buyer.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-delete-buyer="${buyer.id}">Excluir</button>
            ${buyer.email ? `<button class="btn btn-outline btn-sm" data-invite-buyer="${buyer.id}" title="Enviar convite de acesso">✉️ Convite</button>` : ""}
          </div>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="5">Sem compradores cadastrados.</td></tr>`;

  document.querySelectorAll("[data-edit-buyer]").forEach((button) => {
    button.addEventListener("click", () => editBuyer(button.dataset.editBuyer));
  });
  document.querySelectorAll("[data-delete-buyer]").forEach((button) => {
    button.addEventListener("click", () => deleteBuyer(button.dataset.deleteBuyer));
  });
  document.querySelectorAll("[data-invite-buyer]").forEach((button) => {
    button.addEventListener("click", () => enviarConviteComprador(button.dataset.inviteBuyer, button));
  });
}

async function enviarConviteComprador(buyerId, btn) {
  const original = btn.textContent;
  btn.textContent = "Enviando...";
  btn.disabled = true;
  try {
    await fetchApi(`/api/v1/portal/compradores/${buyerId}/enviar-convite`, { method: "POST" });
    setFeedback("Convite enviado com sucesso.", "success", true);
  } catch (err) {
    setFeedback(`Erro ao enviar convite: ${err.message}`, "error");
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

function nextCalendarDate(baseDate, selectedDays, includeBase) {
  const allowedDays = new Set(selectedDays.map((day) => DIAS_PYTHON[day]));
  const current = new Date(`${baseDate}T12:00:00`);

  if (!includeBase) {
    current.setDate(current.getDate() + 1);
  }

  while (!allowedDays.has((current.getDay() + 6) % 7)) {
    current.setDate(current.getDate() + 1);
  }

  return current.toISOString().slice(0, 10);
}

function calculateSuggestedDate(baseDate, frequency, selectedDays) {
  if (!baseDate || !frequency || !selectedDays.length) return "";
  const ordered = orderedDays(selectedDays);
  if (INTERVALO_DIAS_FREQUENCIA[frequency]) {
    return nextCalendarDate(addDaysIso(baseDate, INTERVALO_DIAS_FREQUENCIA[frequency]), ordered, true);
  }
  return nextCalendarDate(baseDate, ordered, false);
}

function calculateInitialPendingDate(baseDate, frequency, selectedDays) {
  if (!baseDate || !frequency) return todayIso();
  const ordered = orderedDays(
    selectedDays?.length ? selectedDays : (DEFAULT_DAYS_BY_FREQUENCY[frequency] ?? ["SEGUNDA"])
  );
  let pendingDate = baseDate;

  if (pendingDate >= todayIso()) {
    const weekday = parseIsoToWeekdayName(pendingDate);
    return ordered.includes(weekday) ? pendingDate : nextCalendarDate(pendingDate, ordered, true);
  }

  while (pendingDate < todayIso()) {
    pendingDate = calculateSuggestedDate(pendingDate, frequency, ordered);
  }

  return pendingDate;
}

function categoriaAgendaComprasId() {
  return state.categorias.find((c) => c.nome === "Agenda de Compras")?.id ?? null;
}

async function ensurePendingOccurrenceForSupplier(supplier) {
  if (!supplier?.id) return { created: false, date: null };

  const tenantId = supplier.tenant_id ?? getSettings().tenantId;
  const categoriaId = categoriaAgendaComprasId();

  const existing = await fetchSupabase(
    `/rest/v1/agenda_ocorrencias?select=id,data_prevista,comprador_id,categoria_id&tenant_id=eq.${tenantId}&fornecedor_id=eq.${supplier.id}&status=eq.PENDENTE&order=data_prevista.asc&limit=1`
  );

  const nextDate = calculateInitialPendingDate(
    supplier.data_primeiro_pedido,
    Number(supplier.frequencia_revisao),
    supplier.dias_compra
  );

  if (existing?.length) {
    const current = existing[0];
    const needsSync = current.data_prevista !== nextDate
      || (current.comprador_id ?? null) !== (supplier.comprador_id ?? null)
      || (categoriaId && !current.categoria_id);

    if (needsSync) {
      const patch = {
        data_prevista: nextDate,
        comprador_id: supplier.comprador_id ?? null,
      };
      if (categoriaId && !current.categoria_id) patch.categoria_id = categoriaId;
      if (supplier.hora_inicio) patch.hora_inicio = supplier.hora_inicio;
      if (supplier.hora_fim) patch.hora_fim = supplier.hora_fim;
      await fetchSupabase(`/rest/v1/agenda_ocorrencias?id=eq.${current.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: patch,
      });
      return { created: false, synced: true, date: nextDate };
    }

    return { created: false, synced: false, date: current.data_prevista };
  }

  await fetchSupabase("/rest/v1/agenda_ocorrencias", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: {
      tenant_id: tenantId,
      fornecedor_id: supplier.id,
      comprador_id: supplier.comprador_id ?? null,
      data_prevista: nextDate,
      status: "PENDENTE",
      categoria_id: categoriaId,
      hora_inicio: supplier.hora_inicio ?? null,
      hora_fim: supplier.hora_fim ?? null,
    },
  });

  return { created: true, synced: false, date: nextDate };
}

async function backfillMissingPendingOccurrences(suppliers, agendaRows) {
  const pendingBySupplier = new Set((agendaRows ?? []).map((row) => row.fornecedor_id));
  const missingCategoria = new Set(
    (agendaRows ?? []).filter((row) => row.fornecedor_id && !row.categoria_id).map((row) => row.fornecedor_id)
  );
  let createdCount = 0;

  for (const supplier of suppliers) {
    if (pendingBySupplier.has(supplier.id) && !missingCategoria.has(supplier.id)) continue;
    const result = await ensurePendingOccurrenceForSupplier(supplier);
    if (result.created) {
      createdCount += 1;
      pendingBySupplier.add(supplier.id);
    }
  }

  return createdCount;
}

function selectedSupplierDays() {
  return Array.from(document.querySelectorAll('input[name="dias_semana"]:checked')).map((input) => input.value);
}

function renderSupplierDayCheckboxes(selected = []) {
  supplierDaysContainer.innerHTML = DIAS_SEMANA.map((day) => `
    <label><input type="checkbox" name="dias_semana" value="${day}" ${selected.includes(day) ? "checked" : ""}> ${day}</label>
  `).join("");
  supplierDaysContainer.querySelectorAll('input[name="dias_semana"]').forEach((input) => {
    input.addEventListener("change", refreshSupplierSuggestion);
  });
}

function resetSupplierForm() {
  document.getElementById("fornecedorForm").reset();
  document.getElementById("fornecedorId").value = "";
  document.getElementById("fornecedorNotasDraft").value = "";
  document.getElementById("fornecedorFormMode").textContent = "Novo fornecedor";
  fornecedorCompradorSelect.value = "";
  renderSupplierDayCheckboxes([]);
  refreshSupplierSuggestion();
  updateSupplierNotesButton();
  clearFeedback();
  clearImportPreview();
}

function resetBuyerForm() {
  document.getElementById("compradorForm").reset();
  document.getElementById("compradorId").value = "";
  document.getElementById("compradorFotoAtual").value = "";
  document.getElementById("compradorSenha").value = "";
  document.getElementById("compradorFormMode").textContent = "Novo comprador";
  updateBuyerPreview();
  clearFeedback();
}

function editSupplier(supplierId) {
  const supplier = supplierById(supplierId);
  if (!supplier) return;
  showSection("fornecedores");
  document.getElementById("fornecedorId").value = supplier.id;
  document.getElementById("fornecedorNotasDraft").value = getSupplierNote(supplier.id);
  document.getElementById("fornecedorCodigo").value = supplier.codigo_fornecedor;
  document.getElementById("fornecedorNome").value = supplier.nome_fornecedor;
  document.getElementById("fornecedorFrequencia").value = String(supplier.frequencia_revisao);
  document.getElementById("fornecedorDataPrimeiroPedido").value = isoToBr(supplier.data_primeiro_pedido);
  document.getElementById("fornecedorParametroEstoque").value = String(supplier.parametro_estoque);
  document.getElementById("fornecedorLeadTime").value = String(supplier.lead_time_entrega);
  fornecedorCompradorSelect.value = supplier.comprador_id ?? "";
  document.getElementById("fornecedorHoraInicio").value = supplier.hora_inicio ?? "";
  document.getElementById("fornecedorHoraFim").value = supplier.hora_fim ?? "";
  document.getElementById("fornecedorFormMode").textContent = `Editando ${supplier.nome_fornecedor}`;
  renderSupplierDayCheckboxes(supplier.dias_compra);
  refreshSupplierSuggestion();
  updateSupplierNotesButton();
}

function editBuyer(buyerId) {
  const buyer = buyerById(buyerId);
  if (!buyer) return;
  showSection("compradores");
  document.getElementById("compradorId").value = buyer.id;
  document.getElementById("compradorFotoAtual").value = buyer.foto_path ?? "";
  document.getElementById("compradorNome").value = buyer.nome_comprador;
  document.getElementById("compradorTelefone").value = buyer.telefone ?? "";
  document.getElementById("compradorEmail").value = buyer.email ?? "";
  document.getElementById("compradorSenha").value = "";
  document.getElementById("compradorFormMode").textContent = `Editando ${buyer.nome_comprador}`;
  updateBuyerPreview();
}

function updateSupplierNotesButton() {
  const button = document.getElementById("openFornecedorNotasButton");
  const note = document.getElementById("fornecedorNotasDraft").value.trim();
  if (!button) return;
  button.classList.toggle("has-note", Boolean(note));
  button.textContent = note ? "Notas salvas" : "Notas";
}

function openSupplierNotes(supplierId = "") {
  const selectedOccurrence = occurrenceRows().find((item) => item.id === state.selectedOccurrenceId);
  const resolvedSupplierId = String(
    supplierId ||
    selectedOccurrence?.supplier?.id ||
    document.getElementById("fornecedorId").value ||
    ""
  ).trim();
  document.getElementById("supplierNotesSupplierId").value = resolvedSupplierId;

  if (resolvedSupplierId) {
    const supplier = supplierById(resolvedSupplierId);
    if (!supplier) return;
    document.getElementById("fornecedorId").value = supplier.id;
    document.getElementById("fornecedorNotasDraft").value = supplier.notas_relacionamento ?? getSupplierNote(supplier.id);
    updateSupplierNotesButton();
  }

  const noteInput = document.getElementById("supplierNotesInput");
  noteInput.value = document.getElementById("fornecedorNotasDraft").value || "";
  document.getElementById("supplierNotesModal").showModal();
}

async function saveSupplierNotesDraft() {
  const supplierId = (
    document.getElementById("supplierNotesSupplierId").value.trim() ||
    document.getElementById("fornecedorId").value.trim()
  );
  const noteText = document.getElementById("supplierNotesInput").value.trim();
  document.getElementById("fornecedorNotasDraft").value = noteText;

  try {
    if (supplierId) {
      await persistSupplierNote(supplierId, noteText);
      setFeedback("Notas do fornecedor salvas com sucesso.", "success");
      await loadPortalData({ silent: true, preserveFeedback: true });
      const selectedRow = occurrenceRows().find((item) => item.id === state.selectedOccurrenceId);
      if (selectedRow?.supplier?.id === supplierId) {
        refreshAgendaSupplierNotesState(supplierId);
      }
    } else {
      setFeedback("Notas registradas como rascunho. Salve o fornecedor para persistir no Supabase.", "info");
    }
    updateSupplierNotesButton();
    closeModal("supplierNotesModal");
  } catch (error) {
    setFeedback(`Não foi possível salvar as notas do fornecedor: ${error.message}`, "error");
  }
}

async function persistSupplierNote(supplierId, noteText) {
  if (!supplierId) return;
  try {
    await fetchSupabase(`/rest/v1/fornecedores?id=eq.${supplierId}&tenant_id=eq.${getSettings().tenantId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { notas_relacionamento: noteText?.trim() || null },
    });

    state.features.fornecedorNotasColuna = true;
    const supplier = state.suppliers.find((item) => item.id === supplierId);
    if (supplier) {
      supplier.notas_relacionamento = noteText?.trim() || "";
    }
    return;
  } catch {
    state.features.fornecedorNotasColuna = false;
  }

  if (!state.clientRecordId) return;

  const currentClientRows = await fetchSupabase(`/rest/v1/clientes?select=id,observacoes&id=eq.${state.clientRecordId}&limit=1`);
  const currentClient = currentClientRows?.[0] ?? null;
  const previousMeta = parseClientObservacoes(currentClient?.observacoes);
  const supplierNotes = { ...getSupplierNotesMap(previousMeta) };

  if (noteText?.trim()) {
    supplierNotes[supplierId] = noteText.trim();
  } else {
    delete supplierNotes[supplierId];
  }

  const updatedObservacoes = JSON.stringify({
    ...previousMeta,
    supplier_notes: supplierNotes,
  });

  await fetchSupabase(`/rest/v1/clientes?id=eq.${state.clientRecordId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: { observacoes: updatedObservacoes },
  });

  state.clientMeta = parseClientObservacoes(updatedObservacoes);
  const supplier = state.suppliers.find((item) => item.id === supplierId);
  if (supplier) {
    supplier.notas_relacionamento = noteText?.trim() || "";
  }
}

async function deleteSupplier(supplierId) {
  if (!window.confirm("Deseja realmente excluir este fornecedor?")) return;
  try {
    await fetchSupabase(`/rest/v1/fornecedor_dias_compra?fornecedor_id=eq.${supplierId}`, { method: "DELETE" });
    await fetchSupabase(`/rest/v1/fornecedores?id=eq.${supplierId}`, { method: "DELETE" });
    await persistSupplierNote(supplierId, "");
    setFeedback("Fornecedor excluido com sucesso.", "success");
    await loadPortalData({ silent: true });
  } catch (error) {
    setFeedback(`Erro ao excluir fornecedor: ${error.message}`, "error");
  }
}

async function deleteBuyer(buyerId) {
  if (buyerId === getSettings().activeBuyerId) {
    setFeedback("Nao e permitido excluir o comprador ativo. Selecione outro comprador primeiro.", "error");
    return;
  }
  if (!window.confirm("Deseja realmente excluir este comprador?")) return;
  try {
    await fetchSupabase(`/rest/v1/fornecedores?comprador_id=eq.${buyerId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { comprador_id: null },
    });
    await fetchSupabase(`/rest/v1/agenda_ocorrencias?comprador_id=eq.${buyerId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { comprador_id: null },
    });
    await fetchSupabase(`/rest/v1/compradores?id=eq.${buyerId}`, { method: "DELETE" });
    setFeedback("Comprador excluido com sucesso.", "success");
    await loadPortalData({ silent: true });
  } catch (error) {
    setFeedback(`Erro ao excluir comprador: ${error.message}`, "error");
  }
}

