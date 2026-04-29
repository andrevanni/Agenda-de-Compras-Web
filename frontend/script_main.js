function ensureBuyerLoginSession() {
  const role = getLoggedPortalRole();
  const loggedEmail = getLoggedPortalEmail();
  const adminEmail = getClientAdminEmail();
  const buyer = loggedBuyer();

  // Acesso via "Abrir Portal" do painel admin — bypass total do login
  if (role === "admin_portal") {
    return true;
  }

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

// ============================================================
// SIDEBAR RECOLHÍVEL
// ============================================================

function updateToggleIcon() {
  const btn = document.getElementById("sidebarToggle");
  const icon = btn?.querySelector(".sidebar-toggle-icon");
  if (!icon) return;
  const isCollapsed = document.querySelector(".sidebar")?.classList.contains("collapsed");
  icon.textContent = isCollapsed ? "⋮" : "✕";
}

function initSidebarState() {
  const collapsed = localStorage.getItem(storageKeys.sidebarCollapsed) !== "false";
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  sidebar.classList.toggle("collapsed", collapsed);
  updateToggleIcon();
}

function toggleSidebar() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  const isCollapsed = sidebar.classList.toggle("collapsed");
  localStorage.setItem(storageKeys.sidebarCollapsed, isCollapsed ? "true" : "false");
  updateToggleIcon();
  if (state.calendarInstance) {
    setTimeout(() => state.calendarInstance.updateSize(), 230);
  }
}

// ============================================================
// PAINEL DE NOTAS
// ============================================================

function renderPainel() {
  const container = document.getElementById("painelNotas");
  if (!container) return;

  const { activeBuyerId } = getSettings();

  // Junta pendentes + realizadas que tenham nota preenchida
  const allOccs = [...state.agenda, ...state.auditOccurrences];
  const seen = new Set();
  const withNota = allOccs.filter((occ) => {
    if (!occ.nota?.trim()) return false;
    if (seen.has(occ.id)) return false;
    seen.add(occ.id);
    if (activeBuyerId && activeBuyerId !== UNASSIGNED_BUYER_VALUE) {
      const supplier = supplierById(occ.fornecedor_id);
      const buyerMatch = supplier?.comprador_id === activeBuyerId || occ.comprador_id === activeBuyerId;
      if (!buyerMatch) return false;
    }
    return true;
  });

  if (!withNota.length) {
    container.innerHTML = `<p class="muted" style="padding:24px 0">Nenhuma nota fixada nos compromissos ainda. Abra um compromisso e adicione uma nota.</p>`;
    return;
  }

  // Agrupa por comprador
  const groups = new Map();
  for (const occ of withNota) {
    const supplier = supplierById(occ.fornecedor_id);
    const buyer = buyerById(occ.comprador_id ?? supplier?.comprador_id);
    const key = buyer?.id ?? "sem-comprador";
    if (!groups.has(key)) groups.set(key, { buyer, items: [] });
    groups.get(key).items.push(occ);
  }

  container.innerHTML = Array.from(groups.values()).map(({ buyer, items }) => `
    <div class="painel-grupo">
      <div class="painel-grupo-header">
        ${buyer ? `<div class="avatar avatar-sm avatar-placeholder">${buyerInitials(buyer.nome_comprador)}</div>` : ""}
        <strong>${buyer?.nome_comprador ?? "Sem comprador"}</strong>
        <span class="muted">${items.length} nota(s)</span>
      </div>
      <div class="painel-cards">
        ${items.map((occ) => {
          const supplier = supplierById(occ.fornecedor_id);
          const cat = categoriaById(occ.categoria_id);
          const titulo = occ.titulo || supplier?.nome_fornecedor || "Compromisso";
          const cor = cat?.cor ?? "#F59E0B";
          const hora = occ.hora_inicio ? ` · ${occ.hora_inicio.slice(0, 5)}` : "";
          return `
            <div class="postit-card" style="border-top: 4px solid ${cor}">
              <div class="postit-card-header">
                <span class="postit-card-titulo">${titulo}</span>
                <span class="postit-card-data muted">${formatDate(occ.data_prevista)}${hora}</span>
              </div>
              <p class="postit-card-nota">${occ.nota}</p>
              <button class="postit-card-remove muted" data-remove-nota="${occ.id}" title="Remover nota">&#10005;</button>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-remove-nota]").forEach((btn) => {
    btn.addEventListener("click", () => removeNota(btn.dataset.removeNota));
  });
}

