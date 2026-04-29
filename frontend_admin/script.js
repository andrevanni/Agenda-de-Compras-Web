const storageKeys = {
  supabaseUrl: "agenda_admin_supabase_url",
  supabaseKey: "agenda_admin_supabase_key",
  adminToken: "agenda_admin_token",
  apiBaseUrl: "agenda_admin_api_base_url",
  theme: "agenda_ui_theme",
};

const defaults = {
  supabaseUrl: "https://fnwsorhflueunqzkwsxu.supabase.co",
  supabaseKey: "sb_publishable_ZvbYTFdj6maOJiJACFR5Zw_9xJrBuUB",
  apiBaseUrl: "https://agenda-de-compras-api.vercel.app",
};

const fallbackTenants = [
  { id: "c2f65634-b7e0-47f0-8937-94446540701a", nome: "Service Farma", created_at: "2026-02-25T20:00:00Z" },
];

const fallbackClientes = [
  {
    id: "cli-demo-001",
    razao_social: "Service Farma Tecnologia Ltda",
    nome_fantasia: "Service Farma",
    documento: "00.000.000/0001-00",
    email_responsavel: "andre@servicefarma.far.br",
    tenant_id: "c2f65634-b7e0-47f0-8937-94446540701a",
    observacoes: JSON.stringify({ audit_password: "service" }),
  },
];

const fallbackVigencias = [
  {
    id: "lic-demo-001",
    cliente_id: "cli-demo-001",
    plano: "premium",
    status: "ativo",
    data_inicio_vigencia: "2026-02-25",
    data_fim_vigencia: "2027-02-25",
    created_at: "2026-02-25T20:00:00Z",
  },
];

const versionHistory = [
  {
    version: "v0.1.0",
    date: "2026-04-07",
    title: "Base web integrada",
    notes: [
      "Portal do Cliente e Painel Administrativo separados.",
      "Supabase multi-cliente validado com clientes, vigências e bases operacionais.",
      "Auditoria inicial protegida por senha.",
    ],
  },
];

let tenants = structuredClone(fallbackTenants);
let clientes = structuredClone(fallbackClientes);
let vigencias = structuredClone(fallbackVigencias);
let feedbackTimer = null;

const supabaseUrlInput = document.getElementById("supabaseUrl");
const supabaseKeyInput = document.getElementById("supabaseKey");
const projectUrlLabel = document.getElementById("projectUrlLabel");
const feedbackBox = document.getElementById("feedbackBox");
const statsGrid = document.getElementById("statsGrid");
const clientesList = document.getElementById("clientesList");
const vigenciasList = document.getElementById("vigenciasList");
const tenantsList = document.getElementById("tenantsList");
const clientesCount = document.getElementById("clientesCount");
const vigenciasCount = document.getElementById("vigenciasCount");
const tenantsCount = document.getElementById("tenantsCount");
const tenantVinculado = document.getElementById("tenantVinculado");
const clienteLicenca = document.getElementById("clienteLicenca");
const conexaoSection = document.getElementById("conexaoSection");
const versionHistoryList = document.getElementById("versionHistoryList");

function getSettings() {
  return {
    supabaseUrl: localStorage.getItem(storageKeys.supabaseUrl) ?? defaults.supabaseUrl,
    supabaseKey: localStorage.getItem(storageKeys.supabaseKey) ?? defaults.supabaseKey,
    adminToken: localStorage.getItem(storageKeys.adminToken) ?? "",
    apiBaseUrl: localStorage.getItem(storageKeys.apiBaseUrl) ?? defaults.apiBaseUrl,
    theme: localStorage.getItem(storageKeys.theme) ?? "dark",
  };
}

