const DIAS_SEMANA = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO", "DOMINGO"];
const DIAS_PYTHON = { SEGUNDA: 0, TERCA: 1, QUARTA: 2, QUINTA: 3, SEXTA: 4, SABADO: 5, DOMINGO: 6 };
const DIAS_LABEL = {
  SEGUNDA: "Segunda-feira",
  TERCA: "Terça-feira",
  QUARTA: "Quarta-feira",
  QUINTA: "Quinta-feira",
  SEXTA: "Sexta-feira",
  SABADO: "Sábado",
  DOMINGO: "Domingo",
};
const DIAS_POR_FREQUENCIA = { 1: 1, 2: 1, 4: 1, 8: 2, 12: 3 };
const INTERVALO_DIAS_FREQUENCIA = { 1: 28, 2: 14, 4: 7 };
const DEFAULT_DAYS_BY_FREQUENCY = {
  1: ["SEGUNDA"],
  2: ["SEGUNDA"],
  4: ["SEGUNDA"],
  8: ["SEGUNDA", "QUINTA"],
  12: ["SEGUNDA", "QUARTA", "SEXTA"],
};

DIAS_LABEL.TERCA = "Terça-feira";
DIAS_LABEL.SABADO = "Sábado";

const storageKeys = {
  supabaseUrl: "agenda_cliente_supabase_url",
  supabaseKey: "agenda_cliente_supabase_key",
  tenantId: "agenda_cliente_tenant_id",
  activeBuyerId: "agenda_cliente_active_buyer_id",
  loggedBuyerId: "agenda_cliente_logged_buyer_id",
  loggedPortalRole: "agenda_cliente_logged_portal_role",
  loggedPortalEmail: "agenda_cliente_logged_portal_email",
  logoUrl: "agenda_cliente_logo_url",
  theme: "agenda_ui_theme",
};

const defaultSettings = {
  supabaseUrl: "https://fnwsorhflueunqzkwsxu.supabase.co",
  supabaseKey: "sb_publishable_ZvbYTFdj6maOJiJACFR5Zw_9xJrBuUB",
  tenantId: "c2f65634-b7e0-47f0-8937-94446540701a",
  logoUrl: "assets/logo_alta.jpg",
};

const UNASSIGNED_BUYER_VALUE = "__sem_comprador__";

const mockBuyers = [
  { id: "cmp-001", nome_comprador: "Marina Araujo", telefone: "(11) 99999-0101", email: "marina@servicefarma.far.br", foto_path: "", senha_hash: "1234" },
  { id: "cmp-002", nome_comprador: "Eduardo Lima", telefone: "(11) 99999-0102", email: "eduardo@servicefarma.far.br", foto_path: "", senha_hash: "1234" },
];

const mockSuppliers = [
  {
    id: "for-001",
    codigo_fornecedor: "10023",
    nome_fornecedor: "Distribuidora Alfa",
    data_primeiro_pedido: "2026-03-12",
    frequencia_revisao: 8,
    parametro_estoque: 7,
    lead_time_entrega: 3,
    parametro_compra: 10,
    comprador_id: "cmp-001",
    comprador_nome: "Marina Araujo",
    dias_compra: ["SEGUNDA", "QUINTA"],
  },
  {
    id: "for-002",
    codigo_fornecedor: "20441",
    nome_fornecedor: "Farma Sul",
    data_primeiro_pedido: "2026-03-22",
    frequencia_revisao: 4,
    parametro_estoque: 5,
    lead_time_entrega: 2,
    parametro_compra: 7,
    comprador_id: "cmp-002",
    comprador_nome: "Eduardo Lima",
    dias_compra: ["SABADO"],
  },
  {
    id: "for-003",
    codigo_fornecedor: "77400",
    nome_fornecedor: "Nacional Hospitalar",
    data_primeiro_pedido: "2026-03-08",
    frequencia_revisao: 8,
    parametro_estoque: 4,
    lead_time_entrega: 3,
    parametro_compra: 7,
    comprador_id: null,
    comprador_nome: "Sem Comprador",
    dias_compra: ["TERCA", "SEXTA"],
  },
];