async function removeNota(occId) {
  try {
    await fetchSupabase(`/rest/v1/agenda_ocorrencias?id=eq.${occId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { nota: null },
    });
    const occ = state.agenda.find((o) => o.id === occId) ?? state.auditOccurrences.find((o) => o.id === occId);
    if (occ) occ.nota = null;
    renderPainel();
  } catch (err) {
    setFeedback(`Não foi possível remover a nota: ${err.message}`, "error");
  }
}

// ============================================================
// CALENDÁRIO — FullCalendar
// ============================================================

function getCalendarHiddenDays() {
  const preset = localStorage.getItem(storageKeys.calendarWeekdays) ?? "seg-dom";
  if (preset === "seg-sex") return [0, 6]; // oculta dom e sáb
  if (preset === "seg-sab") return [0];    // oculta só dom
  return [];
}

function applyCalendarWeekdays() {
  if (!state.calendarInstance) return;
  state.calendarInstance.setOption("hiddenDays", getCalendarHiddenDays());
}

function categoriaById(id) {
  return state.categorias.find((cat) => cat.id === id) ?? null;
}

function categoriaCorById(id) {
  return categoriaById(id)?.cor ?? "#6B7280";
}

function buildCalendarEvents() {
  const { activeBuyerId } = getSettings();

  const filtered = state.agenda.filter((occ) => {
    if (!activeBuyerId || activeBuyerId === UNASSIGNED_BUYER_VALUE) return true;
    // Tarefas gerais (sem fornecedor e sem comprador) aparecem para todos os compradores
    if (!occ.fornecedor_id && !occ.comprador_id) return true;
    const supplier = supplierById(occ.fornecedor_id);
    const buyerOnSupplier = supplier?.comprador_id;
    const buyerOnOcc = occ.comprador_id;
    return buyerOnSupplier === activeBuyerId || buyerOnOcc === activeBuyerId;
  });

  return filtered.map((occ) => {
    const supplier = supplierById(occ.fornecedor_id);
    const cat = categoriaById(occ.categoria_id);
    const titulo = occ.titulo || supplier?.nome_fornecedor || "Sem título";
    const cor = cat?.cor ?? "#3B82F6";
    const start = occ.hora_inicio
      ? `${occ.data_prevista}T${occ.hora_inicio}`
      : occ.data_prevista;
    const end = occ.hora_fim
      ? `${occ.data_prevista}T${occ.hora_fim}`
      : null;
    return {
      id: occ.id,
      title: titulo,
      start,
      end: end ?? undefined,
      allDay: !occ.hora_inicio,
      backgroundColor: cor,
      borderColor: cor,
      textColor: "#ffffff",
      extendedProps: { occ, supplier, cat },
    };
  });
}

function initCalendar() {
  const el = document.getElementById("fullCalendar");
  if (!el) return;
  if (state.calendarInstance) {
    state.calendarInstance.refetchEvents();
    return;
  }

  state.calendarInstance = new FullCalendar.Calendar(el, {
    locale: "pt-br",
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    buttonText: {
      today: "Hoje",
      month: "Mês",
      week: "Semana",
      day: "Dia",
    },
    height: "auto",
    slotMinTime: "08:00:00",
    slotMaxTime: "18:00:00",
    scrollTime: "08:00:00",
    slotDuration: "00:30:00",
    hiddenDays: getCalendarHiddenDays(),
    navLinks: true,
    navLinkDayClick: "timeGridDay",
    selectable: true,
    selectMirror: true,
    eventDisplay: "block",
    events: buildCalendarEvents(),
    eventClick(info) {
      const { occ } = info.event.extendedProps;
      if (occ?.fornecedor_id) {
        openAgendaDetail(occ.id);
      } else {
        openGenericEventDetail(occ);
      }
    },
    select(info) {
      openNewEventModal(info.startStr.slice(0, 10));
    },
  });

  state.calendarInstance.render();
}

function refreshCalendar() {
  if (!state.calendarInstance) {
    initCalendar();
    return;
  }
  state.calendarInstance.removeAllEvents();
  state.calendarInstance.addEventSource(buildCalendarEvents());
}

// ============================================================
// CATEGORIAS
// ============================================================

async function loadCategorias() {
  const settings = getSettings();
  try {
    const rows = await fetchSupabase(
      `/rest/v1/categorias_agenda?select=id,nome,cor,icone,ativo&tenant_id=eq.${settings.tenantId}&ativo=eq.true&order=nome.asc`
    );
    state.categorias = rows ?? [];
  } catch {
    state.categorias = [
      { id: "cat-compras",     nome: "Agenda de Compras", cor: "#F59E0B" },
      { id: "cat-pessoal",     nome: "Pessoal",           cor: "#3B82F6" },
      { id: "cat-operacional", nome: "Operacional",       cor: "#10B981" },
    ];
  }
}

function renderCategoriasTable() {
  const tbody = document.getElementById("categoriasTable");
  if (!tbody) return;
  tbody.innerHTML = state.categorias.length
    ? state.categorias.map((cat) => `
      <tr>
        <td><span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${cat.cor};vertical-align:middle;"></span></td>
        <td>${cat.nome}</td>
        <td class="td-actions">
          <div class="actions">
            <button class="btn btn-outline btn-sm" data-edit-categoria="${cat.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-delete-categoria="${cat.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="3">Nenhuma categoria cadastrada.</td></tr>`;

  tbody.querySelectorAll("[data-edit-categoria]").forEach((btn) => {
    btn.addEventListener("click", () => editCategoria(btn.dataset.editCategoria));
  });
  tbody.querySelectorAll("[data-delete-categoria]").forEach((btn) => {
    btn.addEventListener("click", () => deleteCategoria(btn.dataset.deleteCategoria));
  });
}

function editCategoria(id) {
  const cat = categoriaById(id);
  if (!cat) return;
  document.getElementById("categoriaId").value = cat.id;
  document.getElementById("categoriaNome").value = cat.nome;
  document.getElementById("categoriaCor").value = cat.cor;
  document.getElementById("categoriaCorPreview").style.background = cat.cor;
  document.getElementById("categoriaFormMode").textContent = `Editando ${cat.nome}`;
}

async function deleteCategoria(id) {
  if (!window.confirm("Deseja realmente excluir esta categoria?")) return;
  try {
    await fetchSupabase(`/rest/v1/categorias_agenda?id=eq.${id}`, { method: "DELETE" });
    setFeedback("Categoria excluída com sucesso.", "success");
    await loadCategorias();
    renderCategoriasTable();
    refreshCalendar();
  } catch (err) {
    setFeedback(`Não foi possível excluir a categoria: ${err.message}`, "error");
  }
}

async function saveCategoria(event) {
  event.preventDefault();
  const id    = document.getElementById("categoriaId").value.trim();
  const nome  = document.getElementById("categoriaNome").value.trim();
  const cor   = document.getElementById("categoriaCor").value;
  const settings = getSettings();

  if (!nome) { setFeedback("Informe o nome da categoria.", "error"); return; }

  const payload = { tenant_id: settings.tenantId, nome, cor, ativo: true };

  try {
    if (id) {
      await fetchSupabase(`/rest/v1/categorias_agenda?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { nome, cor },
      });
      setFeedback("Categoria atualizada.", "success");
    } else {
      await fetchSupabase("/rest/v1/categorias_agenda?on_conflict=tenant_id,nome", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: payload,
      });
      setFeedback("Categoria criada com sucesso.", "success");
    }
    document.getElementById("categoriaId").value = "";
    document.getElementById("categoriaForm").reset();
    document.getElementById("categoriaFormMode").textContent = "Nova categoria";
    await loadCategorias();
    renderCategoriasTable();
    refreshCalendar();
  } catch (err) {
    setFeedback(`Não foi possível salvar a categoria: ${err.message}`, "error");
  }
}

