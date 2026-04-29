async function loadPortalData({ silent = false, preserveFeedback = false } = {}) {
  if (!silent) {
    setFeedback("Sincronizando o portal do cliente com o Supabase...", "info");
  }
  const settings = getSettings();
  try {
    await detectSupplierNotesColumn();
    const [tenantRows, clientRows, buyersRows, supplierRowsRaw, agendaRowsRaw, auditRows, feriadosRows] = await Promise.all([
      fetchSupabase(`/rest/v1/tenants?select=id,nome&id=eq.${settings.tenantId}&limit=1`),
      fetchSupabase(`/rest/v1/clientes?select=id,nome_fantasia,razao_social,email_responsavel,observacoes&tenant_id=eq.${settings.tenantId}&limit=1`),
      fetchSupabase(`/rest/v1/compradores?select=id,nome_comprador,telefone,email,foto_path,senha_hash&tenant_id=eq.${settings.tenantId}&order=nome_comprador.asc`),
      fetchSupabase(`/rest/v1/fornecedores?select=id,codigo_fornecedor,nome_fornecedor,data_primeiro_pedido,frequencia_revisao,parametro_estoque,lead_time_entrega,parametro_compra,comprador_id,compradores(nome_comprador),fornecedor_dias_compra(dia_semana)&tenant_id=eq.${settings.tenantId}&order=nome_fornecedor.asc`),
      fetchSupabase(`/rest/v1/agenda_ocorrencias?select=id,fornecedor_id,comprador_id,data_prevista,status,titulo,hora_inicio,hora_fim,categoria_id,nota&tenant_id=eq.${settings.tenantId}&status=eq.PENDENTE&order=data_prevista.asc`),
      fetchSupabase(`/rest/v1/agenda_ocorrencias?select=id,fornecedor_id,comprador_id,data_prevista,status,observacao,data_realizacao,created_at,updated_at&tenant_id=eq.${settings.tenantId}&order=updated_at.desc`),
      fetchSupabase(`/rest/v1/feriados?select=id,data,nome,tipo&tenant_id=eq.${settings.tenantId}&order=data.asc`),
    ]);

    const supplierRows = supplierRowsRaw.map(mapSupplier);
    let agendaRows = agendaRowsRaw;
    const createdSeeds = await backfillMissingPendingOccurrences(supplierRows, agendaRowsRaw);
    if (createdSeeds > 0) {
      agendaRows = await fetchSupabase(`/rest/v1/agenda_ocorrencias?select=id,fornecedor_id,comprador_id,data_prevista,status,titulo,hora_inicio,hora_fim,categoria_id,nota&tenant_id=eq.${settings.tenantId}&status=eq.PENDENTE&order=data_prevista.asc`);
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
    state.feriados = feriadosRows ?? [];

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

async function importSuppliersFromFile(fileOrObj) {
  if (!fileOrObj) return;
  // Aceita File nativo ou {text, name} do conversor Excel
  try {
    const text = fileOrObj.text !== undefined ? fileOrObj.text : await fileOrObj.text();
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
    refreshCalendar();
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
  document.getElementById("sidebarToggle")?.addEventListener("click", toggleSidebar);
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
  document.getElementById("auditPasswordForm").addEventListener("submit", (event) => {
    event.preventDefault();
    unlockAuditView();
  });
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
  // Modal de importação
  document.getElementById("abrirImportModalButton").addEventListener("click", () => {
    document.getElementById("importModal").style.display = "flex";
  });
  document.getElementById("fecharImportModal").addEventListener("click", () => {
    document.getElementById("importModal").style.display = "none";
  });
  document.getElementById("gerarExcelButton").addEventListener("click", gerarExcelFornecedores);
  document.getElementById("importFornecedoresButton").addEventListener("click", () => {
    document.getElementById("importFornecedorFile").click();
  });
  document.getElementById("importFornecedorFile").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    await importarArquivoFornecedores(file);
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

  // Calendário
  document.getElementById("newEventButton")?.addEventListener("click", () => openNewEventModal());
  document.getElementById("saveNewEventButton")?.addEventListener("click", saveNewEvent);
  document.getElementById("newEventRecorrencia")?.addEventListener("change", () => {
    const wrap = document.getElementById("newEventRecorrenciaFimWrap");
    const val = document.getElementById("newEventRecorrencia").value;
    wrap.classList.toggle("hidden", !val);
  });
  document.getElementById("newEventHoraInicio")?.addEventListener("change", () => {
    const inicio = document.getElementById("newEventHoraInicio").value;
    if (!inicio) return;
    const [h, m] = inicio.split(":").map(Number);
    const fim = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    document.getElementById("newEventHoraFim").value = fim;
  });

  // Categorias
  document.getElementById("categoriaForm")?.addEventListener("submit", saveCategoria);
  document.getElementById("resetCategoriaFormButton")?.addEventListener("click", () => {
    document.getElementById("categoriaForm").reset();
    document.getElementById("categoriaId").value = "";
    document.getElementById("categoriaFormMode").textContent = "Nova categoria";
  });
  document.getElementById("categoriaCor")?.addEventListener("input", () => {
    const cor = document.getElementById("categoriaCor").value;
    const preview = document.getElementById("categoriaCorPreview");
    if (preview) {
      preview.style.background = cor;
      preview.textContent = cor.toUpperCase();
    }
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  // Feriados
  document.getElementById("feriadoForm")?.addEventListener("submit", saveFeriado);
  document.getElementById("resetFeriadoFormButton")?.addEventListener("click", () => {
    document.getElementById("feriadoForm").reset();
    document.getElementById("feriadoId").value = "";
  });
  document.getElementById("baixarFeriadosButton")?.addEventListener("click", baixarFeriadosNacionais);
  setupDatePickerField("feriadoData", "feriadoDataNative", "feriadoDataPickerButton");
  populateFeriadoAnoSelect();
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

  // Tenta autenticação real via JWT (backend FastAPI)
  const { apiBaseUrl } = getSettings();
  if (apiBaseUrl) {
    try {
      const data = await fetchApi("/api/v1/auth/login", { body: { email, password } });
      localStorage.setItem(storageKeys.jwt, data.access_token);
      clearPortalSession();
      // Localiza o comprador pelo id retornado pela API
      const buyerFromApi = state.buyers.find((b) => b.id === data.comprador_id) ??
        state.buyers.find((b) => (b.email ?? "").toLowerCase() === email);
      if (buyerFromApi) {
        localStorage.setItem(storageKeys.loggedBuyerId, buyerFromApi.id);
        localStorage.setItem(storageKeys.activeBuyerId, buyerFromApi.id);
      }
      localStorage.setItem(storageKeys.loggedPortalRole, "buyer");
      localStorage.setItem(storageKeys.loggedPortalEmail, email);
      closeModal("buyerLoginModal");
      updateBuyerCard();
      renderTables();
      setFeedback("Comprador autenticado com sucesso.", "success");
      return;
    } catch {
      // Se a API falhar, cai no modo legado abaixo
    }
  }

  // Modo legado: compara senha em texto plano (sem JWT)
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