function addDaysIso(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const mockAgenda = [
  { id: "occ-001", fornecedor_id: "for-001", comprador_id: "cmp-001", data_prevista: new Date().toISOString().slice(0, 10), status: "PENDENTE" },
  { id: "occ-002", fornecedor_id: "for-002", comprador_id: "cmp-002", data_prevista: addDaysIso(new Date().toISOString().slice(0, 10), 2), status: "PENDENTE" },
  { id: "occ-003", fornecedor_id: "for-003", comprador_id: null, data_prevista: addDaysIso(new Date().toISOString().slice(0, 10), -3), status: "PENDENTE" },
];

const state = {
  currentSection: "agenda-dia",
  selectedOccurrenceId: null,
  tenantName: "Service Farma",
  clientRecordId: null,
  clientMeta: {},
  features: {
    fornecedorNotasColuna: false,
  },
  auditFilter: {
    preset: "30dias",
    startDate: "",
    endDate: "",
  },
  buyers: structuredClone(mockBuyers),
  suppliers: structuredClone(mockSuppliers),
  agenda: [],
  auditOccurrences: [],
};

const feedbackBox = document.getElementById("feedbackBox");
const agendaDetailFeedback = document.getElementById("agendaDetailFeedback");
const importPreviewBox = document.getElementById("importPreviewBox");
const activeBuyerSelect = document.getElementById("activeBuyerSelect");
const buyerAvatar = document.getElementById("buyerAvatar");
const topBuyerAvatar = document.getElementById("topBuyerAvatar");
const buyerNameLabel = document.getElementById("buyerNameLabel");
const topBuyerName = document.getElementById("topBuyerName");
const tenantNameLabel = document.getElementById("tenantNameLabel");
const supplierDaysContainer = document.getElementById("diasSemanaFornecedor");
const fornecedorCompradorSelect = document.getElementById("fornecedorComprador");
const sugestaoProximaData = document.getElementById("sugestaoProximaData");

function getSettings() {
  return {
    supabaseUrl: localStorage.getItem(storageKeys.supabaseUrl) ?? defaultSettings.supabaseUrl,
    supabaseKey: localStorage.getItem(storageKeys.supabaseKey) ?? defaultSettings.supabaseKey,
    tenantId: localStorage.getItem(storageKeys.tenantId) ?? defaultSettings.tenantId,
    activeBuyerId: localStorage.getItem(storageKeys.activeBuyerId) ?? "",
    loggedBuyerId: localStorage.getItem(storageKeys.loggedBuyerId) ?? "",
    logoUrl: localStorage.getItem(storageKeys.logoUrl) ?? defaultSettings.logoUrl,
    theme: localStorage.getItem(storageKeys.theme) ?? "dark",
  };
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

function openBuyerLoginModal() {
  clearFeedback(document.getElementById("buyerLoginFeedback"));
  document.getElementById("buyerLoginEmail").value = "";
  document.getElementById("buyerLoginPassword").value = "";
  document.getElementById("buyerLoginModal").showModal();
}

function ensureBuyerLoginSession() {
  const sessionBuyer = loggedBuyer();
  if (sessionBuyer) {
    return true;
  }
  if (state.buyers.length) {
    openBuyerLoginModal();
    return false;
  }
  return true;
}

function loginBuyer() {
  const email = document.getElementById("buyerLoginEmail").value.trim().toLowerCase();
  const password = document.getElementById("buyerLoginPassword").value.trim();
  const feedbackTarget = document.getElementById("buyerLoginFeedback");

  if (!email || !password) {
    setFeedback("Informe e-mail e senha do comprador.", "error", feedbackTarget);
    return;
  }

  const buyer = state.buyers.find((item) => (item.email ?? "").toLowerCase() === email);
  if (!buyer) {
    setFeedback("Comprador não localizado para este cliente.", "error", feedbackTarget);
    return;
  }

  if ((buyer.senha_hash ?? "") !== password) {
    setFeedback("Senha inválida.", "error", feedbackTarget);
    return;
  }

  localStorage.setItem(storageKeys.loggedBuyerId, buyer.id);
  if (!getSettings().activeBuyerId) {
    localStorage.setItem(storageKeys.activeBuyerId, buyer.id);
  }
  closeModal("buyerLoginModal");
  updateBuyerCard();
  renderTables();
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

function renderKpis() {
  const rows = filteredRows("proximas-agendas");
  const data = [
    ["Hoje", filteredRows("agenda-dia").length],
    ["Próximas", rows.filter((row) => row.data_prevista > todayIso()).length],
    ["Atrasadas", filteredRows("atrasadas").length],
    ["Sem comprador", state.suppliers.filter((supplier) => !supplier.comprador_id).length],
  ];

  document.getElementById("agendaDiaStats").innerHTML = data.map(([label, value]) => `
    <div class="kpi-card">
      <span class="muted">${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
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

function renderAgendaTables() {
  const sections = [
    ["agendaDiaTable", "agenda-dia", "Sem agendas pendentes para hoje.", 6],
    ["proximasAgendasTable", "proximas-agendas", "Sem proximas agendas.", 6],
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
    : `<tr><td colspan="5">Todos os fornecedores estao vinculados.</td></tr>`;

  document.querySelectorAll("[data-edit-supplier]").forEach((button) => {
    button.addEventListener("click", () => editSupplier(button.dataset.editSupplier));
  });
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

async function ensurePendingOccurrenceForSupplier(supplier) {
  if (!supplier?.id) return { created: false, date: null };

  const tenantId = supplier.tenant_id ?? getSettings().tenantId;
  const existing = await fetchSupabase(
    `/rest/v1/agenda_ocorrencias?select=id,data_prevista,comprador_id&tenant_id=eq.${tenantId}&fornecedor_id=eq.${supplier.id}&status=eq.PENDENTE&order=data_prevista.asc&limit=1`
  );

  const nextDate = calculateInitialPendingDate(
    supplier.data_primeiro_pedido,
    Number(supplier.frequencia_revisao),
    supplier.dias_compra
  );

  if (existing?.length) {
    const current = existing[0];
    const needsSync = current.data_prevista !== nextDate || (current.comprador_id ?? null) !== (supplier.comprador_id ?? null);

    if (needsSync) {
      await fetchSupabase(`/rest/v1/agenda_ocorrencias?id=eq.${current.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: {
          data_prevista: nextDate,
          comprador_id: supplier.comprador_id ?? null,
        },
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
    },
  });

  return { created: true, synced: false, date: nextDate };
}

async function backfillMissingPendingOccurrences(suppliers, agendaRows) {
  const pendingBySupplier = new Set((agendaRows ?? []).map((row) => row.fornecedor_id));
  let createdCount = 0;

  for (const supplier of suppliers) {
    if (pendingBySupplier.has(supplier.id)) continue;
    const result = await ensurePendingOccurrenceForSupplier(supplier);
    if (result.created) {
      createdCount += 1;
      pendingBySupplier.add(supplier.id);
    }
  }

  return createdCount;
}

async function synchronizePendingAgendaSeeds() {
  setFeedback("Sincronizando agenda dos fornecedores com a base operacional...", "info");
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

function selectedSupplierDays() {
  return Array.from(document.querySelectorAll('input[name="dias_semana"]:checked')).map((input) => input.value);
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

function renderTables() {
  renderBuyerSelect();
  renderKpis();
  renderAgendaTables();
  renderSemComprador();
  renderSuppliers();
  renderBuyers();
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
      title: "Pressao de estoque",
      text: "Os aumentos de parâmetro superaram as reduções. Vale revisar fornecedores com recorrência de ajuste para elevar o parâmetro base ou o lead time esperado.",
    });
  } else if (metrics.reducoes > metrics.aumentos) {
    recommendations.push({
      title: "Espaco para enxugar estoque",
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
      title: "Operacao estavel",
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

  const entries = state.auditOccurrences
    .map(classifyAuditEvent)
    .filter((entry) => entry.status !== "PENDENTE" || entry.meta)
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
      text: "A visao abaixo agrupa o historico por comprador e permite expandir o detalhamento dos eventos registrados.",
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
    if (!grouped.has(entry.buyerId)) {
      grouped.set(entry.buyerId, []);
    }
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
                      Parametro: ${Number(entry.meta?.incremento_parametro_dias ?? 0)} dia(s)<br>
                      Proxima data: ${Number(entry.meta?.ajuste_proxima_data_dias ?? 0)} dia(s)
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

function showSection(sectionId) {
  state.currentSection = sectionId;
  clearFeedback();
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === sectionId);
  });
  document.querySelectorAll(".section-view").forEach((section) => {
    section.classList.toggle("hidden", section.id !== sectionId);
  });
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
  };
}

async function fetchPersistedSuppliersByCodes(codes) {
  const normalizedCodes = [...new Set(
    (codes ?? []).map((code) => String(code ?? "").trim().toUpperCase()).filter(Boolean)
  )];

  if (!normalizedCodes.length) return [];

  const rows = await fetchSupabase(
    `/rest/v1/fornecedores?select=id,codigo_fornecedor,nome_fornecedor,data_primeiro_pedido,frequencia_revisao,parametro_estoque,lead_time_entrega,parametro_compra,comprador_id,compradores(nome_comprador),fornecedor_dias_compra(dia_semana)&tenant_id=eq.${getSettings().tenantId}&codigo_fornecedor=in.(${buildPostgrestInFilter(normalizedCodes)})&order=nome_fornecedor.asc`
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

async function loadPortalData({ silent = false, preserveFeedback = false } = {}) {
  if (!silent) {
    setFeedback("Sincronizando portal do cliente com o Supabase...", "info");
  }
  const settings = getSettings();
  try {
    await detectSupplierNotesColumn();
    const [tenantRows, clientRows, buyersRows, supplierRowsRaw, agendaRowsRaw, auditRows] = await Promise.all([
      fetchSupabase(`/rest/v1/tenants?select=id,nome&id=eq.${settings.tenantId}&limit=1`),
      fetchSupabase(`/rest/v1/clientes?select=id,nome_fantasia,razao_social,email_responsavel,observacoes&tenant_id=eq.${settings.tenantId}&limit=1`),
      fetchSupabase(`/rest/v1/compradores?select=id,nome_comprador,telefone,email,foto_path,senha_hash&tenant_id=eq.${settings.tenantId}&order=nome_comprador.asc`),
      fetchSupabase(`/rest/v1/fornecedores?select=id,codigo_fornecedor,nome_fornecedor,data_primeiro_pedido,frequencia_revisao,parametro_estoque,lead_time_entrega,parametro_compra,comprador_id,compradores(nome_comprador),fornecedor_dias_compra(dia_semana)&tenant_id=eq.${settings.tenantId}&order=nome_fornecedor.asc`),
      fetchSupabase(`/rest/v1/agenda_ocorrencias?select=id,fornecedor_id,comprador_id,data_prevista,status&tenant_id=eq.${settings.tenantId}&status=eq.PENDENTE&order=data_prevista.asc`),
      fetchSupabase(`/rest/v1/agenda_ocorrencias?select=id,fornecedor_id,comprador_id,data_prevista,status,observacao,data_realizacao,created_at,updated_at&tenant_id=eq.${settings.tenantId}&order=updated_at.desc`),
    ]);

    const supplierRows = supplierRowsRaw.map(mapSupplier);
    let agendaRows = agendaRowsRaw;
    const createdSeeds = await backfillMissingPendingOccurrences(supplierRows, agendaRowsRaw);
    if (createdSeeds > 0) {
      agendaRows = await fetchSupabase(`/rest/v1/agenda_ocorrencias?select=id,fornecedor_id,comprador_id,data_prevista,status&tenant_id=eq.${settings.tenantId}&status=eq.PENDENTE&order=data_prevista.asc`);
      if (!silent && !preserveFeedback) {
        setFeedback(`Portal do cliente carregado com sucesso. ${createdSeeds} agenda(s) pendente(s) foram geradas automaticamente.`, "success");
      }
    }

    const clientRow = clientRows[0] ?? null;
    const clientMeta = parseClientObservacoes(clientRow?.observacoes);
    state.clientRecordId = clientRow?.id ?? null;
    state.clientAdminEmail = clientRow?.email_responsavel ?? "";
    state.tenantName = clientRow?.nome_fantasia ?? tenantRows[0]?.nome ?? "Service Farma";
    state.clientMeta = clientMeta;
    if (state.clientAdminEmail) {
      state.clientMeta.admin_email = state.clientAdminEmail;
    }
    if (!state.clientMeta.audit_password && settings.tenantId === "c2f65634-b7e0-47f0-8937-94446540701a") {
      state.clientMeta.audit_password = "service";
    }

    if (state.features.fornecedorNotasColuna) {
      const supplierNotesRows = await fetchSupplierNotesRows();
      const notesMap = new Map((supplierNotesRows ?? []).map((row) => [row.id, row.notas_relacionamento ?? ""]));
      supplierRows.forEach((supplier) => {
        if (notesMap.has(supplier.id)) {
          supplier.notas_relacionamento = notesMap.get(supplier.id) ?? "";
        }
      });
    } else {
      const notesMap = getSupplierNotesMap(clientMeta);
      supplierRows.forEach((supplier) => {
        supplier.notas_relacionamento = notesMap[supplier.id] ?? supplier.notas_relacionamento ?? "";
      });
    }

    state.buyers = buyersRows;
    state.suppliers = supplierRows;
    state.agenda = agendaRows;
    state.auditOccurrences = auditRows;

    if (clientMeta.logo_url) {
      localStorage.setItem(storageKeys.logoUrl, clientMeta.logo_url);
    }

    if (tenantNameLabel) {
      tenantNameLabel.textContent = state.tenantName;
    }
    applyLogo();

    renderTables();
    if (!silent && createdSeeds === 0) {
      setFeedback("Portal do cliente carregado com sucesso.", "success");
    } else if (!preserveFeedback) {
      clearFeedback();
    }
  } catch (error) {
    state.tenantName = "Service Farma";
    state.clientRecordId = null;
    state.clientMeta = {};
    state.buyers = structuredClone(mockBuyers);
    state.suppliers = structuredClone(mockSuppliers);
    state.agenda = structuredClone(mockAgenda);
    state.auditOccurrences = structuredClone(mockAgenda).map((item) => ({
      ...item,
      observacao: JSON.stringify({ type: "agenda_treatment", note: "Historico local de apoio." }),
      data_realizacao: item.status === "REALIZADA" ? todayIso() : null,
      created_at: `${todayIso()}T00:00:00`,
      updated_at: `${todayIso()}T00:00:00`,
    }));
    if (tenantNameLabel) {
      tenantNameLabel.textContent = state.tenantName;
    }
    applyLogo();
    renderTables();
    if (!preserveFeedback) {
      setFeedback(`Não foi possível carregar a base real. Exibindo dados locais de apoio: ${error.message}`, "warning");
    }
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

async function fileToDataUrl(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.readAsDataURL(file);
  });
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

  if (!textInput || !nativeInput || !button || textInput.dataset.datePickerBound === "1") {
    return;
  }

  textInput.dataset.datePickerBound = "1";
  syncNativeDateProxy(textInput, nativeInput);

  textInput.addEventListener("change", () => {
    syncNativeDateProxy(textInput, nativeInput);
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    syncNativeDateProxy(textInput, nativeInput);
    nativeInput.focus();
    nativeInput.click();
    if (typeof nativeInput.showPicker === "function") {
      nativeInput.showPicker();
    }
  });

  nativeInput.addEventListener("change", () => {
    textInput.value = nativeInput.value ? isoToBr(nativeInput.value) : "";
    textInput.dispatchEvent(new Event("change", { bubbles: true }));
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

  if (rawPassword) {
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

function parseSuppliersCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("O CSV precisa ter cabecalho e pelo menos uma linha.");
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
    throw new Error("CSV invalido. Use colunas: Codigo e Nome.");
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
      throw new Error(`Linha ${rowIndex + 2}: codigo ou nome ausente.`);
    }

    let safeEstoque = Number.isNaN(parametroEstoque) ? frequencia : parametroEstoque;
    if (safeEstoque < frequencia) {
      safeEstoque = frequencia;
    }
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
  });
}

function validateSuppliersCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("O CSV precisa ter cabecalho e pelo menos uma linha.");
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter);
  const codigoIndex = resolveColumnIndex(headers, ["codigo", "codigo fornecedor", "cod fornecedor", "cod"]);
  const nomeIndex = resolveColumnIndex(headers, ["fabricante", "nome fornecedor", "fornecedor", "nome"]);

  if ([codigoIndex, nomeIndex].some((index) => index < 0)) {
    throw new Error("CSV invalido. Use pelo menos as colunas Codigo e Nome.");
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
      issues.push(`Linha ${rowIndex + 2}: codigo ou nome ausente.`);
    }
  });

  try {
    const mappedRows = parseSuppliersCsv(text);
    mappedRows.forEach((row) => {
      if (row._import_warning) notices.push(row._import_warning);
    });
  } catch {
    // a validacao principal acima ja cobre os erros impeditivos
  }

  return {
    totalRows: lines.length - 1,
    validRows,
    issues,
    notices,
  };
}