// ============================================================
// NOVO EVENTO GENÉRICO
// ============================================================

function populateNewEventSelects() {
  const catSelect = document.getElementById("newEventCategoria");
  const buyerSelect = document.getElementById("newEventComprador");
  if (catSelect) {
    catSelect.innerHTML = state.categorias
      .map((cat) => `<option value="${cat.id}" style="background:${cat.cor}">${cat.nome}</option>`)
      .join("");
  }
  if (buyerSelect) {
    buyerSelect.innerHTML = [
      `<option value="">Sem responsável</option>`,
      ...state.buyers.map((b) => `<option value="${b.id}">${b.nome_comprador}</option>`),
    ].join("");
  }
}

function openNewEventModal(dateStr = "") {
  populateNewEventSelects();
  document.getElementById("newEventTitulo").value = "";
  document.getElementById("newEventData").value = dateStr ? isoToBr(dateStr) : isoToBr(todayIso());
  document.getElementById("newEventHoraInicio").value = "08:00";
  document.getElementById("newEventHoraFim").value = "09:00";
  document.getElementById("newEventRecorrencia").value = "";
  document.getElementById("newEventObservacao").value = "";
  document.getElementById("newEventRecorrenciaFimWrap").classList.add("hidden");
  clearFeedback(document.getElementById("newEventConflictWarning"));
  setupDatePickerField("newEventData", "newEventDataNative", "newEventDataPickerButton");
  setupDatePickerField("newEventRecorrenciaFim", "newEventRecorrenciaFimNative", "newEventRecorrenciaFimPickerButton");
  document.getElementById("newEventModal").showModal();
}

