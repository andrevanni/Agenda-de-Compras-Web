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
  const filtraPorComprador = activeBuyerId && activeBuyerId !== UNASSIGNED_BUYER_VALUE;

  // (1) Notas-de-ocorrência: pendentes + realizadas com nota preenchida
  const allOccs = [...state.agenda, ...state.auditOccurrences];
  const seen = new Set();
  const withNota = allOccs.filter((occ) => {
    if (!occ.nota?.trim()) return false;
    if (seen.has(occ.id)) return false;
    seen.add(occ.id);
    if (filtraPorComprador) {
      const supplier = supplierById(occ.fornecedor_id);
      const buyerMatch = supplier?.comprador_id === activeBuyerId || occ.comprador_id === activeBuyerId;
      if (!buyerMatch) return false;
    }
    return true;
  });

  // (2) Notas livres (tabela notas_painel)
  const notasLivres = (state.notasLivres ?? []).filter((nota) => {
    if (!filtraPorComprador) return true;
    return nota.comprador_id === activeBuyerId;
  });

  if (!withNota.length && !notasLivres.length) {
    container.innerHTML = `<p class="muted" style="padding:24px 0">Nenhuma nota no painel ainda. Clique em <strong>+ Nova nota</strong> ou abra um compromisso e adicione uma nota.</p>`;
    return;
  }

  // Agrupa tudo por comprador. Notas-de-ocorrência primeiro, livres depois.
  const groups = new Map();
  const addToGroup = (key, buyer, payload) => {
    if (!groups.has(key)) groups.set(key, { buyer, occorrencias: [], livres: [] });
    payload(groups.get(key));
  };
  for (const occ of withNota) {
    const supplier = supplierById(occ.fornecedor_id);
    const buyer = buyerById(occ.comprador_id ?? supplier?.comprador_id);
    addToGroup(buyer?.id ?? "sem-comprador", buyer, (g) => g.occorrencias.push(occ));
  }
  for (const nota of notasLivres) {
    const buyer = buyerById(nota.comprador_id);
    addToGroup(buyer?.id ?? "sem-comprador", buyer, (g) => g.livres.push(nota));
  }

  container.innerHTML = Array.from(groups.values()).map(({ buyer, occorrencias, livres }) => {
    const totalNotas = occorrencias.length + livres.length;
    const cardsOcc = occorrencias.map((occ) => {
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
          <p class="postit-card-nota">${escapeHtml(occ.nota)}</p>
          <button class="postit-card-remove muted" data-remove-nota="${occ.id}" title="Remover nota">&#10005;</button>
        </div>
      `;
    }).join("");
    const cardsLivres = livres.map((nota) => `
      <div class="postit-card postit-card-livre" style="border-top: 4px solid #FBBF24">
        <div class="postit-card-header">
          <span class="postit-card-titulo">&#128204; Post-it</span>
          <span class="postit-card-data muted">${formatDate(nota.updated_at?.slice(0, 10) ?? nota.created_at?.slice(0, 10))}</span>
        </div>
        <p class="postit-card-nota" data-edit-nota-livre="${nota.id}" title="Clique para editar">${escapeHtml(nota.texto)}</p>
        <button class="postit-card-remove muted" data-remove-nota-livre="${nota.id}" title="Excluir post-it">&#10005;</button>
      </div>
    `).join("");
    return `
      <div class="painel-grupo">
        <div class="painel-grupo-header">
          ${buyer ? `<div class="avatar avatar-sm avatar-placeholder">${buyerInitials(buyer.nome_comprador)}</div>` : ""}
          <strong>${buyer?.nome_comprador ?? "Sem comprador"}</strong>
          <span class="muted">${totalNotas} nota(s)</span>
        </div>
        <div class="painel-cards">${cardsOcc}${cardsLivres}</div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-remove-nota]").forEach((btn) => {
    btn.addEventListener("click", () => removeNota(btn.dataset.removeNota));
  });
  container.querySelectorAll("[data-remove-nota-livre]").forEach((btn) => {
    btn.addEventListener("click", () => deleteNotaLivre(btn.dataset.removeNotaLivre));
  });
  container.querySelectorAll("[data-edit-nota-livre]").forEach((el) => {
    el.addEventListener("click", () => turnNotaLivreEditable(el));
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
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
// Notas livres (post-its do Painel desvinculados de ocorrências)
// ============================================================

async function createNotaLivre() {
  const texto = (window.prompt("Texto do post-it:") || "").trim();
  if (!texto) return;
  try {
    const s = getSettings();
    const compradorId = (s.activeBuyerId && s.activeBuyerId !== UNASSIGNED_BUYER_VALUE)
      ? s.activeBuyerId
      : (s.loggedBuyerId || null);
    const rows = await fetchSupabase("/rest/v1/notas_painel", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { tenant_id: s.tenantId, comprador_id: compradorId, texto },
    });
    const nova = Array.isArray(rows) ? rows[0] : rows;
    if (nova) {
      state.notasLivres.unshift(nova);
      renderPainel();
      setFeedback("Post-it criado e fixado no Painel.", "success");
    }
  } catch (err) {
    setFeedback(`Não foi possível criar o post-it: ${err.message}`, "error");
  }
}

function turnNotaLivreEditable(pEl) {
  const id = pEl.dataset.editNotaLivre;
  const textoAtual = state.notasLivres.find((n) => n.id === id)?.texto ?? "";
  const textarea = document.createElement("textarea");
  textarea.value = textoAtual;
  textarea.className = "postit-edit-area";
  textarea.style.cssText = "width:100%;min-height:80px;border:1px dashed var(--line);background:transparent;font:inherit;color:inherit;resize:vertical;outline:none;padding:6px;border-radius:4px;";
  pEl.replaceWith(textarea);
  textarea.focus();
  textarea.select();
  let handled = false;
  const finish = async () => {
    if (handled) return;
    handled = true;
    const novoTexto = textarea.value.trim();
    if (!novoTexto) {
      await deleteNotaLivre(id, true);
      return;
    }
    if (novoTexto === textoAtual) {
      renderPainel();
      return;
    }
    await saveNotaLivreEdit(id, novoTexto);
  };
  textarea.addEventListener("blur", finish);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { handled = true; renderPainel(); }
    if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); textarea.blur(); }
  });
}