function downloadSupplierCsvTemplate() {
  const content = [
    "Codigo;Nome;Data Pedido;Frequencia;Dias;Parametro Estoque;Lead Time;Comprador",
    "F001;Fornecedor Exemplo A;25/02/2026;4;TERCA;30;5;Andre Vanni",
    "F002;Fornecedor Exemplo B;;;;;;",
  ].join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "modelo_fornecedores.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function importSuppliersFromFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const preview = validateSuppliersCsv(text);
    renderImportPreview(
      preview.issues.length || preview.notices.length
        ? `Arquivo analisado: ${preview.validRows} linha(s) valida(s) de ${preview.totalRows}. ${preview.issues.length ? `Avisos: ${preview.issues.slice(0, 3).join(" | ")}.` : ""} ${preview.notices.length ? `Ajustes automaticos: ${preview.notices.slice(0, 3).join(" | ")}.` : ""}`.trim()
        : `Arquivo analisado: ${preview.validRows} linha(s) valida(s) de ${preview.totalRows}. Nenhum problema encontrado.`,
      preview.issues.length || preview.notices.length ? "warning" : "info"
    );

    if (!preview.validRows) {
      setFeedback("Nenhuma linha válida encontrada para importação.", "error");
      return;
    }

    const confirmImport = window.confirm(
      preview.issues.length
        ? `Foram encontradas ${preview.validRows} linha(s) válidas e ${preview.issues.length} com problema. Deseja importar apenas as linhas válidas?`
        : preview.notices.length
          ? `Foram encontradas ${preview.validRows} linha(s) válidas com alguns ajustes automáticos. Deseja continuar com a importação?`
          : `Foram encontradas ${preview.validRows} linha(s) válidas. Deseja continuar com a importação?`
    );

    if (!confirmImport) {
      setFeedback("Importação cancelada após a pré-validação.", "warning");
      return;
    }

    const suppliers = parseSuppliersCsv(text);
    const existingCodes = new Set(
      state.suppliers.map((item) => String(item.codigo_fornecedor ?? "").trim().toUpperCase()).filter(Boolean)
    );
    const createdCount = suppliers.filter((supplier) => !existingCodes.has(supplier.codigo_fornecedor)).length;
    const updatedCount = suppliers.length - createdCount;
    let agendaCount = 0;
    const touchedCodes = [];
    const normalizedSuppliers = suppliers.map((supplier) => {
      const {
        _dias_compra: diasCompraRaw,
        _row_number: _rowNumber,
        _import_warning: _ignoredWarning,
        ...supplierPayload
      } = supplier;
      return {
        supplierPayload,
        diasCompra: diasCompraRaw ?? ["SEGUNDA"],
      };
    });

    const upsertedRows = await fetchSupabase("/rest/v1/fornecedores?on_conflict=tenant_id,codigo_fornecedor", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: normalizedSuppliers.map((item) => item.supplierPayload),
    });

    const upsertedByCode = new Map(
      (upsertedRows ?? []).map((row) => [String(row.codigo_fornecedor ?? "").trim().toUpperCase(), row.id])
    );

    const unresolvedCodes = normalizedSuppliers
      .map((item) => item.supplierPayload.codigo_fornecedor)
      .filter((codigo) => !upsertedByCode.has(codigo));

    if (unresolvedCodes.length) {
      const fetchedRows = await fetchSupabase(
        `/rest/v1/fornecedores?select=id,codigo_fornecedor&tenant_id=eq.${getSettings().tenantId}&codigo_fornecedor=in.(${buildPostgrestInFilter(unresolvedCodes)})`
      );
      (fetchedRows ?? []).forEach((row) => {
        upsertedByCode.set(String(row.codigo_fornecedor ?? "").trim().toUpperCase(), row.id);
      });
    }

    for (const item of normalizedSuppliers) {
      const supplierId = upsertedByCode.get(item.supplierPayload.codigo_fornecedor) ?? null;
      const diasCompra = item.diasCompra;

      if (!supplierId) {
        throw new Error(`Não foi possível localizar o fornecedor ${item.supplierPayload.codigo_fornecedor} após o upsert.`);
      }

      await fetchSupabase(`/rest/v1/fornecedor_dias_compra?fornecedor_id=eq.${supplierId}`, {
        method: "DELETE",
      });
      await fetchSupabase("/rest/v1/fornecedor_dias_compra", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: diasCompra.map((dia) => ({
          tenant_id: getSettings().tenantId,
          fornecedor_id: supplierId,
          dia_semana: dia,
        })),
      });
      const agendaSeed = await ensurePendingOccurrenceForSupplier({
        id: supplierId,
        tenant_id: getSettings().tenantId,
        data_primeiro_pedido: item.supplierPayload.data_primeiro_pedido,
        frequencia_revisao: item.supplierPayload.frequencia_revisao,
        dias_compra: diasCompra,
        comprador_id: item.supplierPayload.comprador_id,
      });
      if (agendaSeed.created) {
        agendaCount += 1;
      }
      touchedCodes.push(item.supplierPayload.codigo_fornecedor);
    }

    const refreshedImportedSuppliers = await fetchPersistedSuppliersByCodes(touchedCodes);
    const missingSeeds = await backfillMissingPendingOccurrences(refreshedImportedSuppliers, []);
    agendaCount += missingSeeds;

    const resumo = `Importação concluída. ${createdCount} fornecedor(es) criado(s), ${updatedCount} atualizado(s) e ${agendaCount} agenda(s) gerada(s). Códigos processados: ${touchedCodes.join(", ")}.`;
    renderImportPreview(resumo, "success");
    setFeedback(resumo, "success");
    await loadPortalData({ silent: true, preserveFeedback: true });
  } catch (error) {
    renderImportPreview(`Falha na análise/importação: ${error.message}`, "error");
    setFeedback(`Não foi possível importar fornecedores: ${error.message}`, "error");
  }
}