function openGenericEventDetail(occ) {
  if (!occ) return;
  const cat = categoriaById(occ.categoria_id);
  populateNewEventSelects();
  document.getElementById("newEventTitulo").value = occ.titulo ?? "";
  document.getElementById("newEventData").value = isoToBr(occ.data_prevista);
  document.getElementById("newEventHoraInicio").value = occ.hora_inicio ?? "08:00";
  document.getElementById("newEventHoraFim").value = occ.hora_fim ?? "09:00";
  document.getElementById("newEventCategoria").value = occ.categoria_id ?? "";
  document.getElementById("newEventComprador").value = occ.comprador_id ?? "";
  document.getElementById("newEventObservacao").value = occ.observacao ?? "";
  setupDatePickerField("newEventData", "newEventDataNative", "newEventDataPickerButton");
  setupDatePickerField("newEventRecorrenciaFim", "newEventRecorrenciaFimNative", "newEventRecorrenciaFimPickerButton");
  document.getElementById("newEventModal").showModal();
}

async function checkEventConflict(tenantId, data, horaInicio, horaFim, excludeId = null) {
  if (!horaInicio || !horaFim) return false;
  try {
    let query = `/rest/v1/agenda_ocorrencias?select=id,titulo,hora_inicio,hora_fim&tenant_id=eq.${tenantId}&data_prevista=eq.${data}&status=eq.PENDENTE&hora_inicio=not.is.null`;
    if (excludeId) query += `&id=neq.${excludeId}`;
    const rows = await fetchSupabase(query);
    return (rows ?? []).some((row) => {
      if (!row.hora_inicio || !row.hora_fim) return false;
      return horaInicio < row.hora_fim && horaFim > row.hora_inicio;
    });
  } catch {
    return false;
  }
}

function buildRecorrenciaDates(baseDate, tipo, fimStr) {
  const dates = [];
  const limit = fimStr ? fimStr : addDaysLocalIso(baseDate, 365);
  let current = baseDate;
  const step = { diaria: 1, semanal: 7, quinzenal: 14, mensal: 30 }[tipo] ?? 7;
  while (true) {
    current = addDaysLocalIso(current, step);
    if (current > limit) break;
    dates.push(current);
    if (dates.length > 500) break;
  }
  return dates;
}