async function saveNotaLivreEdit(id, novoTexto) {
  try {
    const s = getSettings();
    const nowIso = new Date().toISOString();
    await fetchSupabase(`/rest/v1/notas_painel?id=eq.${id}&tenant_id=eq.${s.tenantId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { texto: novoTexto, updated_at: nowIso },
    });
    const nota = state.notasLivres.find((n) => n.id === id);
    if (nota) { nota.texto = novoTexto; nota.updated_at = nowIso; }
    renderPainel();
  } catch (err) {
    setFeedback(`Não foi possível salvar o post-it: ${err.message}`, "error");
    renderPainel();
  }
}

async function deleteNotaLivre(id, silent = false) {
  if (!silent && !confirm("Excluir este post-it?")) return;
  try {
    const s = getSettings();
    await fetchSupabase(`/rest/v1/notas_painel?id=eq.${id}&tenant_id=eq.${s.tenantId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    state.notasLivres = state.notasLivres.filter((n) => n.id !== id);
    renderPainel();
  } catch (err) {
    setFeedback(`Não foi possível excluir o post-it: ${err.message}`, "error");
  }
}

async function saveAgendaNota() {
  const occId = state.selectedOccurrenceId;
  if (!occId) return;
  const textarea = document.getElementById("agendaNota");
  if (!textarea) return;
  const novaNota = textarea.value.trim() || null;
  const btn = document.getElementById("saveAgendaNotaButton");
  const rotuloOriginal = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = "Salvando..."; }
  try {
    const s = getSettings();
    await fetchSupabase(`/rest/v1/agenda_ocorrencias?id=eq.${occId}&tenant_id=eq.${s.tenantId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { nota: novaNota },
    });
    const occ = state.agenda.find((o) => o.id === occId) ?? state.auditOccurrences.find((o) => o.id === occId);
    if (occ) occ.nota = novaNota;
    renderPainel();
    setFeedback(novaNota ? "Nota salva e fixada no Painel." : "Nota removida.", "success", agendaDetailFeedback);
  } catch (err) {
    setFeedback(`Não foi possível salvar a nota: ${err.message}`, "error", agendaDetailFeedback);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = rotuloOriginal ?? "&#128190; Salvar nota"; }
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

function getFeriado(dateIso) {
  return state.feriados.find((f) => f.data === dateIso) ?? null;
}

function isFeriado(dateIso) {
  return state.feriados.some((f) => f.data === dateIso);
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

  const occEvents = filtered.map((occ) => {
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

  const feriadoEvents = state.feriados.flatMap((f) => [
    {
      id: `feriado-bg-${f.id}`,
      start: f.data,
      allDay: true,
      display: "background",
      backgroundColor: "#FEF3C7",
    },
    {
      id: `feriado-label-${f.id}`,
      title: `🏖️ ${f.nome}`,
      start: f.data,
      allDay: true,
      display: "block",
      backgroundColor: "#F59E0B",
      borderColor: "#D97706",
      textColor: "#ffffff",
      classNames: ["feriado-event"],
      extendedProps: { feriado: f },
    },
  ]);

  return [...occEvents, ...feriadoEvents];
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
    const existing = rows ?? [];
    const hasAgendaCompras = existing.some((r) => r.nome === "Agenda de Compras");
    if (!hasAgendaCompras) {
      // "Agenda de Compras" é categoria fundamental — cria automaticamente se não existir
      const created = await fetchSupabase("/rest/v1/categorias_agenda?on_conflict=tenant_id,nome", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: { tenant_id: settings.tenantId, nome: "Agenda de Compras", cor: "#F59E0B", ativo: true },
      });
      state.categorias = [...existing, ...(created ?? [])];
    } else {
      state.categorias = existing;
    }
  } catch {
    state.categorias = [
      { id: "cat-compras", nome: "Agenda de Compras", cor: "#F59E0B" },
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
  // Categorias — exclui "Agenda de Compras" (tem fluxo próprio)
  const catSelect = document.getElementById("newEventCategoria");
  if (catSelect) {
    const cats = state.categorias.filter((c) => c.nome !== "Agenda de Compras");
    catSelect.innerHTML = cats
      .map((cat) => `<option value="${cat.id}" style="background:${cat.cor}">${cat.nome}</option>`)
      .join("");
  }

  // Compradores — um checkbox por linha, layout grid
  const wrap = document.getElementById("newEventCompradoresWrap");
  if (wrap) {
    wrap.innerHTML = state.buyers.map((b) =>
      `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:3px 0;color:var(--text);">` +
      `<input type="checkbox" name="ev_comprador" value="${b.id}"> ${b.nome_comprador}</label>`
    ).join("");
  }

  // Botões Todos / Nenhum
  document.getElementById("newEventSelectAll")?.addEventListener("click", () => {
    document.querySelectorAll('input[name="ev_comprador"]').forEach((cb) => { cb.checked = true; });
  });
  document.getElementById("newEventClearAll")?.addEventListener("click", () => {
    document.querySelectorAll('input[name="ev_comprador"]').forEach((cb) => { cb.checked = false; });
  });
}

function setNewEventCompradores(buyerIds = []) {
  document.querySelectorAll('input[name="ev_comprador"]').forEach((cb) => {
    cb.checked = buyerIds.includes(cb.value);
  });
}

function getNewEventCompradores() {
  return [...document.querySelectorAll('input[name="ev_comprador"]:checked')].map((cb) => cb.value);
}

function openNewEventModal(dateStr = "") {
  populateNewEventSelects();
  document.getElementById("newEventEditId").value = "";
  document.getElementById("newEventModalTitle").textContent = "Novo Evento";
  document.getElementById("newEventModalSubtitle").textContent = "Preencha os dados do evento. Horário padrão calculado a partir das configurações.";
  document.getElementById("deleteNewEventButton").classList.add("hidden");
  document.getElementById("newEventRecorrenciaWrap").classList.remove("hidden");
  document.getElementById("newEventEditScopeWrap").classList.add("hidden");
  document.getElementById("newEventTitulo").value = "";
  document.getElementById("newEventData").value = dateStr ? isoToBr(dateStr) : isoToBr(todayIso());
  const _settings = getSettings();
  const _horaInicioDefault = "08:00";
  document.getElementById("newEventHoraInicio").value = _horaInicioDefault;
  document.getElementById("newEventHoraFim").value = addMinutesToTime(_horaInicioDefault, _settings.duracaoPadraoCompromissos);
  document.getElementById("newEventRecorrencia").value = "";
  document.getElementById("newEventObservacao").value = "";
  document.getElementById("newEventNota").value = "";
  document.getElementById("newEventRecorrenciaFimWrap").classList.add("hidden");
  clearFeedback(document.getElementById("newEventConflictWarning"));
  clearFeedback(document.getElementById("newEventFeriadoWarning"));
  setupDatePickerField("newEventData", "newEventDataNative", "newEventDataPickerButton");
  setupDatePickerField("newEventRecorrenciaFim", "newEventRecorrenciaFimNative", "newEventRecorrenciaFimPickerButton");
  const s = _settings;
  const defaultId = s.loggedBuyerId || s.activeBuyerId;
  setNewEventCompradores(defaultId ? [defaultId] : []);
  document.getElementById("newEventModal").showModal();
}

function openGenericEventDetail(occ) {
  if (!occ) return;
  populateNewEventSelects();
  document.getElementById("newEventEditId").value = occ.id;
  document.getElementById("newEventModalTitle").textContent = "Editar Evento";
  document.getElementById("newEventModalSubtitle").textContent = "Altere os dados e salve. Clique em Excluir para remover permanentemente.";
  document.getElementById("deleteNewEventButton").classList.remove("hidden");
  document.getElementById("newEventRecorrenciaWrap").classList.add("hidden");
  document.getElementById("newEventRecorrenciaFimWrap").classList.add("hidden");
  document.getElementById("newEventTitulo").value = occ.titulo ?? "";
  document.getElementById("newEventData").value = isoToBr(occ.data_prevista);
  const _horaInicioEdit = occ.hora_inicio ?? "08:00";
  document.getElementById("newEventHoraInicio").value = _horaInicioEdit;
  document.getElementById("newEventHoraFim").value = occ.hora_fim ?? addMinutesToTime(_horaInicioEdit, getSettings().duracaoPadraoCompromissos);
  document.getElementById("newEventCategoria").value = occ.categoria_id ?? "";
  setNewEventCompradores(occ.comprador_id ? [occ.comprador_id] : []);
  document.getElementById("newEventObservacao").value = occ.observacao ?? "";
  document.getElementById("newEventNota").value = occ.nota ?? "";
  // Escopo de edição/exclusão em massa — só aparece se a ocorrência pertence a uma série
  const scopeWrap = document.getElementById("newEventEditScopeWrap");
  const singleRadio = scopeWrap.querySelector('input[value="single"]');
  if (singleRadio) singleRadio.checked = true;
  if (occ.serie_id) {
    const irmas = (state.agenda ?? []).filter((o) => o.serie_id === occ.serie_id);
    const futuras = irmas.filter((o) => (o.data_prevista ?? "") >= (occ.data_prevista ?? ""));
    document.getElementById("newEventEditScopeFutureLabel").textContent = `Esta e as próximas (${futuras.length})`;
    document.getElementById("newEventEditScopeAllLabel").textContent = `Toda a série (${irmas.length})`;
    scopeWrap.classList.remove("hidden");
  } else {
    scopeWrap.classList.add("hidden");
  }
  clearFeedback(document.getElementById("newEventConflictWarning"));
  clearFeedback(document.getElementById("newEventFeriadoWarning"));
  setupDatePickerField("newEventData", "newEventDataNative", "newEventDataPickerButton");
  setupDatePickerField("newEventRecorrenciaFim", "newEventRecorrenciaFimNative", "newEventRecorrenciaFimPickerButton");
  document.getElementById("newEventModal").showModal();
}

function getEditScope() {
  const checked = document.querySelector('input[name="newEventEditScope"]:checked');
  return checked?.value || "single";
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
  const editId       = document.getElementById("newEventEditId").value.trim();
  const titulo       = document.getElementById("newEventTitulo").value.trim();
  const data         = brToIso(document.getElementById("newEventData").value);
  const horaInicio   = document.getElementById("newEventHoraInicio").value || null;
  const horaFim      = document.getElementById("newEventHoraFim").value || null;
  const categoriaId  = document.getElementById("newEventCategoria").value || null;
  const compradores  = getNewEventCompradores();
  const recorrencia  = editId ? "" : document.getElementById("newEventRecorrencia").value;
  const recFim       = brToIso(document.getElementById("newEventRecorrenciaFim").value);
  const observacao   = document.getElementById("newEventObservacao").value.trim() || null;
  const nota         = document.getElementById("newEventNota").value.trim() || null;
  const s            = getSettings();
  const feedbackEl   = document.getElementById("newEventConflictWarning");

  if (!titulo || !data) {
    setFeedback("Informe o título e a data do evento.", "error", feedbackEl);
    feedbackEl.classList.remove("hidden");
    return;
  }

  const feriadoWarningEl = document.getElementById("newEventFeriadoWarning");
  const feriadoNoDia = getFeriado(data);
  if (feriadoNoDia) {
    setFeedback(`⚠️ ${formatDate(data)} é feriado: "${feriadoNoDia.nome}". Revise a data antes de salvar.`, "warning", feriadoWarningEl);
    feriadoWarningEl.classList.remove("hidden");
  } else {
    feriadoWarningEl.classList.add("hidden");
  }

  const hasConflict = await checkEventConflict(s.tenantId, data, horaInicio, horaFim, editId || null);
  if (hasConflict) {
    setFeedback("Atenção: existe outro evento no mesmo horário nesta data.", "warning", feedbackEl);
    feedbackEl.classList.remove("hidden");
  } else {
    feedbackEl.classList.add("hidden");
  }

  const saveBtn = document.getElementById("saveNewEventButton");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Salvando..."; }
  try {
    if (editId) {
      // — EDIÇÃO: PATCH na(s) ocorrência(s) existente(s) —
      const scope = getEditScope();
      if (scope === "single") {
        const buyerId = compradores[0] ?? null;
        await fetchSupabase(`/rest/v1/agenda_ocorrencias?id=eq.${editId}&tenant_id=eq.${s.tenantId}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: {
            titulo,
            data_prevista: data,
            hora_inicio: horaInicio,
            hora_fim: horaFim,
            categoria_id: categoriaId,
            comprador_id: buyerId,
            observacao,
            nota,
          },
        });
        setFeedback("Evento atualizado com sucesso.", "success");
      } else {
        // Massa: precisa do serie_id e (para "future") da data da ocorrência sendo editada
        const occAtual = (state.agenda ?? []).find((o) => o.id === editId);
        const serieId = occAtual?.serie_id;
        if (!serieId) {
          throw new Error("Esta ocorrência não pertence a uma série — só pode ser editada individualmente.");
        }
        let url = `/rest/v1/agenda_ocorrencias?serie_id=eq.${serieId}&tenant_id=eq.${s.tenantId}`;
        if (scope === "future") {
          url += `&data_prevista=gte.${occAtual.data_prevista}`;
        }
        // Edição em massa NÃO replica: data_prevista (cada uma tem a sua), nota
        // (post-it ad-hoc), comprador_id (intencional — para trocar carteira,
        // edita uma por vez).
        await fetchSupabase(url, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: {
            titulo,
            hora_inicio: horaInicio,
            hora_fim: horaFim,
            categoria_id: categoriaId,
            observacao,
          },
        });
        const irmas = (state.agenda ?? []).filter((o) => o.serie_id === serieId);
        const afetadas = scope === "all"
          ? irmas.length
          : irmas.filter((o) => (o.data_prevista ?? "") >= (occAtual.data_prevista ?? "")).length;
        setFeedback(`${afetadas} ocorrência(s) da série atualizadas.`, "success");
      }
    } else {
      // — CRIAÇÃO: POST (multi-comprador × recorrência) —
      const dates = recorrencia ? [data, ...buildRecorrenciaDates(data, recorrencia, recFim)] : [data];
      const buyerIds = compradores.length > 0 ? compradores : [null];
      const total = dates.length * buyerIds.length;
      // serie_id agrupa todas as ocorrências criadas neste "Novo Evento" para
      // permitir edição/exclusão em massa. Só faz sentido quando total > 1.
      const serieId = total > 1 && typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : null;
      const base = {
        tenant_id: s.tenantId,
        titulo,
        data_prevista: data,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        categoria_id: categoriaId,
        observacao,
        nota,
        status: "PENDENTE",
        recorrencia: recorrencia ? JSON.stringify({ tipo: recorrencia, fim: recFim || null }) : null,
        serie_id: serieId,
      };
      // Nota é post-it: grava apenas na 1ª ocorrência (1ª data × 1º comprador);
      // demais ficam com nota=null para não poluir o Painel de Notas.
      let isFirstOccurrence = true;
      for (const d of dates) {
        for (const buyerId of buyerIds) {
          await fetchSupabase("/rest/v1/agenda_ocorrencias", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: { ...base, data_prevista: d, comprador_id: buyerId, nota: isFirstOccurrence ? base.nota : null },
          });
          isFirstOccurrence = false;
        }
      }
      setFeedback(
        total > 1
          ? `${total} evento(s) criado(s)${buyerIds.length > 1 ? ` para ${buyerIds.length} comprador(es)` : ""}${dates.length > 1 ? `, ${dates.length} datas (${recorrencia})` : ""}.`
          : "Evento criado com sucesso.",
        "success"
      );
    }
    closeModal("newEventModal");
    await loadPortalData({ silent: true });
    refreshCalendar();
  } catch (err) {
    setFeedback(`Não foi possível salvar o evento: ${err.message}`, "error", feedbackEl);
    feedbackEl.classList.remove("hidden");
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Salvar Evento"; }
  }
}

async function deleteGenericEvent() {
  const editId = document.getElementById("newEventEditId").value.trim();
  if (!editId) return;
  const titulo = document.getElementById("newEventTitulo").value.trim() || "este evento";
  const scope = getEditScope();
  const s = getSettings();
  const occAtual = (state.agenda ?? []).find((o) => o.id === editId);

  let mensagem;
  let idsParaRemover;
  let url;
  if (scope === "single" || !occAtual?.serie_id) {
    mensagem = `Excluir "${titulo}"? Esta ação não pode ser desfeita.`;
    idsParaRemover = new Set([editId]);
    url = `/rest/v1/agenda_ocorrencias?id=eq.${editId}&tenant_id=eq.${s.tenantId}`;
  } else {
    const serieId = occAtual.serie_id;
    const irmas = (state.agenda ?? []).filter((o) => o.serie_id === serieId);
    const alvo = scope === "all"
      ? irmas
      : irmas.filter((o) => (o.data_prevista ?? "") >= (occAtual.data_prevista ?? ""));
    if (alvo.length === 0) return;
    mensagem = scope === "all"
      ? `Excluir TODA a série "${titulo}" (${alvo.length} ocorrência(s))? Esta ação não pode ser desfeita.`
      : `Excluir "${titulo}" e as próximas ocorrências da série (${alvo.length} no total, a partir de ${isoToBr(occAtual.data_prevista)})? Esta ação não pode ser desfeita.`;
    idsParaRemover = new Set(alvo.map((o) => o.id));
    url = `/rest/v1/agenda_ocorrencias?serie_id=eq.${serieId}&tenant_id=eq.${s.tenantId}`;
    if (scope === "future") url += `&data_prevista=gte.${occAtual.data_prevista}`;
  }

  if (!confirm(mensagem)) return;
  try {
    await fetchSupabase(url, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    state.agenda = state.agenda.filter((o) => !idsParaRemover.has(o.id));
    closeModal("newEventModal");
    setFeedback(idsParaRemover.size > 1 ? `${idsParaRemover.size} ocorrência(s) excluída(s).` : "Evento excluído.", "success");
    refreshCalendar();
    renderTables();
  } catch (err) {
    setFeedback(`Não foi possível excluir o evento: ${err.message}`, "error");
  }
}

// ============================================================
// BOOTSTRAP
// ============================================================

async function bootstrap() {
  // Se vier com #access_token de convite/recuperação, redireciona para instalar.html
  const hashStr = window.location.hash.slice(1);
  const hashParams = Object.fromEntries(
    hashStr.split("&").map((p) => p.split("=")).filter(([k]) => k).map(([k, v]) => [k, decodeURIComponent(v ?? "")])
  );
  if (hashParams["access_token"] && (hashParams["type"] === "recovery" || hashParams["type"] === "invite")) {
    window.location.replace("/instalar.html" + window.location.hash);
    return;
  }

  // Processa parâmetros de URL (vindos do "Abrir Portal" no admin)
  // Usa sessionStorage para isolar por aba — não contamina outras abas abertas
  const urlParams = new URLSearchParams(window.location.search);
  const urlJwt = urlParams.get("jwt");
  const urlTenantId = urlParams.get("tenant_id");
  if (urlJwt && urlJwt !== "null" && urlTenantId) {
    sessionStorage.setItem(storageKeys.jwt, urlJwt);
    sessionStorage.setItem(storageKeys.tenantId, urlTenantId);
    sessionStorage.setItem(storageKeys.loggedPortalRole, "admin_portal");
    // Grava '' em vez de removeItem — evita fallthrough para localStorage com dados de outra sessão
    sessionStorage.setItem(storageKeys.loggedBuyerId, "");
    sessionStorage.setItem(storageKeys.loggedPortalEmail, "");
    history.replaceState(null, "", window.location.pathname);
  }

  // Limpeza forçada de sessão — ?limpar=1 na URL
  if (new URLSearchParams(window.location.search).get("limpar") === "1") {
    [storageKeys.jwt, storageKeys.refreshToken, storageKeys.tenantId,
     storageKeys.loggedBuyerId, storageKeys.activeBuyerId,
     storageKeys.loggedPortalRole, storageKeys.loggedPortalEmail,
     "agenda_cliente_logo_url"].forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    history.replaceState(null, "", window.location.pathname);
    window.location.href = window.location.pathname;
    return;
  }

  applyTheme();
  initSidebarState();
  renderSupplierDayCheckboxes([]);
  populateSettings();
  bindStaticEvents();
  resetBuyerForm();
  resetSupplierForm();
  showSection("calendario");

  const hasJwt = !!_store(storageKeys.jwt);
  const hasTenant = !!_store(storageKeys.tenantId);

  if (hasJwt && hasTenant) {
    await loadCategorias();
    await loadPortalData({ silent: true });
    ensureBuyerSelection();
    renderTables();
    renderCategoriasTable();
    refreshCalendar();
    ensureBuyerLoginSession();
  } else {
    if (hasTenant) {
      await loadClientMetaOnly();
    }
    openBuyerLoginModal();
  }
  // Renova o JWT automaticamente a cada 50 min (expira em 60 min no Supabase)
  setInterval(refreshJWT, 50 * 60 * 1000);
}

bootstrap();

// PWA install prompt
(function () {
  let deferredPrompt = null;

  function detectBrowser() {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    if (/Edg\//.test(ua)) return 'edge';
    if (/Chrome/.test(ua)) return 'chrome';
    if (/Firefox/.test(ua)) return 'firefox';
    return 'other';
  }

  function renderInstructions() {
    const el = document.getElementById('pwaModalInstructions');
    if (!el) return;
    const browser = detectBrowser();
    const row = (icon, text) =>
      `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #1e293b;">
        <span style="font-size:18px;flex-shrink:0;">${icon}</span>
        <span style="font-size:13px;color:#cbd5e1;line-height:1.5;">${text}</span>
      </div>`;

    if (browser === 'ios') {
      el.innerHTML =
        `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">iPhone / iPad — Safari</p>` +
        row('⎙', 'Toque no botão <strong style="color:#f1f5f9;">Compartilhar</strong> na barra inferior do Safari') +
        row('➕', 'Toque em <strong style="color:#f1f5f9;">"Adicionar à Tela de Início"</strong>') +
        row('✅', 'Confirme tocando em <strong style="color:#f1f5f9;">"Adicionar"</strong>');
    } else if (browser === 'edge') {
      el.innerHTML =
        `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Microsoft Edge</p>` +
        row('⋯', 'Clique no menu <strong style="color:#f1f5f9;">⋯</strong> (três pontos) no canto superior direito') +
        row('📱', 'Clique em <strong style="color:#f1f5f9;">Aplicativos</strong> → <strong style="color:#f1f5f9;">"Instalar este site como aplicativo"</strong>') +
        row('✅', 'Clique em <strong style="color:#f1f5f9;">"Instalar"</strong> na janela que aparecer');
    } else if (browser === 'chrome') {
      el.innerHTML =
        `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Google Chrome</p>` +
        row('⊕', 'Clique no ícone <strong style="color:#f1f5f9;">⊕</strong> na barra de endereço (canto direito)') +
        `<div style="padding:6px 0;text-align:center;font-size:12px;color:#64748b;">ou</div>` +
        row('⋮', 'Menu <strong style="color:#f1f5f9;">⋮</strong> → <strong style="color:#f1f5f9;">"Instalar Agenda de Compras"</strong>');
    } else {
      el.innerHTML =
        `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Como instalar</p>` +
        row('⊕', '<strong style="color:#f1f5f9;">Chrome / Edge:</strong> ícone ⊕ na barra de endereço → "Instalar"') +
        row('⎙', '<strong style="color:#f1f5f9;">iPhone/iPad:</strong> Compartilhar ⎙ → "Adicionar à Tela de Início"');
    }
  }

  function hidePwaModal() {
    const modal = document.getElementById('pwaModal');
    if (modal) modal.style.display = 'none';
  }

  window.showPwaInstallModal = function () {
    const modal = document.getElementById('pwaModal');
    if (!modal) return;
    const btn = document.getElementById('pwaModalInstall');
    if (btn) btn.style.display = deferredPrompt ? 'block' : 'none';
    renderInstructions();
    modal.style.display = 'flex';
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('pwaModalInstall');
    if (btn) btn.style.display = 'block';
    // Abre o modal automaticamente se o usuário ainda não instalou
    if (!localStorage.getItem('agenda_pwa_installed') && !isStandalone) {
      window.showPwaInstallModal();
    }
  });

  window.addEventListener('appinstalled', () => {
    localStorage.setItem('agenda_pwa_installed', '1');
    hidePwaModal();
    const installBtn = document.getElementById('pwaInstallNavBtn');
    if (installBtn) installBtn.style.display = 'none';
  });

  document.getElementById('pwaModalInstall')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') {
      localStorage.setItem('agenda_pwa_installed', '1');
      hidePwaModal();
      const installBtn = document.getElementById('pwaInstallNavBtn');
      if (installBtn) installBtn.style.display = 'none';
    }
  });

  document.getElementById('pwaModalDismiss')?.addEventListener('click', hidePwaModal);

  // Esconde o botão da sidebar se já estiver instalado (modo standalone)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (isStandalone) {
    const installBtn = document.getElementById('pwaInstallNavBtn');
    if (installBtn) installBtn.style.display = 'none';
  }
})();