function bindStaticEvents() {
  if (document.body.dataset.portalEventsBound === "1") {
    return;
  }
  document.body.dataset.portalEventsBound = "1";

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem(storageKeys.theme, button.dataset.themeChoice);
      applyTheme(button.dataset.themeChoice);
    });
  });

  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.section));
  });

  activeBuyerSelect.addEventListener("change", () => {
    localStorage.setItem(storageKeys.activeBuyerId, activeBuyerSelect.value);
    renderTables();
  });

  document.getElementById("fornecedorFrequencia").addEventListener("change", refreshSupplierSuggestion);
  document.getElementById("fornecedorDataPrimeiroPedido").addEventListener("change", refreshSupplierSuggestion);
  fornecedorCompradorSelect.addEventListener("change", refreshSupplierSuggestion);
  setupDatePickerField("fornecedorDataPrimeiroPedido", "fornecedorDataPrimeiroPedidoNative", "fornecedorDataPrimeiroPedidoPickerButton");
  setupDatePickerField("proximaDataInput", "proximaDataInputNative", "proximaDataInputPickerButton");
  setupDatePickerField("auditStartDate", "auditStartDateNative", "auditStartDatePickerButton");
  setupDatePickerField("auditEndDate", "auditEndDateNative", "auditEndDatePickerButton");
  document.getElementById("fornecedorForm").addEventListener("submit", saveSupplier);
  document.getElementById("compradorForm").addEventListener("submit", saveBuyer);
  document.getElementById("resetFornecedorFormButton").addEventListener("click", resetSupplierForm);
  document.getElementById("resetCompradorFormButton").addEventListener("click", resetBuyerForm);
  document.getElementById("compradorNome").addEventListener("input", updateBuyerPreview);
  document.getElementById("compradorFotoArquivo").addEventListener("change", updateBuyerPreview);
  document.getElementById("logoArquivo").addEventListener("change", async () => {
    const logoFile = document.getElementById("logoArquivo").files[0];
    if (!logoFile) return;
    document.getElementById("logoPreview").src = await fileToDataUrl(logoFile);
  });

  document.getElementById("saveSettingsButton").addEventListener("click", saveSettings);
  document.getElementById("syncAllButton").addEventListener("click", async () => {
    closeModal("settingsModal");
    await loadPortalData();
  });
  const openSettings = () => {
    populateSettings();
    document.getElementById("settingsModal").showModal();
  };
  const sidebarSettingsButton = document.getElementById("openSettingsButton");
  if (sidebarSettingsButton) {
    sidebarSettingsButton.addEventListener("click", openSettings);
  }
  document.getElementById("openSettingsButtonTop").addEventListener("click", openSettings);
  document.getElementById("openAuditButtonTop").addEventListener("click", openAuditPasswordModal);
  document.getElementById("openAgendaSupplierNotesButton").addEventListener("click", () => {
    const row = occurrenceRows().find((item) => item.id === state.selectedOccurrenceId);
    if (!row?.supplier?.id) return;
    openSupplierNotes(row.supplier.id);
  });
  document.getElementById("buyerLoginButton").addEventListener("click", loginBuyer);
  document.getElementById("unlockAuditButton").addEventListener("click", unlockAuditView);
  document.getElementById("auditPeriodPreset").addEventListener("change", () => {
    syncAuditPeriodInputs();
    renderAuditDashboard();
  });
  document.getElementById("auditStartDate").addEventListener("change", () => {
    document.getElementById("auditPeriodPreset").value = "personalizado";
    syncAuditPeriodInputs();
    renderAuditDashboard();
  });
  document.getElementById("auditEndDate").addEventListener("change", () => {
    document.getElementById("auditPeriodPreset").value = "personalizado";
    syncAuditPeriodInputs();
    renderAuditDashboard();
  });
  document.getElementById("refreshAuditButton").addEventListener("click", async () => {
    await loadPortalData({ silent: true });
    renderAuditDashboard();
  });
  document.getElementById("downloadModeloCsvButton").addEventListener("click", downloadSupplierCsvTemplate);
  document.getElementById("openFornecedorNotasButton").addEventListener("click", () => openSupplierNotes());
  document.getElementById("saveSupplierNotesButton").addEventListener("click", saveSupplierNotesDraft);
  document.getElementById("importFornecedoresButton").addEventListener("click", () => {
    document.getElementById("importFornecedorFile").click();
  });
  document.getElementById("importFornecedorFile").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    await importSuppliersFromFile(file);
    event.target.value = "";
  });
  document.getElementById("openFirstTodayButton").addEventListener("click", () => {
    const first = filteredRows("agenda-dia")[0];
    if (!first) {
      setFeedback("Não há agendas do dia para abrir.", "warning");
      return;
    }
    openAgendaDetail(first.id);
  });

  document.getElementById("proximaDataInput").addEventListener("change", updateAgendaAdjustment);
  document.getElementById("tratarAgendaButton").addEventListener("click", tratarAgendaAtual);

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });
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
      throw new Error(`Linha ${rowIndex + 2}: código ou nome ausente.`);
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
  });
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