async function saveNewEvent() {
  const titulo       = document.getElementById("newEventTitulo").value.trim();
  const data         = brToIso(document.getElementById("newEventData").value);
  const horaInicio   = document.getElementById("newEventHoraInicio").value || null;
  const horaFim      = document.getElementById("newEventHoraFim").value || null;
  const categoriaId  = document.getElementById("newEventCategoria").value || null;
  const compradorId  = document.getElementById("newEventComprador").value || null;
  const recorrencia  = document.getElementById("newEventRecorrencia").value;
  const recFim       = brToIso(document.getElementById("newEventRecorrenciaFim").value);
  const observacao   = document.getElementById("newEventObservacao").value.trim() || null;
  const nota         = document.getElementById("newEventNota").value.trim() || null;
  const settings     = getSettings();
  const feedbackEl   = document.getElementById("newEventConflictWarning");

  if (!titulo || !data) {
    setFeedback("Informe o título e a data do evento.", "error", feedbackEl);
    feedbackEl.classList.remove("hidden");
    return;
  }

  const hasConflict = await checkEventConflict(settings.tenantId, data, horaInicio, horaFim);
  if (hasConflict) {
    setFeedback("Atenção: existe outro evento no mesmo horário nesta data.", "warning", feedbackEl);
    feedbackEl.classList.remove("hidden");
  } else {
    feedbackEl.classList.add("hidden");
  }

  const base = {
    tenant_id:    settings.tenantId,
    titulo,
    data_prevista: data,
    hora_inicio:   horaInicio,
    hora_fim:      horaFim,
    categoria_id:  categoriaId,
    comprador_id:  compradorId,
    observacao,
    nota,
    status: "PENDENTE",
    recorrencia: recorrencia ? JSON.stringify({ tipo: recorrencia, fim: recFim || null }) : null,
  };

  try {
    const dates = recorrencia ? [data, ...buildRecorrenciaDates(data, recorrencia, recFim)] : [data];
    for (const d of dates) {
      await fetchSupabase("/rest/v1/agenda_ocorrencias", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: { ...base, data_prevista: d },
      });
    }
    setFeedback(
      dates.length > 1
        ? `Evento criado com ${dates.length} ocorrências (recorrência ${recorrencia}).`
        : "Evento criado com sucesso.",
      "success"
    );
    closeModal("newEventModal");
    await loadPortalData({ silent: true });
    refreshCalendar();
  } catch (err) {
    setFeedback(`Não foi possível salvar o evento: ${err.message}`, "error", feedbackEl);
    feedbackEl.classList.remove("hidden");
  }
}

// ============================================================
// BOOTSTRAP
// ============================================================

async function bootstrap() {
  // Processa parâmetros de URL (vindos do "Abrir Portal" no admin)
  const urlParams = new URLSearchParams(window.location.search);
  const urlJwt = urlParams.get("jwt");
  const urlTenantId = urlParams.get("tenant_id");
  if (urlJwt && urlTenantId) {
    localStorage.setItem(storageKeys.jwt, urlJwt);
    localStorage.setItem(storageKeys.tenantId, urlTenantId);
    localStorage.removeItem(storageKeys.loggedBuyerId);
    localStorage.removeItem(storageKeys.activeBuyerId);
    localStorage.setItem(storageKeys.loggedPortalRole, "admin_portal");
    history.replaceState(null, "", window.location.pathname);
  }

  applyTheme();
  initSidebarState();
  renderSupplierDayCheckboxes([]);
  populateSettings();
  bindStaticEvents();
  resetBuyerForm();
  resetSupplierForm();
  showSection("calendario");
  await loadCategorias();
  await loadPortalData({ silent: true });
  ensureBuyerSelection();
  renderTables();
  renderCategoriasTable();
  refreshCalendar();
  ensureBuyerLoginSession();
}

bootstrap();

// PWA install prompt
(function () {
  const DISMISSED_KEY = 'agenda_pwa_dismissed';
  let deferredPrompt = null;

  function showModal() {
    const modal = document.getElementById('pwaModal');
    if (modal) modal.style.display = 'flex';
  }

  function hideModal() {
    const modal = document.getElementById('pwaModal');
    if (modal) modal.style.display = 'none';
    localStorage.setItem(DISMISSED_KEY, '1');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('pwaModalInstall');
    if (btn) btn.style.display = 'block';
  });

  window.addEventListener('appinstalled', hideModal);

  document.getElementById('pwaModalInstall')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') hideModal();
  });

  document.getElementById('pwaModalDismiss')?.addEventListener('click', hideModal);

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!isStandalone && !localStorage.getItem(DISMISSED_KEY)) {
    setTimeout(showModal, 2000);
  }
})();