async function fetchAdmin(path, options = {}) {
  const { apiBaseUrl, adminToken } = getSettings();
  if (!apiBaseUrl) throw new Error("URL do backend não configurada. Preencha em Conexão avançada.");
  if (!adminToken) throw new Error("Token admin não configurado. Preencha em Conexão avançada.");

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "X-Admin-Token": adminToken,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail ?? data.message ?? `HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text.trim() ? JSON.parse(text) : null;
}

function applyTheme(themeName = getSettings().theme) {
  document.body.dataset.theme = themeName;
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeChoice === themeName);
  });
}

function populateSettings() {
  const settings = getSettings();
  supabaseUrlInput.value = settings.supabaseUrl;
  supabaseKeyInput.value = settings.supabaseKey;
  const adminTokenInput = document.getElementById("adminToken");
  const apiBaseUrlInput = document.getElementById("apiBaseUrl");
  if (adminTokenInput) adminTokenInput.value = settings.adminToken;
  if (apiBaseUrlInput) apiBaseUrlInput.value = settings.apiBaseUrl;
  try {
    projectUrlLabel.textContent = new URL(settings.supabaseUrl).host;
  } catch {
    projectUrlLabel.textContent = settings.supabaseUrl;
  }
}

function clearFeedback() {
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
    feedbackTimer = null;
  }
  feedbackBox.textContent = "";
  feedbackBox.className = "feedback-box hidden";
}

function setFeedback(message, type = "info", autoHide = false) {
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
    feedbackTimer = null;
  }
  feedbackBox.textContent = message;
  feedbackBox.className = `feedback-box ${type}`;
  if (autoHide) {
    feedbackTimer = setTimeout(() => clearFeedback(), 3600);
  }
}

function buildUrl(path) {
  return `${getSettings().supabaseUrl}${path}`;
}

async function fetchSupabase(path, options = {}) {
  const settings = getSettings();
  const response = await fetch(buildUrl(path), {
    ...options,
    headers: {
      apikey: settings.supabaseKey,
      Authorization: `Bearer ${settings.supabaseKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message ?? data.details ?? `HTTP ${response.status}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

function isoToBr(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const [year, month, day] = text.slice(0, 10).split("-");
  if (!year || !month || !day) return text;
  return `${day}/${month}/${year}`;
}

function brToIso(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parts = text.split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map((item) => item.trim());
  if (!day || !month || !year) return null;
  return `${year.padStart(4, "20")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function syncNativeDateProxy(textInput, nativeInput) {
  if (!textInput || !nativeInput) return;
  nativeInput.value = brToIso(textInput.value) ?? "";
}

function setupDatePickerField(textInputId, nativeInputId, buttonId) {
  const textInput = document.getElementById(textInputId);
  const nativeInput = document.getElementById(nativeInputId);
  const button = document.getElementById(buttonId);
  let restoringFromPicker = false;

  if (!textInput || !nativeInput || !button || textInput.dataset.datePickerBound === "1") return;

  textInput.dataset.datePickerBound = "1";
  syncNativeDateProxy(textInput, nativeInput);

  const restoreTextFromIso = (isoValue) => {
    restoringFromPicker = true;
    textInput.type = "text";
    textInput.value = isoValue ? isoToBr(isoValue) : "";
    syncNativeDateProxy(textInput, nativeInput);
    window.setTimeout(() => {
      restoringFromPicker = false;
      textInput.dispatchEvent(new Event("change", { bubbles: true }));
    }, 0);
  };

  const openNativePicker = () => {
    const isoValue = brToIso(textInput.value);
    textInput.type = "date";
    textInput.value = isoValue || "";
    window.setTimeout(() => {
      if (typeof textInput.showPicker === "function") {
        textInput.showPicker();
      } else {
        textInput.focus();
        textInput.click();
      }
    }, 0);
  };

  textInput.addEventListener("change", () => {
    if (restoringFromPicker) return;
    if (textInput.type === "date") {
      restoreTextFromIso(textInput.value);
      return;
    }
    syncNativeDateProxy(textInput, nativeInput);
  });

  textInput.addEventListener("blur", () => {
    if (textInput.type === "date") {
      restoreTextFromIso(textInput.value);
      return;
    }
    syncNativeDateProxy(textInput, nativeInput);
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    openNativePicker();
  });

  nativeInput.addEventListener("change", () => {
    textInput.value = nativeInput.value ? isoToBr(nativeInput.value) : "";
    textInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function parseObservacoes(value) {
  if (!value) return {};
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildObservacoes(existingValue, updates) {
  return JSON.stringify({ ...parseObservacoes(existingValue), ...updates });
}

function clienteNome(clienteId) {
  return clientes.find((cliente) => cliente.id === clienteId)?.nome_fantasia ?? "Cliente não localizado";
}

function clientePorTenant(tenantId) {
  return clientes.find((item) => item.tenant_id === tenantId)?.nome_fantasia ?? "Sem cliente comercial";
}

function diasRestantesTexto(dataFim) {
  if (!dataFim) return "Sem fim definido";
  const dias = Math.ceil((new Date(`${dataFim}T00:00:00`) - new Date()) / 86400000);
  if (dias < 0) return `${Math.abs(dias)} dia(s) vencido(s)`;
  return `${dias} dia(s) restantes`;
}

function vigenciasPrincipais() {
  const byClient = new Map();
  vigencias.forEach((item) => {
    if (!item?.cliente_id) return;
    const existing = byClient.get(item.cliente_id);
    if (!existing) {
      byClient.set(item.cliente_id, item);
      return;
    }
    const currentDate = existing.data_fim_vigencia ?? existing.created_at ?? "";
    const nextDate = item.data_fim_vigencia ?? item.created_at ?? "";
    if (String(nextDate) > String(currentDate)) {
      byClient.set(item.cliente_id, item);
    }
  });
  return Array.from(byClient.values());
}

function renderStats() {
  const vigenciasUnicas = vigenciasPrincipais();
  const proximasVencendo = vigenciasUnicas.filter((item) => {
    if (!item.data_fim_vigencia) return false;
    const diff = (new Date(`${item.data_fim_vigencia}T00:00:00`) - new Date()) / 86400000;
    return diff >= 0 && diff <= 30;
  }).length;

  const stats = [
    ["Clientes", clientes.length, "Cadastro comercial separado da base operacional."],
    ["Vigências", vigenciasUnicas.length, "Controle de validade para uso da ferramenta."],
    ["Bases", tenants.length, "Bases operacionais conectadas ao sistema."],
    ["Vencendo", proximasVencendo, "Licenças com vencimento nos próximos 30 dias."],
  ];

  statsGrid.innerHTML = stats.map(([label, value, note]) => `
    <article>
      <span class="stat-label">${label}</span>
      <strong class="stat-value">${value}</strong>
      <div class="stat-note">${note}</div>
    </article>
  `).join("");
}

function renderVersionHistory() {
  if (!versionHistoryList) return;
  versionHistoryList.innerHTML = versionHistory.map((item) => `
    <article class="list-card">
      <div class="card-header">
        <div>
          <strong>${item.version}</strong>
          <p class="meta">${item.title}</p>
        </div>
        <span class="pill">${formatDate(item.date)}</span>
      </div>
      <div class="submeta">${item.notes.join(" ")}</div>
    </article>
  `).join("");
}

function renderClientes() {
  clientesCount.textContent = `${clientes.length} cliente(s) registrado(s).`;
  tenantVinculado.innerHTML = `<option value="">Selecione</option>${tenants.map((tenant) => `<option value="${tenant.id}">${tenant.nome ?? tenant.id}</option>`).join("")}`;
  clienteLicenca.innerHTML = `<option value="">Selecione</option>${clientes.map((cliente) => `<option value="${cliente.id}">${cliente.nome_fantasia ?? cliente.razao_social}</option>`).join("")}`;

  clientesList.innerHTML = clientes.map((cliente) => `
    <article class="data-card">
      <div>
        <div class="pill-row">
          <span class="pill">${cliente.tenant_id ? "Base operacional vinculada" : "Sem base vincululada"}</span>
          <span class="pill">${parseObservacoes(cliente.observacoes).audit_password ? "Auditoria protegida" : "Auditoria sem senha"}</span>
        </div>
        <h4>${cliente.nome_fantasia ?? cliente.razao_social}</h4>
        <p class="meta">${cliente.razao_social ?? "Razão social não informada"}</p>
        <p class="submeta">Documento: ${cliente.documento ?? "Não informado"} | E-mail: ${cliente.email_responsavel ?? "Não informado"}</p>
      </div>
      <div class="actions">
        <div class="submeta">${cliente.tenant_id ?? "Sem vinculação"}</div>
        <button class="secondary-button" type="button" data-audit-password-client="${cliente.id}">Senha da auditoria</button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-audit-password-client]").forEach((button) => {
    button.addEventListener("click", () => definirSenhaAuditoria(button.dataset.auditPasswordClient));
  });
}

function renderVigencias() {
  const vigenciasUnicas = vigenciasPrincipais();
  vigenciasCount.textContent = `${vigenciasUnicas.length} vigência(s) registrada(s).`;
  vigenciasList.innerHTML = vigenciasUnicas.map((licenca) => `
    <article class="data-card">
      <div>
        <div class="pill-row">
          <span class="pill ${licenca.status === "vencido" ? "danger" : licenca.status === "implantacao" ? "warning" : ""}">${licenca.status}</span>
          <span class="pill">${licenca.plano}</span>
        </div>
        <h4>${clienteNome(licenca.cliente_id)}</h4>
        <p class="meta">Início: ${licenca.data_inicio_vigencia ? formatDate(licenca.data_inicio_vigencia) : "Não informado"}</p>
        <p class="submeta">Fim: ${licenca.data_fim_vigencia ? formatDate(licenca.data_fim_vigencia) : "Não informado"}</p>
      </div>
      <div class="submeta">${diasRestantesTexto(licenca.data_fim_vigencia)}</div>
    </article>
  `).join("");
}

function renderTenants() {
  tenantsCount.textContent = `${tenants.length} base(s) operacional(is) encontrada(s).`;
  tenantsList.innerHTML = tenants.map((tenant) => `
    <article class="data-card">
      <div>
        <div class="pill-row">
          <span class="pill">${tenant.id}</span>
        </div>
        <h4>${tenant.nome ?? "Base sem nome"}</h4>
        <p class="meta">Criado em ${tenant.created_at ? formatDateTime(tenant.created_at) : "Não informado"}</p>
        <p class="submeta">${clientePorTenant(tenant.id)}</p>
      </div>
      <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button class="secondary-button" type="button" data-abrir-portal="${tenant.id}">🚀 Abrir Portal</button>
        <button class="secondary-button" type="button" data-enviar-convites="${tenant.id}">📧 Enviar Convites</button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-abrir-portal]").forEach((btn) => {
    btn.addEventListener("click", () => abrirPortal(btn.dataset.abrirPortal));
  });
  document.querySelectorAll("[data-enviar-convites]").forEach((btn) => {
    btn.addEventListener("click", () => listarCompradores(btn.dataset.enviarConvites));
  });
}

async function abrirPortal(tenantId) {
  try {
    setFeedback("Gerando acesso ao portal...", "info");
    const data = await fetchAdmin(`/api/v1/admin/abrir-portal/${tenantId}`, { method: "POST" });
    const url = `${window.location.origin}/?jwt=${encodeURIComponent(data.access_token)}&tenant_id=${encodeURIComponent(data.tenant_id)}`;
    window.open(url, "_blank");
    setFeedback("Portal aberto em nova aba.", "success", true);
  } catch (err) {
    setFeedback(`Não foi possível abrir o portal: ${err.message}`, "error");
  }
}

async function listarCompradores(tenantId) {
  try {
    const rows = await fetchSupabase(
      `/rest/v1/compradores?select=id,nome_comprador,email,user_id&tenant_id=eq.${tenantId}&order=nome_comprador.asc`
    );
    if (!rows?.length) { setFeedback("Nenhum comprador cadastrado nesta base.", "warning"); return; }

    const lista = rows.map((c) => `${c.nome_comprador} — ${c.email || "sem e-mail"} ${c.user_id ? "✅" : "⚠️ sem acesso"}`).join("\n");
    const escolha = window.prompt(
      `Compradores da base:\n${lista}\n\nDigite o e-mail do comprador para enviar convite (ou deixe vazio para cancelar):`
    );
    if (!escolha?.trim()) return;

    const comprador = rows.find((c) => (c.email ?? "").toLowerCase() === escolha.trim().toLowerCase());
    if (!comprador) { setFeedback("Comprador não encontrado.", "error"); return; }

    setFeedback(`Enviando convite para ${comprador.email}...`, "info");
    await fetchAdmin(`/api/v1/admin/compradores/${comprador.id}/enviar-convite`, { method: "POST" });
    setFeedback(`Convite enviado para ${comprador.email}.`, "success", true);
  } catch (err) {
    setFeedback(`Erro: ${err.message}`, "error");
  }
}

async function garantirSenhaAuditoriaInicial() {
  const clienteService = clientes.find((item) => (item.nome_fantasia ?? "").toLowerCase() === "service farma");
  if (!clienteService) return;
  const meta = parseObservacoes(clienteService.observacoes);
  if (meta.audit_password) return;

  await fetchSupabase(`/rest/v1/clientes?id=eq.${clienteService.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      observacoes: buildObservacoes(clienteService.observacoes, { audit_password: "service" }),
    }),
  });

  clienteService.observacoes = buildObservacoes(clienteService.observacoes, { audit_password: "service" });
}

async function loadAdminData() {
  try {
    tenants = await fetchSupabase("/rest/v1/tenants?select=id,nome,created_at&order=created_at.desc");
    try {
      clientes = await fetchSupabase("/rest/v1/clientes?select=*&order=created_at.desc");
      vigencias = await fetchSupabase("/rest/v1/clientes_licencas?select=*&order=created_at.desc");
      await garantirSenhaAuditoriaInicial();
      setFeedback("Painel administrativo carregado com sucesso.", "success", true);
    } catch (error) {
      clientes = structuredClone(fallbackClientes);
      vigencias = structuredClone(fallbackVigencias);
      setFeedback(`Base operacional carregada. Cadastro comercial e licenças ainda não encontrado no banco: ${error.message}`, "warning", true);
    }
  } catch (error) {
    tenants = structuredClone(fallbackTenants);
    clientes = structuredClone(fallbackClientes);
    vigencias = structuredClone(fallbackVigencias);
    setFeedback(`Não foi possível carregar do Supabase: ${error.message}`, "error");
  }

  renderStats();
  renderClientes();
  renderVigencias();
  renderTenants();
}

async function salvarCliente(event) {
  event.preventDefault();
  const senhaAuditoria = document.getElementById("senhaAuditoria").value.trim();
  const payload = {
    razao_social: document.getElementById("razaoSocial").value.trim(),
    nome_fantasia: document.getElementById("nomeFantasia").value.trim(),
    documento: document.getElementById("documento").value.trim() || null,
    email_responsavel: document.getElementById("emailResponsavel").value.trim() || null,
    tenant_id: document.getElementById("tenantVinculado").value || null,
    observacoes: senhaAuditoria ? buildObservacoes(null, { audit_password: senhaAuditoria }) : null,
  };

  if (!payload.razao_social || !payload.nome_fantasia) {
    setFeedback("Razão social e nome fantasia são obrigatórios.", "error");
    return;
  }

  try {
    await fetchSupabase("/rest/v1/clientes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    setFeedback("Cliente salvo com sucesso.", "success", true);
    event.target.reset();
    await loadAdminData();
  } catch (error) {
    setFeedback(`Não foi possível salvar o cliente: ${error.message}`, "error");
  }
}

async function definirSenhaAuditoria(clienteId) {
  const cliente = clientes.find((item) => item.id === clienteId);
  if (!cliente) {
    setFeedback("Cliente não localizado para ajuste da senha de auditoria.", "error");
    return;
  }

  const atual = parseObservacoes(cliente.observacoes).audit_password ?? "";
  const novaSenha = window.prompt(`Defina a senha da auditoria para ${cliente.nome_fantasia ?? cliente.razao_social}:`, atual || "service");
  if (novaSenha === null) return;

  const senhaLimpa = novaSenha.trim();
  if (!senhaLimpa) {
    setFeedback("A senha da auditoria não pode ficar vazia.", "error");
    return;
  }

  try {
    await fetchSupabase(`/rest/v1/clientes?id=eq.${clienteId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        observacoes: buildObservacoes(cliente.observacoes, { audit_password: senhaLimpa }),
      }),
    });
    setFeedback(`Senha da auditoria atualizada para ${cliente.nome_fantasia ?? cliente.razao_social}.`, "success", true);
    await loadAdminData();
  } catch (error) {
    setFeedback(`Não foi possível atualizar a senha da auditoria: ${error.message}`, "error");
  }
}

async function salvarVigencia(event) {
  event.preventDefault();
  const dataInicio = brToIso(document.getElementById("inicioVigencia").value);
  const dataFim = brToIso(document.getElementById("fimVigencia").value);
  const clienteId = document.getElementById("clienteLicenca").value || null;
  const payload = {
    cliente_id: clienteId,
    plano: document.getElementById("planoLicenca").value.trim() || "basico",
    data_inicio_vigencia: dataInicio,
    data_fim_vigencia: dataFim,
    status: document.getElementById("statusLicenca").value,
  };

  if (!payload.cliente_id) {
    setFeedback("Selecione um cliente para salvar a vigência.", "error");
    return;
  }
  if (document.getElementById("inicioVigencia").value && !dataInicio) {
    setFeedback("Informe a data de início no formato DD/MM/AAAA.", "error");
    return;
  }
  if (document.getElementById("fimVigencia").value && !dataFim) {
    setFeedback("Informe a data de fim no formato DD/MM/AAAA.", "error");
    return;
  }

  try {
    const existente = vigencias
      .filter((item) => item.cliente_id === clienteId)
      .sort((a, b) => String(b.data_fim_vigencia ?? b.created_at ?? "").localeCompare(String(a.data_fim_vigencia ?? a.created_at ?? "")))[0];

    if (existente?.id) {
      await fetchSupabase(`/rest/v1/clientes_licencas?id=eq.${existente.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(payload),
      });
      setFeedback("Vigência atualizada com sucesso.", "success", true);
    } else {
      await fetchSupabase("/rest/v1/clientes_licencas", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      setFeedback("Vigência salva com sucesso.", "success", true);
    }

    event.target.reset();
    await loadAdminData();
  } catch (error) {
    setFeedback(`Não foi possível salvar a vigência: ${error.message}`, "error");
  }
}

function showSection(section) {
  clearFeedback();
  document.querySelectorAll("[data-section]").forEach((item) => {
    item.classList.toggle("active", item.dataset.section === section);
  });
  document.getElementById("clientesSection").classList.toggle("hidden", section !== "clientes");
  document.getElementById("vigenciasSection").classList.toggle("hidden", section !== "vigencias");
  document.getElementById("tenantsSection").classList.toggle("hidden", section !== "tenants");
  conexaoSection.classList.toggle("hidden", section !== "conexao");
}

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => showSection(button.dataset.section));
});

document.querySelectorAll("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    localStorage.setItem(storageKeys.theme, button.dataset.themeChoice);
    applyTheme(button.dataset.themeChoice);
  });
});

document.getElementById("settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  localStorage.setItem(storageKeys.supabaseUrl, supabaseUrlInput.value.trim());
  localStorage.setItem(storageKeys.supabaseKey, supabaseKeyInput.value.trim());
  const adminTokenInput = document.getElementById("adminToken");
  const apiBaseUrlInput = document.getElementById("apiBaseUrl");
  if (adminTokenInput) localStorage.setItem(storageKeys.adminToken, adminTokenInput.value.trim());
  if (apiBaseUrlInput) localStorage.setItem(storageKeys.apiBaseUrl, apiBaseUrlInput.value.trim());
  populateSettings();
  setFeedback("Configuração administrativa salva.", "success", true);
});

document.getElementById("loadAdminDataButton").addEventListener("click", loadAdminData);
document.getElementById("toggleConnectionButton").addEventListener("click", () => {
  conexaoSection.classList.toggle("hidden");
  clearFeedback();
});
document.getElementById("clienteForm").addEventListener("submit", salvarCliente);
document.getElementById("vigenciaForm").addEventListener("submit", salvarVigencia);
document.getElementById("resetClienteFormButton").addEventListener("click", () => document.getElementById("clienteForm").reset());
document.getElementById("resetVigenciaFormButton").addEventListener("click", () => document.getElementById("vigenciaForm").reset());

setupDatePickerField("inicioVigencia", "inicioVigenciaNative", "inicioVigenciaPickerButton");
setupDatePickerField("fimVigencia", "fimVigenciaNative", "fimVigenciaPickerButton");

applyTheme();
populateSettings();
showSection("clientes");
renderVersionHistory();
loadAdminData();