function renderKpis() {
  const rows = filteredRows("proximas-agendas");
  const data = [
    ["Hoje", filteredRows("agenda-dia").length],
    ["Próximas", rows.filter((row) => row.data_prevista > todayIso()).length],
    ["Atrasadas", filteredRows("atrasadas").length],
    ["Sem comprador", state.suppliers.filter((supplier) => !supplier.comprador_id).length],
  ];

  document.getElementById("agendaDiaStats").innerHTML = data.map(([label, value]) => `
    <div class="kpi-card">
      <span class="muted">${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
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

async function loadPortalData({ silent = false, preserveFeedback = false } = {}) {
  if (!silent) {
    setFeedback("Sincronizando o portal do cliente com o Supabase...", "info");
  }
  const settings = getSettings();
  try {
    await detectSupplierNotesColumn();
    const [tenantRows, clientRows, buyersRows, supplierRowsRaw, agendaRowsRaw, auditRows] = await Promise.all([
      fetchSupabase(`/rest/v1/tenants?select=id,nome&id=eq.${settings.tenantId}&limit=1`),
      fetchSupabase(`/rest/v1/clientes?select=id,nome_fantasia,razao_social,email_responsavel,observacoes&tenant_id=eq.${settings.tenantId}&limit=1`),
      fetchSupabase(`/rest/v1/compradores?select=id,nome_comprador,telefone,email,foto_path,senha_hash&tenant_id=eq.${settings.tenantId}&order=nome_comprador.asc`),
      fetchSupabase(`/rest/v1/fornecedores?select=id,codigo_fornecedor,nome_fornecedor,data_primeiro_pedido,frequencia_revisao,parametro_estoque,lead_time_entrega,parametro_compra,comprador_id,compradores(nome_comprador),fornecedor_dias_compra(dia_semana)&tenant_id=eq.${settings.tenantId}&order=nome_fornecedor.asc`),
      fetchSupabase(`/rest/v1/agenda_ocorrencias?select=id,fornecedor_id,comprador_id,data_prevista,status&tenant_id=eq.${settings.tenantId}&status=eq.PENDENTE&order=data_prevista.asc`),
      fetchSupabase(`/rest/v1/agenda_ocorrencias?select=id,fornecedor_id,comprador_id,data_prevista,status,observacao,data_realizacao,created_at,updated_at&tenant_id=eq.${settings.tenantId}&order=updated_at.desc`),
    ]);

    const supplierRows = supplierRowsRaw.map(mapSupplier);
    let agendaRows = agendaRowsRaw;
    const createdSeeds = await backfillMissingPendingOccurrences(supplierRows, agendaRowsRaw);
    if (createdSeeds > 0) {
      agendaRows = await fetchSupabase(`/rest/v1/agenda_ocorrencias?select=id,fornecedor_id,comprador_id,data_prevista,status&tenant_id=eq.${settings.tenantId}&status=eq.PENDENTE&order=data_prevista.asc`);
      if (!silent && !preserveFeedback) {
        setFeedback(`Portal do cliente carregado com sucesso. ${createdSeeds} agenda(s) pendente(s) foram geradas automaticamente.`, "success");
      }
    }

    const clientRow = clientRows[0] ?? null;
    const clientMeta = parseClientObservacoes(clientRow?.observacoes);
    state.clientRecordId = clientRow?.id ?? null;
    state.clientAdminEmail = clientRow?.email_responsavel ?? "";
    state.tenantName = clientRow?.nome_fantasia ?? tenantRows[0]?.nome ?? "Service Farma";
    state.clientMeta = clientMeta;
    if (state.clientAdminEmail) {
      state.clientMeta.admin_email = state.clientAdminEmail;
    }
    if (!state.clientMeta.audit_password && settings.tenantId === "c2f65634-b7e0-47f0-8937-94446540701a") {
      state.clientMeta.audit_password = "service";
    }

    if (state.features.fornecedorNotasColuna) {
      const supplierNotesRows = await fetchSupplierNotesRows();
      const notesMap = new Map((supplierNotesRows ?? []).map((row) => [row.id, row.notas_relacionamento ?? ""]));
      supplierRows.forEach((supplier) => {
        if (notesMap.has(supplier.id)) {
          supplier.notas_relacionamento = notesMap.get(supplier.id) ?? "";
        }
      });
    } else {
      const notesMap = getSupplierNotesMap(clientMeta);
      supplierRows.forEach((supplier) => {
        supplier.notas_relacionamento = notesMap[supplier.id] ?? supplier.notas_relacionamento ?? "";
      });
    }

    state.buyers = buyersRows;
    state.suppliers = supplierRows;
    state.agenda = agendaRows;
    state.auditOccurrences = auditRows;

    if (clientMeta.logo_url) {
      localStorage.setItem(storageKeys.logoUrl, clientMeta.logo_url);
    }

    if (tenantNameLabel) {
      tenantNameLabel.textContent = state.tenantName;
    }
    applyLogo();
    renderTables();

    if (!silent && createdSeeds === 0) {
      setFeedback("Portal do cliente carregado com sucesso.", "success");
    } else if (!preserveFeedback) {
      clearFeedback();
    }
  } catch (error) {
    state.tenantName = "Service Farma";
    state.clientRecordId = null;
    state.clientMeta = {};
    state.buyers = structuredClone(mockBuyers);
    state.suppliers = structuredClone(mockSuppliers);
    state.agenda = structuredClone(mockAgenda);
    state.auditOccurrences = structuredClone(mockAgenda).map((item) => ({
      ...item,
      observacao: JSON.stringify({ type: "agenda_treatment", note: "Histórico local de apoio." }),
      data_realizacao: item.status === "REALIZADA" ? todayIso() : null,
      created_at: `${todayIso()}T00:00:00`,
      updated_at: `${todayIso()}T00:00:00`,
    }));
    if (tenantNameLabel) {
      tenantNameLabel.textContent = state.tenantName;
    }
    applyLogo();
    renderTables();
    if (!preserveFeedback) {
      setFeedback(`Não foi possível carregar a base real. Exibindo dados locais de apoio: ${error.message}`, "warning");
    }
  }
}

async function fileToDataUrl(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.readAsDataURL(file);
  });
}

async function importSuppliersFromFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const preview = validateSuppliersCsv(text);
    renderImportPreview(
      preview.issues.length || preview.notices.length
        ? `Arquivo analisado: ${preview.validRows} linha(s) válida(s) de ${preview.totalRows}. ${preview.issues.length ? `Avisos: ${preview.issues.slice(0, 3).join(" | ")}.` : ""} ${preview.notices.length ? `Ajustes automáticos: ${preview.notices.slice(0, 3).join(" | ")}.` : ""}`.trim()
        : `Arquivo analisado: ${preview.validRows} linha(s) válida(s) de ${preview.totalRows}. Nenhum problema encontrado.`,
      preview.issues.length || preview.notices.length ? "warning" : "info"
    );

    if (!preview.validRows) {
      setFeedback("Nenhuma linha válida encontrada para importação.", "error");
      return;
    }

    const confirmImport = window.confirm(
      preview.issues.length
        ? `Foram encontradas ${preview.validRows} linha(s) válidas e ${preview.issues.length} com problema. Deseja importar apenas as linhas válidas?`
        : preview.notices.length
          ? `Foram encontradas ${preview.validRows} linha(s) válidas com alguns ajustes automáticos. Deseja continuar com a importação?`
          : `Foram encontradas ${preview.validRows} linha(s) válidas. Deseja continuar com a importação?`
    );

    if (!confirmImport) {
      setFeedback("Importação cancelada após a pré-validação.", "warning");
      return;
    }

    const suppliers = parseSuppliersCsv(text);
    const existingCodes = new Set(
      state.suppliers.map((item) => String(item.codigo_fornecedor ?? "").trim().toUpperCase()).filter(Boolean)
    );
    const createdCount = suppliers.filter((supplier) => !existingCodes.has(supplier.codigo_fornecedor)).length;
    const updatedCount = suppliers.length - createdCount;
    let agendaCount = 0;
    const touchedCodes = [];
    const normalizedSuppliers = suppliers.map((supplier) => {
      const { _dias_compra: diasCompraRaw, _row_number: _rowNumber, _import_warning: _ignoredWarning, ...supplierPayload } = supplier;
      return {
        supplierPayload,
        diasCompra: diasCompraRaw ?? ["SEGUNDA"],
      };
    });

    const upsertedRows = await fetchSupabase("/rest/v1/fornecedores?on_conflict=tenant_id,codigo_fornecedor", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: normalizedSuppliers.map((item) => item.supplierPayload),
    });

    const upsertedByCode = new Map(
      (upsertedRows ?? []).map((row) => [String(row.codigo_fornecedor ?? "").trim().toUpperCase(), row.id])
    );

    const unresolvedCodes = normalizedSuppliers
      .map((item) => item.supplierPayload.codigo_fornecedor)
      .filter((codigo) => !upsertedByCode.has(codigo));

    if (unresolvedCodes.length) {
      const fetchedRows = await fetchSupabase(
        `/rest/v1/fornecedores?select=id,codigo_fornecedor&tenant_id=eq.${getSettings().tenantId}&codigo_fornecedor=in.(${buildPostgrestInFilter(unresolvedCodes)})`
      );
      (fetchedRows ?? []).forEach((row) => {
        upsertedByCode.set(String(row.codigo_fornecedor ?? "").trim().toUpperCase(), row.id);
      });
    }

    for (const item of normalizedSuppliers) {
      const supplierId = upsertedByCode.get(item.supplierPayload.codigo_fornecedor) ?? null;
      const diasCompra = item.diasCompra;

      if (!supplierId) {
        throw new Error(`Não foi possível localizar o fornecedor ${item.supplierPayload.codigo_fornecedor} após o upsert.`);
      }

      await fetchSupabase(`/rest/v1/fornecedor_dias_compra?fornecedor_id=eq.${supplierId}`, { method: "DELETE" });
      await fetchSupabase("/rest/v1/fornecedor_dias_compra", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: diasCompra.map((dia) => ({
          tenant_id: getSettings().tenantId,
          fornecedor_id: supplierId,
          dia_semana: dia,
        })),
      });

      const agendaSeed = await ensurePendingOccurrenceForSupplier({
        id: supplierId,
        tenant_id: getSettings().tenantId,
        data_primeiro_pedido: item.supplierPayload.data_primeiro_pedido,
        frequencia_revisao: item.supplierPayload.frequencia_revisao,
        dias_compra: diasCompra,
        comprador_id: item.supplierPayload.comprador_id,
      });
      if (agendaSeed.created) agendaCount += 1;
      touchedCodes.push(item.supplierPayload.codigo_fornecedor);
    }

    const refreshedImportedSuppliers = await fetchPersistedSuppliersByCodes(touchedCodes);
    const missingSeeds = await backfillMissingPendingOccurrences(refreshedImportedSuppliers, []);
    agendaCount += missingSeeds;

    const resumo = `Importação concluída. ${createdCount} fornecedor(es) criado(s), ${updatedCount} atualizado(s) e ${agendaCount} agenda(s) gerada(s). Códigos processados: ${touchedCodes.join(", ")}.`;
    renderImportPreview(resumo, "success");
    setFeedback(resumo, "success");
    await loadPortalData({ silent: true, preserveFeedback: true });
  } catch (error) {
    renderImportPreview(`Falha na análise/importação: ${error.message}`, "error");
    setFeedback(`Não foi possível importar fornecedores: ${error.message}`, "error");
  }
}

function bindStaticEvents() {
  if (document.body.dataset.portalEventsBound === "1") {
    return;
  }
  document.body.dataset.portalEventsBound = "1";

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem(storageKeys.theme, button.dataset.themeChoice);
      applyTheme(button.dataset.themeChoice);
    });
  });

  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.section));
  });

  activeBuyerSelect.addEventListener("change", () => {
    localStorage.setItem(storageKeys.activeBuyerId, activeBuyerSelect.value);
    renderTables();
  });

  document.getElementById("fornecedorFrequencia").addEventListener("change", refreshSupplierSuggestion);
  document.getElementById("fornecedorDataPrimeiroPedido").addEventListener("change", refreshSupplierSuggestion);
  fornecedorCompradorSelect.addEventListener("change", refreshSupplierSuggestion);
  setupDatePickerField("fornecedorDataPrimeiroPedido", "fornecedorDataPrimeiroPedidoNative", "fornecedorDataPrimeiroPedidoPickerButton");
  setupDatePickerField("proximaDataInput", "proximaDataInputNative", "proximaDataInputPickerButton");
  setupDatePickerField("auditStartDate", "auditStartDateNative", "auditStartDatePickerButton");
  setupDatePickerField("auditEndDate", "auditEndDateNative", "auditEndDatePickerButton");
  document.getElementById("fornecedorForm").addEventListener("submit", saveSupplier);
  document.getElementById("compradorForm").addEventListener("submit", saveBuyer);
  document.getElementById("resetFornecedorFormButton").addEventListener("click", resetSupplierForm);
  document.getElementById("resetCompradorFormButton").addEventListener("click", resetBuyerForm);
  document.getElementById("compradorNome").addEventListener("input", updateBuyerPreview);
  document.getElementById("compradorFotoArquivo").addEventListener("change", updateBuyerPreview);
  document.getElementById("logoArquivo").addEventListener("change", async () => {
    const logoFile = document.getElementById("logoArquivo").files[0];
    if (!logoFile) return;
    document.getElementById("logoPreview").src = await fileToDataUrl(logoFile);
  });

  document.getElementById("saveSettingsButton").addEventListener("click", saveSettings);
  document.getElementById("syncAllButton").addEventListener("click", async () => {
    closeModal("settingsModal");
    await loadPortalData();
  });

  const openSettings = () => {
    populateSettings();
    document.getElementById("settingsModal").showModal();
  };

  const sidebarSettingsButton = document.getElementById("openSettingsButton");
  if (sidebarSettingsButton) {
    sidebarSettingsButton.addEventListener("click", openSettings);
  }

  document.getElementById("openSettingsButtonTop").addEventListener("click", openSettings);
  document.getElementById("openAuditButtonTop").addEventListener("click", openAuditPasswordModal);
  document.getElementById("logoutPortalButtonTop").addEventListener("click", logoutPortalSession);
  document.getElementById("openFornecedorNotasButton").addEventListener("click", () => openSupplierNotes());
  document.getElementById("openAgendaSupplierNotesButton").addEventListener("click", () => {
    const row = occurrenceRows().find((item) => item.id === state.selectedOccurrenceId);
    if (!row?.supplier?.id) {
      setFeedback("Fornecedor da agenda não localizado para abrir as notas.", "warning");
      return;
    }
    openSupplierNotes(row.supplier.id);
  });
  document.getElementById("saveSupplierNotesButton").addEventListener("click", saveSupplierNotesDraft);
  document.getElementById("buyerLoginButton").addEventListener("click", loginBuyer);
  document.getElementById("buyerLoginEmail").addEventListener("input", updatePortalLoginHint);
  document.getElementById("unlockAuditButton").addEventListener("click", unlockAuditView);
  document.getElementById("auditPeriodPreset").addEventListener("change", () => {
    syncAuditPeriodInputs();
    renderAuditDashboard();
  });
  document.getElementById("auditStartDate").addEventListener("change", () => {
    document.getElementById("auditPeriodPreset").value = "personalizado";
    syncAuditPeriodInputs();
    renderAuditDashboard();
  });
  document.getElementById("auditEndDate").addEventListener("change", () => {
    document.getElementById("auditPeriodPreset").value = "personalizado";
    syncAuditPeriodInputs();
    renderAuditDashboard();
  });
  document.getElementById("refreshAuditButton").addEventListener("click", async () => {
    await loadPortalData({ silent: true });
    renderAuditDashboard();
  });
  document.getElementById("downloadModeloCsvButton").addEventListener("click", downloadSupplierCsvTemplate);
  document.getElementById("importFornecedoresButton").addEventListener("click", () => {
    document.getElementById("importFornecedorFile").click();
  });
  document.getElementById("importFornecedorFile").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    await importSuppliersFromFile(file);
    event.target.value = "";
  });
  document.getElementById("openFirstTodayButton").addEventListener("click", () => {
    const first = filteredRows("agenda-dia")[0];
    if (!first) {
      setFeedback("Não há agendas do dia para abrir.", "warning");
      return;
    }
    openAgendaDetail(first.id);
  });

  document.getElementById("proximaDataInput").addEventListener("change", updateAgendaAdjustment);
  document.getElementById("tratarAgendaButton").addEventListener("click", tratarAgendaAtual);

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });
}

function getClientAdminEmail() {
  return String(state.clientAdminEmail ?? state.clientMeta?.admin_email ?? "").trim().toLowerCase();
}

function buyerByEmail(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return state.buyers.find((buyer) => String(buyer.email ?? "").trim().toLowerCase() === normalized) ?? null;
}

function getLoggedPortalRole() {
  return localStorage.getItem(storageKeys.loggedPortalRole) ?? "";
}

function getLoggedPortalEmail() {
  return localStorage.getItem(storageKeys.loggedPortalEmail) ?? "";
}

function loggedPortalActor() {
  const role = getLoggedPortalRole();
  if (role === "admin_client") {
    const email = getLoggedPortalEmail();
    if (!email) return null;
    return {
      role: "admin_client",
      email,
      displayName: "Administrador do Cliente",
    };
  }

  const buyer = loggedBuyer();
  if (!buyer) return null;
  return {
    role: "buyer",
    id: buyer.id,
    email: buyer.email,
    nome: buyer.nome_comprador,
    displayName: buyer.nome_comprador,
  };
}

function clearPortalSession() {
  localStorage.removeItem(storageKeys.loggedPortalRole);
  localStorage.removeItem(storageKeys.loggedPortalEmail);
  localStorage.removeItem(storageKeys.loggedBuyerId);
}

function updatePortalLoginHint() {
  const emailInput = document.getElementById("buyerLoginEmail");
  const passwordConfirmWrap = document.getElementById("buyerLoginConfirmWrap");
  const hint = document.getElementById("buyerLoginHint");
  const email = emailInput.value.trim().toLowerCase();
  const adminEmail = getClientAdminEmail();
  const buyer = state.buyers.find((item) => (item.email ?? "").toLowerCase() === email);

  let firstAccess = false;
  if (email && adminEmail && email === adminEmail && !(state.clientMeta?.admin_password ?? "")) {
    firstAccess = true;
    hint.textContent = "Primeiro acesso do Administrador do Cliente identificado. Defina a senha e confirme no campo abaixo para ativar o acesso.";
  } else if (buyer && !(buyer.senha_hash ?? "")) {
    firstAccess = true;
    hint.textContent = "Primeiro acesso do comprador identificado. Defina a senha e confirme no campo abaixo para ativar o acesso.";
  } else {
    hint.textContent = "Entre com o e-mail e a senha. O e-mail do responsável do cliente entra como Administrador do Cliente; os compradores usam o e-mail cadastrado na carteira operacional.";
  }

  passwordConfirmWrap.classList.toggle("hidden", !firstAccess);
}

function openBuyerLoginModal() {
  clearFeedback(document.getElementById("buyerLoginFeedback"));
  document.getElementById("buyerLoginEmail").value = getLoggedPortalEmail() || "";
  document.getElementById("buyerLoginPassword").value = "";
  document.getElementById("buyerLoginPasswordConfirm").value = "";
  updatePortalLoginHint();
  document.getElementById("buyerLoginModal").showModal();
}

function logoutPortalSession() {
  clearPortalSession();
  localStorage.removeItem(storageKeys.activeBuyerId);
  updateBuyerCard();
  renderTables();
  openBuyerLoginModal();
}

async function loginBuyer() {
  const email = document.getElementById("buyerLoginEmail").value.trim().toLowerCase();
  const password = document.getElementById("buyerLoginPassword").value.trim();
  const confirmPassword = document.getElementById("buyerLoginPasswordConfirm").value.trim();
  const feedbackTarget = document.getElementById("buyerLoginFeedback");
  const adminEmail = getClientAdminEmail();
  const buyer = state.buyers.find((item) => (item.email ?? "").toLowerCase() === email);

  if (!email || !password) {
    setFeedback("Informe o e-mail e a senha de acesso.", "error", feedbackTarget);
    return;
  }

  if (adminEmail && email === adminEmail) {
    const configuredPassword = state.clientMeta?.admin_password ?? "";
    if (!configuredPassword) {
      if (password.length < 4) {
        setFeedback("Defina uma senha com pelo menos 4 caracteres para o Administrador do Cliente.", "error", feedbackTarget);
        return;
      }
      if (password !== confirmPassword) {
        setFeedback("A confirmação da senha do administrador não confere.", "error", feedbackTarget);
        return;
      }
      if (!state.clientRecordId) {
        setFeedback("Cliente não localizado para ativar o acesso administrativo.", "error", feedbackTarget);
        return;
      }

      try {
        const updatedObservacoes = buildClientObservacoes(state.clientMeta, {
          admin_password: password,
          admin_email: adminEmail,
        });
        await fetchSupabase(`/rest/v1/clientes?id=eq.${state.clientRecordId}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: { observacoes: updatedObservacoes },
        });
        state.clientMeta = parseClientObservacoes(updatedObservacoes);
      } catch (error) {
        setFeedback(`Não foi possível ativar o acesso administrativo: ${error.message}`, "error", feedbackTarget);
        return;
      }
    } else if (password !== configuredPassword) {
      setFeedback("Senha do administrador inválida.", "error", feedbackTarget);
      return;
    }

    clearPortalSession();
    localStorage.setItem(storageKeys.loggedPortalRole, "admin_client");
    localStorage.setItem(storageKeys.loggedPortalEmail, email);
    const adminBuyer = buyerByEmail(email);
    if (adminBuyer) {
      localStorage.setItem(storageKeys.activeBuyerId, adminBuyer.id);
      localStorage.setItem(storageKeys.loggedBuyerId, adminBuyer.id);
    }
    closeModal("buyerLoginModal");
    setFeedback("Administrador do Cliente autenticado com sucesso.", "success");
    updateBuyerCard();
    renderTables();
    return;
  }

  if (!buyer) {
    setFeedback("Acesso não localizado para este cliente.", "error", feedbackTarget);
    return;
  }

  if (!(buyer.senha_hash ?? "")) {
    if (password.length < 4) {
      setFeedback("Defina uma senha com pelo menos 4 caracteres para ativar o comprador.", "error", feedbackTarget);
      return;
    }
    if (password !== confirmPassword) {
      setFeedback("A confirmação da senha do comprador não confere.", "error", feedbackTarget);
      return;
    }

    try {
      await fetchSupabase(`/rest/v1/compradores?id=eq.${buyer.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { senha_hash: password },
      });
      buyer.senha_hash = password;
    } catch (error) {
      setFeedback(`Não foi possível ativar o comprador: ${error.message}`, "error", feedbackTarget);
      return;
    }
  } else if ((buyer.senha_hash ?? "") !== password) {
    setFeedback("Senha do comprador inválida.", "error", feedbackTarget);
    return;
  }

  clearPortalSession();
  localStorage.setItem(storageKeys.loggedBuyerId, buyer.id);
  localStorage.setItem(storageKeys.loggedPortalRole, "buyer");
  localStorage.setItem(storageKeys.loggedPortalEmail, email);
  localStorage.setItem(storageKeys.activeBuyerId, buyer.id);
  closeModal("buyerLoginModal");
  updateBuyerCard();
  renderTables();
  setFeedback("Comprador autenticado com sucesso.", "success");
}

function ensureBuyerLoginSession() {
  const role = getLoggedPortalRole();
  const loggedEmail = getLoggedPortalEmail();
  const adminEmail = getClientAdminEmail();
  const buyer = loggedBuyer();

  if (role === "admin_client" && loggedEmail && (!adminEmail || loggedEmail === adminEmail)) {
    return true;
  }

  if (role === "buyer" && buyer) {
    return true;
  }

  if (role === "admin_client" && buyer) {
    return true;
  }

  if (getClientAdminEmail() || state.buyers.length) {
    openBuyerLoginModal();
    return false;
  }
  return true;
}

function renderKpis() {
  const rows = filteredRows("proximas-agendas");
  const data = [
    ["Hoje", filteredRows("agenda-dia").length],
    ["Próximas", rows.filter((row) => row.data_prevista > todayIso()).length],
    ["Atrasadas", filteredRows("atrasadas").length],
    ["Sem comprador", state.suppliers.filter((supplier) => !supplier.comprador_id).length],
  ];

  document.getElementById("agendaDiaStats").innerHTML = data.map(([label, value]) => `
    <div class="kpi-card">
      <span class="muted">${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

async function bootstrap() {
  applyTheme();
  renderSupplierDayCheckboxes([]);
  populateSettings();
  bindStaticEvents();
  resetBuyerForm();
  resetSupplierForm();
  showSection("agenda-dia");
  await loadPortalData({ silent: true });
  ensureBuyerSelection();
  renderTables();
  ensureBuyerLoginSession();
}

bootstrap();
