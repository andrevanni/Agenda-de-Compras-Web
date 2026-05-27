const storageKeys = {
  supabaseUrl: "agenda_admin_supabase_url",
  supabaseKey: "agenda_admin_supabase_key",
  adminToken: "agenda_admin_token",
  adminJwt: "agenda_admin_jwt",
  adminEmail: "agenda_admin_email",
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
    version: "v0.4.0",
    date: "2026-04-28",
    title: "Deploy completo + painel admin reorganizado",
    notes: [
      "Três projetos Vercel independentes: portal cliente, painel admin e backend API.",
      "Backend FastAPI deployado no Vercel com endpoints de auth, convites e abrir-portal.",
      "Página de instalação disponível em /instalar.html no portal do cliente.",
      "Painel admin reorganizado: nova ordem lógica (Base Operacional → Clientes → Vigências → Ajuda → Conexão).",
      "Seção de Ajuda com acordeão e guias de uso para administradores.",
      "Fixes de RLS no Supabase: tenants, clientes, clientes_licencas e categorias_agenda.",
    ],
  },
  {
    version: "v0.3.0",
    date: "2026-04-15",
    title: "Auth JWT, convites e página de instalação",
    notes: [
      "Login com e-mail e senha via Supabase Auth (JWT) para compradores.",
      "Fluxo de convite: admin envia e-mail → comprador define senha → acessa portal.",
      "Página de instalação com guia de PWA para Chrome, Edge e Safari.",
      "Backend: endpoints /auth/login, /auth/definir-senha, /admin/compradores/{id}/enviar-convite.",
      "Schema v7: campo user_id em compradores + tabela tenant_licencas.",
    ],
  },
  {
    version: "v0.2.0",
    date: "2026-04-10",
    title: "Calendário, categorias e painel de notas",
    notes: [
      "Calendário FullCalendar v6 com views mensal, semanal e diária.",
      "Categorias de agenda por tenant com cores personalizáveis.",
      "Painel de notas: post-its por comprador com notas das ocorrências.",
      "Sidebar recolhível com scroll e configuração de dias da semana.",
      "Schema v5: categorias_agenda + campos hora_inicio, hora_fim, titulo, categoria_id, recorrencia.",
      "Schema v6: campo nota em agenda_ocorrencias.",
      "PWA: manifest.json + service worker para instalação no desktop.",
    ],
  },
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
    adminJwt: localStorage.getItem(storageKeys.adminJwt) ?? "",
    adminEmail: localStorage.getItem(storageKeys.adminEmail) ?? "",
    apiBaseUrl: localStorage.getItem(storageKeys.apiBaseUrl) ?? defaults.apiBaseUrl,
    theme: localStorage.getItem(storageKeys.theme) ?? "dark",
  };
}

// --- Auth ---

function showLoginScreen(errorMsg = "") {
  const screen = document.getElementById("loginScreen");
  if (screen) screen.style.display = "flex";
  document.querySelector(".page-shell").style.display = "none";
  if (errorMsg) {
    const el = document.getElementById("loginError");
    if (el) { el.textContent = errorMsg; el.style.display = "block"; }
  }
}

function decodeJwtEmail(jwt) {
  if (!jwt) return "";
  try {
    const b64 = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return payload.email || "";
  } catch {
    return "";
  }
}

function hideLoginScreen() {
  const screen = document.getElementById("loginScreen");
  if (screen) screen.style.display = "none";
  document.querySelector(".page-shell").style.display = "";
  if (!getSettings().adminEmail) {
    const email = decodeJwtEmail(getSettings().adminJwt);
    if (email) localStorage.setItem(storageKeys.adminEmail, email);
  }
  const emailEl = document.getElementById("loggedAdminEmail");
  if (emailEl) emailEl.textContent = getSettings().adminEmail;
}

function logout() {
  localStorage.removeItem(storageKeys.adminJwt);
  localStorage.removeItem(storageKeys.adminEmail);
  showLoginScreen();
}

async function adminLogin(email, password) {
  const { apiBaseUrl } = getSettings();
  const response = await fetch(`${apiBaseUrl}/api/v1/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail ?? `HTTP ${response.status}`);
  return data;
}

async function fetchAdmin(path, options = {}) {
  const { apiBaseUrl, adminJwt, adminToken } = getSettings();
  if (!apiBaseUrl) throw new Error("URL do backend não configurada. Preencha em Conexão avançada.");
  if (!adminJwt && !adminToken) {
    showLoginScreen();
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const authHeader = adminJwt
    ? { "Authorization": `Bearer ${adminJwt}` }
    : { "X-Admin-Token": adminToken };

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem(storageKeys.adminJwt);
    showLoginScreen("Sessão expirada. Faça login novamente.");
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail ?? `HTTP ${response.status}`);
  }

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
      <ul class="version-notes">
        ${item.notes.map((note) => `<li>${note}</li>`).join("")}
      </ul>
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
  const emailLogTenantSelect = document.getElementById("emailLogTenant");
  if (emailLogTenantSelect) {
    emailLogTenantSelect.innerHTML = `<option value="">Todas</option>${tenants.map((t) => `<option value="${t.id}">${t.nome ?? t.id}</option>`).join("")}`;
  }
  tenantsList.innerHTML = tenants.map((tenant) => {
    const ativo = Boolean(tenant.envio_relatorio_ativo);
    return `
    <article class="data-card">
      <div>
        <div class="pill-row">
          <span class="pill">${tenant.id}</span>
        </div>
        <h4>${tenant.nome ?? "Base sem nome"}</h4>
        <p class="meta">Criado em ${tenant.created_at ? formatDateTime(tenant.created_at) : "Não informado"}</p>
        <p class="submeta">${clientePorTenant(tenant.id)}</p>
        <label style="display:inline-flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;font-size:13px;">
          <input type="checkbox" data-toggle-relatorio="${tenant.id}" ${ativo ? "checked" : ""}
            style="width:16px;height:16px;cursor:pointer;">
          <span style="color:${ativo ? "#10b981" : "#94a3b8"};">
            ${ativo ? "✅ Envio de relatório diário ativo" : "⬜ Envio de relatório diário desativado"}
          </span>
        </label>
      </div>
      <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button class="secondary-button" type="button" data-abrir-portal="${tenant.id}">🚀 Abrir Portal</button>
        <button class="secondary-button" type="button" data-enviar-convites="${tenant.id}">📧 Enviar Convites</button>
      </div>
    </article>`;
  }).join("");

  document.querySelectorAll("[data-abrir-portal]").forEach((btn) => {
    btn.addEventListener("click", () => abrirPortal(btn.dataset.abrirPortal));
  });
  document.querySelectorAll("[data-enviar-convites]").forEach((btn) => {
    btn.addEventListener("click", () => listarCompradores(btn.dataset.enviarConvites));
  });
  document.querySelectorAll("[data-toggle-relatorio]").forEach((chk) => {
    chk.addEventListener("change", () => toggleRelatorioAtivo(chk.dataset.toggleRelatorio, chk.checked, chk));
  });
}

async function toggleRelatorioAtivo(tenantId, ativo, chkEl) {
  const label = chkEl.nextElementSibling;
  chkEl.disabled = true;
  try {
    await fetchSupabase(`/rest/v1/tenants?id=eq.${tenantId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ envio_relatorio_ativo: ativo }),
    });
    const t = tenants.find((t) => t.id === tenantId);
    if (t) t.envio_relatorio_ativo = ativo;
    if (label) {
      label.textContent = ativo ? "✅ Envio de relatório diário ativo" : "⬜ Envio de relatório diário desativado";
      label.style.color = ativo ? "#10b981" : "#94a3b8";
    }
    setFeedback(`Relatório diário ${ativo ? "ativado" : "desativado"} para "${tenants.find((t) => t.id === tenantId)?.nome ?? tenantId}".`, "success", true);
  } catch (err) {
    chkEl.checked = !ativo;
    setFeedback(`Erro ao atualizar: ${err.message}`, "error");
  } finally {
    chkEl.disabled = false;
  }
}

const PORTAL_CLIENT_URL = "https://agenda-compras-cliente.vercel.app";

async function abrirPortal(tenantId) {
  const tenantNome = tenants.find((t) => t.id === tenantId)?.nome ?? tenantId;
  const clienteNomeDisplay = clientePorTenant(tenantId);
  const label = clienteNomeDisplay !== "Sem cliente comercial" ? clienteNomeDisplay : tenantNome;

  // Abre janela ANTES do await para não ser bloqueada pelo popup blocker
  const nova = window.open("", "_blank");
  try {
    setFeedback(`Gerando acesso ao portal de "${label}"...`, "info");
    const data = await fetchAdmin(`/api/v1/admin/abrir-portal/${tenantId}`, { method: "POST" });
    const url = `${PORTAL_CLIENT_URL}/?jwt=${encodeURIComponent(data.access_token)}&tenant_id=${encodeURIComponent(data.tenant_id)}`;
    if (nova && !nova.closed) {
      nova.location.href = url;
      nova.focus();
      setFeedback(`Portal de "${label}" aberto em nova aba.`, "success");
    } else {
      setFeedback(`Portal de "${label}" gerado. Acesse: <a href="${url}" target="_blank">clique aqui</a>`, "success");
    }
  } catch (err) {
    if (nova && !nova.closed) nova.close();
    setFeedback(`Não foi possível abrir o portal de "${label}": ${err.message}`, "error");
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
    tenants = await fetchSupabase("/rest/v1/tenants?select=id,nome,created_at,envio_relatorio_ativo&order=nome.asc");
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

async function criarTenant(event) {
  event.preventDefault();
  const nome = document.getElementById("tenantNome").value.trim();
  if (!nome) return;
  const slug = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  try {
    await fetchSupabase("/rest/v1/tenants", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ nome, slug }),
    });
    setFeedback(`Base operacional "${nome}" criada com sucesso.`, "success", true);
    document.getElementById("tenantForm").reset();
    await loadAdminData();
  } catch (err) {
    setFeedback(`Erro ao criar base: ${err.message}`, "error");
  }
}

async function uploadLogo(file) {
  const { supabaseUrl, supabaseKey } = getSettings();
  const ext = file.name.split(".").pop();
  const filename = `${Date.now()}.${ext}`;
  const resp = await fetch(`${supabaseUrl}/storage/v1/object/logos/${filename}`, {
    method: "POST",
    headers: {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": file.type,
      "x-upsert": "true",
    },
    body: file,
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.message || data.error || `HTTP ${resp.status}`);
  }
  return `${supabaseUrl}/storage/v1/object/public/logos/${filename}`;
}

async function salvarCliente(event) {
  event.preventDefault();
  const senhaAuditoria = document.getElementById("senhaAuditoria").value.trim();
  const logoFileInput = document.getElementById("logoFile");
  const logoStatus = document.getElementById("logoUploadStatus");
  const logoFile = logoFileInput?.files?.[0];

  let logoUrl = null;
  if (logoFile) {
    logoStatus.textContent = "Enviando logo...";
    try {
      logoUrl = await uploadLogo(logoFile);
      logoStatus.textContent = "✓ Logo enviada";
    } catch (err) {
      setFeedback(`Erro no upload da logo: ${err.message}`, "error");
      logoStatus.textContent = "";
      return;
    }
  }

  const meta = {};
  if (senhaAuditoria) meta.audit_password = senhaAuditoria;
  if (logoUrl) meta.logo_url = logoUrl;

  const payload = {
    razao_social: document.getElementById("razaoSocial").value.trim(),
    nome_fantasia: document.getElementById("nomeFantasia").value.trim(),
    documento: document.getElementById("documento").value.trim() || null,
    email_responsavel: document.getElementById("emailResponsavel").value.trim() || null,
    tenant_id: document.getElementById("tenantVinculado").value || null,
    observacoes: Object.keys(meta).length ? buildObservacoes(null, meta) : null,
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
    if (logoStatus) logoStatus.textContent = "";
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
  document.getElementById("adminsSection").classList.toggle("hidden", section !== "admins");
  document.getElementById("ajudaSection").classList.toggle("hidden", section !== "ajuda");
  document.getElementById("emaillogSection").classList.toggle("hidden", section !== "emaillog");
  document.getElementById("versoesSection").classList.toggle("hidden", section !== "versoes");
  conexaoSection.classList.toggle("hidden", section !== "conexao");
}

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => {
    showSection(button.dataset.section);
    if (button.dataset.section === "admins") loadAdmins();
    if (button.dataset.section === "emaillog") loadEmailLog();
    if (button.dataset.section === "versoes") loadVersoesAdmin();
  });
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
const MASTER_EMAIL = "andre@servicefarma.far.br";

function isMaster() {
  const email = getSettings().adminEmail || decodeJwtEmail(getSettings().adminJwt);
  return email === MASTER_EMAIL;
}

async function loadAdmins() {
  const list = document.getElementById("adminsList");
  const count = document.getElementById("adminsCount");
  const panel = document.getElementById("adminConvitePanel");
  if (!list) return;

  if (panel) panel.style.display = "";

  list.innerHTML = "<p style='color:#64748b;font-size:13px;'>Carregando...</p>";
  try {
    const admins = await fetchAdmin("/api/v1/admin/auth/admins");
    if (count) count.textContent = `${admins.length} admin(s) ativo(s)`;

    if (!admins.length) {
      list.innerHTML = "<p style='color:#64748b;font-size:13px;'>Nenhum administrador encontrado.</p>";
      return;
    }

    list.innerHTML = admins.map((a) => {
      const isSelf = a.email === getSettings().adminEmail;
      const isMasterUser = a.email === MASTER_EMAIL;
      const tag = isMasterUser ? "<span style='font-size:11px;background:#1e3a5f;color:#93c5fd;padding:2px 8px;border-radius:4px;margin-left:6px;'>master</span>" : "";
      const masterActions = !isMasterUser ? `
          <button class="secondary-button" style="font-size:12px;padding:5px 12px;" onclick="revogarAdmin('${a.id}','${a.email}')">Revogar acesso</button>
          <button class="secondary-button" style="font-size:12px;padding:5px 12px;color:#f87171;border-color:#7f1d1d;" onclick="excluirAdmin('${a.id}','${a.email}')">Excluir</button>` : "";
      const lastLogin = a.last_sign_in_at && a.last_sign_in_at !== "None"
        ? `Último login: ${new Date(a.last_sign_in_at).toLocaleDateString("pt-BR")}`
        : "Nunca acessou";
      return `<div class="card-item">
        <strong>${a.email}${tag}${isSelf ? " <span style='font-size:11px;color:#64748b;'>(você)</span>" : ""}</strong>
        <p class="small-copy">${lastLogin}</p>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button class="secondary-button" style="font-size:12px;padding:5px 12px;" onclick="editAdminReportSubs('${a.id}','${a.email}')">📧 Relatórios</button>
          ${masterActions}
        </div>
      </div>`;
    }).join("");
  } catch (err) {
    list.innerHTML = `<p style='color:#f87171;font-size:13px;'>${err.message}</p>`;
  }
}

async function revogarAdmin(userId, email) {
  if (!confirm(`Revogar acesso de ${email}?\nO usuário perderá o acesso ao painel, mas a conta permanece no Supabase.`)) return;
  try {
    await fetchAdmin(`/api/v1/admin/auth/admins/${userId}/revogar`, { method: "PATCH" });
    setFeedback(`Acesso de ${email} revogado.`, "success", true);
    loadAdmins();
  } catch (err) {
    setFeedback(`Erro: ${err.message}`, "error");
  }
}

async function excluirAdmin(userId, email) {
  if (!confirm(`Excluir permanentemente o admin ${email}?\nEsta ação não pode ser desfeita.`)) return;
  try {
    await fetchAdmin(`/api/v1/admin/auth/admins/${userId}`, { method: "DELETE" });
    setFeedback(`Admin ${email} excluído.`, "success", true);
    loadAdmins();
  } catch (err) {
    setFeedback(`Erro: ${err.message}`, "error");
  }
}

async function editAdminReportSubs(userId, adminEmail) {
  const existing = document.getElementById("reportSubsModal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "reportSubsModal";
  overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:center;justify-content:center;";

  const modal = document.createElement("div");
  modal.style.cssText = "background:#1e293b;border-radius:12px;padding:28px;width:440px;max-width:92vw;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.5);";
  modal.innerHTML = `
    <h3 style="margin:0 0 6px;font-size:15px;color:#f1f5f9;">📧 Relatórios — ${adminEmail}</h3>
    <p style="margin:0 0 18px;font-size:12px;color:#64748b;">Selecione os clientes cujos relatórios diários este admin receberá por e-mail.</p>
    <div id="reportSubsLoading" style="color:#64748b;font-size:13px;padding:8px 0;">Carregando...</div>
    <div id="reportSubsList" style="display:none;"></div>
    <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">
      <button class="secondary-button" style="font-size:13px;padding:7px 16px;" onclick="document.getElementById('reportSubsModal').remove()">Cancelar</button>
      <button id="reportSubsSave" class="secondary-button" style="font-size:13px;padding:7px 16px;display:none;background:#2563eb;color:#fff;border-color:#2563eb;" onclick="saveAdminReportSubs('${userId}','${adminEmail}')">Salvar</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  try {
    const currentSubs = await fetchAdmin(`/api/v1/admin/auth/report-subscriptions?admin_email=${encodeURIComponent(adminEmail)}`);
    const subSet = new Set(currentSubs || []);
    const loadingEl = document.getElementById("reportSubsLoading");
    const listEl = document.getElementById("reportSubsList");
    const saveBtn = document.getElementById("reportSubsSave");

    if (!tenants.length) {
      loadingEl.textContent = "Nenhuma base operacional encontrada. Carregue o painel primeiro.";
      return;
    }

    listEl.innerHTML = tenants.map((t) => `
      <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;margin-bottom:3px;"
             onmouseover="this.style.background='#334155'" onmouseout="this.style.background=''">
        <input type="checkbox" value="${t.id}" ${subSet.has(t.id) ? "checked" : ""}
               style="width:15px;height:15px;accent-color:#2563eb;cursor:pointer;">
        <span style="font-size:13px;color:#f1f5f9;">${t.nome ?? t.id}</span>
      </label>`).join("");

    loadingEl.style.display = "none";
    listEl.style.display = "block";
    saveBtn.style.display = "";
  } catch (err) {
    const loadingEl = document.getElementById("reportSubsLoading");
    if (loadingEl) loadingEl.textContent = `Erro: ${err.message}`;
  }
}

async function saveAdminReportSubs(userId, adminEmail) {
  const saveBtn = document.getElementById("reportSubsSave");
  const tenantIds = Array.from(
    document.querySelectorAll("#reportSubsList input[type=checkbox]:checked")
  ).map((c) => c.value);

  saveBtn.textContent = "Salvando...";
  saveBtn.disabled = true;

  try {
    await fetchAdmin(`/api/v1/admin/auth/report-subscriptions`, {
      method: "PUT",
      body: { admin_email: adminEmail, tenant_ids: tenantIds },
    });
    document.getElementById("reportSubsModal").remove();
    const label = tenantIds.length
      ? `${tenantIds.length} cliente(s) selecionado(s) para ${adminEmail}.`
      : `Inscrições removidas para ${adminEmail}.`;
    setFeedback(label, "success", true);
  } catch (err) {
    setFeedback(`Erro ao salvar: ${err.message}`, "error");
    saveBtn.textContent = "Salvar";
    saveBtn.disabled = false;
  }
}

document.getElementById("convidarAdminForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("adminConviteEmail").value.trim();
  const nome = document.getElementById("adminConviteNome").value.trim();
  const btn = e.target.querySelector("button[type=submit]");
  btn.textContent = "Enviando...";
  btn.disabled = true;
  try {
    await fetchAdmin("/api/v1/admin/auth/convidar", {
      method: "POST",
      body: { email, nome },
    });
    setFeedback(`Convite enviado para ${email}.`, "success", true);
    e.target.reset();
    loadAdmins();
  } catch (err) {
    setFeedback(`Erro: ${err.message}`, "error");
  } finally {
    btn.textContent = "Enviar convite";
    btn.disabled = false;
  }
});

// --- Email Log ---

const EMAIL_LOG_TIPO_LABEL = {
  auditoria: "Auditoria",
  agenda_proximo: "Agenda próximo dia",
  consolidado_gestor: "Consolidado gestor",
  convite: "Convite",
  admin_copia: "Cópia Admin",
};

async function loadEmailLog() {
  const body = document.getElementById("emailLogBody");
  const summary = document.getElementById("emailLogSummary");
  if (!body) return;

  const dias = document.getElementById("emailLogDias")?.value ?? "30";
  const tenantId = document.getElementById("emailLogTenant")?.value ?? "";

  body.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:#64748b;">Carregando...</td></tr>`;
  if (summary) summary.innerHTML = "";

  try {
    let path = `/api/v1/admin/email-log?dias=${dias}`;
    if (tenantId) path += `&tenant_id=${tenantId}`;

    const rows = await fetchAdmin(path);

    if (!rows || !rows.length) {
      body.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:#64748b;">Nenhum registro no período.</td></tr>`;
      return;
    }

    const total = rows.length;
    const enviados = rows.filter((r) => r.status === "enviado").length;
    const erros = rows.filter((r) => r.status === "erro").length;

    if (summary) {
      summary.innerHTML = [
        `<span style="background:#0f2a1a;color:#4ade80;border:1px solid #166534;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;">✅ ${enviados} enviado(s)</span>`,
        erros ? `<span style="background:#2d0a0a;color:#f87171;border:1px solid #7f1d1d;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;">❌ ${erros} erro(s)</span>` : "",
        `<span style="background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:20px;padding:4px 12px;font-size:12px;">Total: ${total}</span>`,
      ].join("");
    }

    body.innerHTML = rows.map((r) => {
      const statusChip = r.status === "enviado"
        ? `<span style="background:#0f2a1a;color:#4ade80;border:1px solid #166534;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600;">✅ Enviado</span>`
        : `<span style="background:#2d0a0a;color:#f87171;border:1px solid #7f1d1d;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600;" title="${r.erro_mensagem ?? ""}">❌ Erro</span>`;

      const createdAt = r.created_at
        ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(r.created_at))
        : "-";

      const dataRef = r.data_referencia ? isoToBr(r.data_referencia) : "-";
      const tipo = EMAIL_LOG_TIPO_LABEL[r.tipo] ?? r.tipo ?? "-";

      return `<tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:8px 12px;color:#94a3b8;white-space:nowrap;">${createdAt}</td>
        <td style="padding:8px 12px;color:#e2e8f0;">${r.tenant_nome ?? "-"}</td>
        <td style="padding:8px 12px;color:#e2e8f0;">${r.comprador_nome ?? "-"}</td>
        <td style="padding:8px 12px;color:#94a3b8;">${tipo}</td>
        <td style="padding:8px 12px;color:#94a3b8;white-space:nowrap;">${dataRef}</td>
        <td style="padding:8px 12px;color:#94a3b8;font-size:12px;">${r.email_destino ?? "-"}</td>
        <td style="padding:8px 12px;">${statusChip}</td>
      </tr>`;
    }).join("");
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:#f87171;">${err.message}</td></tr>`;
  }
}

document.getElementById("emailLogRefreshButton")?.addEventListener("click", loadEmailLog);
document.getElementById("emailLogDias")?.addEventListener("change", loadEmailLog);
document.getElementById("emailLogTenant")?.addEventListener("change", loadEmailLog);

// ============================================================
// Notas de Versão — destinatários + disparo por email
// ============================================================

function escapeHtmlAdmin(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

async function loadVersoesAdmin() {
  await Promise.all([loadVersoesLista(), loadVersoesDestinatarios()]);
}

async function loadVersoesLista() {
  const container = document.getElementById("versoesAdminLista");
  if (!container) return;
  container.innerHTML = `<p style="color:#64748b;padding:12px;">Carregando versões...</p>`;
  try {
    const versoes = await fetchAdmin("/api/v1/admin/versoes/list");
    if (!versoes.length) {
      container.innerHTML = `<p style="color:#64748b;padding:12px;">Nenhuma versão registrada no código.</p>`;
      return;
    }
    container.innerHTML = versoes.map((v) => {
      const notasHtml = (v.notas || []).map((n) => `<li style="margin-bottom:4px;line-height:1.45;color:#cbd5e1;">${escapeHtmlAdmin(n)}</li>`).join("");
      return `
        <article style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 18px;">
          <header style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-family:ui-monospace,monospace;font-size:14px;font-weight:700;color:#f1f5f9;background:#0f172a;padding:3px 10px;border-radius:5px;border:1px solid #334155;">${escapeHtmlAdmin(v.versao)}</span>
              <span style="font-size:12px;color:#94a3b8;">${escapeHtmlAdmin(v.dataHora)}</span>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="secondary-button" type="button" data-disparar-versao="${escapeHtmlAdmin(v.versao)}">📨 Enviar email</button>
              <button class="secondary-button" type="button" data-historico-versao="${escapeHtmlAdmin(v.versao)}">📋 Histórico</button>
            </div>
          </header>
          <ul style="margin:0;padding-left:20px;">${notasHtml}</ul>
          <div data-historico-container="${escapeHtmlAdmin(v.versao)}" style="margin-top:10px;"></div>
        </article>
      `;
    }).join("");
    container.querySelectorAll("[data-disparar-versao]").forEach((btn) => {
      btn.addEventListener("click", () => dispararVersao(btn.dataset.dispararVersao, btn));
    });
    container.querySelectorAll("[data-historico-versao]").forEach((btn) => {
      btn.addEventListener("click", () => toggleHistoricoVersao(btn.dataset.historicoVersao));
    });
  } catch (err) {
    container.innerHTML = `<p style="color:#f87171;padding:12px;">Erro: ${err.message}</p>`;
  }
}

async function loadVersoesDestinatarios() {
  const container = document.getElementById("destinatariosLista");
  if (!container) return;
  container.innerHTML = `<p style="color:#64748b;padding:6px;">Carregando...</p>`;
  try {
    const dests = await fetchAdmin("/api/v1/admin/versoes/destinatarios");
    if (!dests.length) {
      container.innerHTML = `<p style="color:#64748b;padding:6px;font-size:13px;">Nenhum destinatário cadastrado ainda.</p>`;
      return;
    }
    container.innerHTML = dests.map((d) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#1e293b;border:1px solid #334155;border-radius:8px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8;cursor:pointer;">
          <input type="checkbox" data-toggle-destinatario="${d.id}" ${d.ativo ? "checked" : ""}> Ativo
        </label>
        <strong style="color:#f1f5f9;font-size:13px;">${escapeHtmlAdmin(d.email)}</strong>
        ${d.nome ? `<span style="color:#94a3b8;font-size:12px;">— ${escapeHtmlAdmin(d.nome)}</span>` : ""}
        <button class="secondary-button" type="button" data-excluir-destinatario="${d.id}" style="margin-left:auto;padding:4px 10px;font-size:11px;">Excluir</button>
      </div>
    `).join("");
    container.querySelectorAll("[data-toggle-destinatario]").forEach((cb) => {
      cb.addEventListener("change", () => toggleDestinatarioAtivo(cb.dataset.toggleDestinatario, cb.checked));
    });
    container.querySelectorAll("[data-excluir-destinatario]").forEach((btn) => {
      btn.addEventListener("click", () => excluirDestinatario(btn.dataset.excluirDestinatario));
    });
  } catch (err) {
    container.innerHTML = `<p style="color:#f87171;padding:6px;">Erro: ${err.message}</p>`;
  }
}

async function adicionarDestinatario() {
  const emailEl = document.getElementById("novoDestinatarioEmail");
  const nomeEl = document.getElementById("novoDestinatarioNome");
  const email = (emailEl.value || "").trim();
  const nome = (nomeEl.value || "").trim();
  if (!email) { setFeedback("Informe um e-mail.", "error"); return; }
  try {
    await fetchAdmin("/api/v1/admin/versoes/destinatarios", {
      method: "POST",
      body: { email, nome: nome || null },
    });
    emailEl.value = "";
    nomeEl.value = "";
    setFeedback("Destinatário cadastrado.", "success");
    loadVersoesDestinatarios();
  } catch (err) {
    setFeedback(`Erro ao cadastrar: ${err.message}`, "error");
  }
}

async function toggleDestinatarioAtivo(id, ativo) {
  try {
    await fetchAdmin(`/api/v1/admin/versoes/destinatarios/${id}`, {
      method: "PATCH",
      body: { ativo },
    });
  } catch (err) {
    setFeedback(`Erro: ${err.message}`, "error");
    loadVersoesDestinatarios();
  }
}

async function excluirDestinatario(id) {
  if (!confirm("Excluir este destinatário?")) return;
  try {
    await fetchAdmin(`/api/v1/admin/versoes/destinatarios/${id}`, { method: "DELETE" });
    setFeedback("Destinatário excluído.", "success");
    loadVersoesDestinatarios();
  } catch (err) {
    setFeedback(`Erro: ${err.message}`, "error");
  }
}

async function dispararVersao(versao, btn) {
  if (!confirm(`Enviar o changelog da ${versao} para todos os destinatários ativos?`)) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Enviando...";
  try {
    const r = await fetchAdmin(`/api/v1/admin/versoes/${encodeURIComponent(versao)}/disparar`, { method: "POST" });
    setFeedback(`${versao}: enviados ${r.sent}, erros ${r.errors}.`, r.errors > 0 ? "warning" : "success");
  } catch (err) {
    setFeedback(`Erro ao disparar: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function toggleHistoricoVersao(versao) {
  const container = document.querySelector(`[data-historico-container="${versao}"]`);
  if (!container) return;
  if (container.dataset.aberto === "1") {
    container.innerHTML = "";
    container.dataset.aberto = "0";
    return;
  }
  container.innerHTML = `<p style="color:#64748b;font-size:12px;padding:6px;">Carregando histórico...</p>`;
  container.dataset.aberto = "1";
  try {
    const envios = await fetchAdmin(`/api/v1/admin/versoes/${encodeURIComponent(versao)}/envios`);
    if (!envios.length) {
      container.innerHTML = `<p style="color:#64748b;font-size:12px;padding:6px;">Esta versão ainda não foi enviada para ninguém.</p>`;
      return;
    }
    container.innerHTML = `
      <div style="margin-top:8px;padding:10px;background:#0f172a;border-radius:6px;">
        <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-bottom:6px;">Histórico de envios</div>
        ${envios.map((e) => `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid #1e293b;font-size:12px;">
            <span style="color:#cbd5e1;">${escapeHtmlAdmin(e.email_destino)}</span>
            <span style="color:${e.status === "enviado" ? "#34d399" : "#f87171"};">${e.status === "enviado" ? "✅ enviado" : "❌ " + escapeHtmlAdmin(e.erro_mensagem || "erro")}</span>
            <span style="color:#64748b;font-size:11px;">${new Date(e.enviado_em).toLocaleString("pt-BR")}</span>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:#f87171;font-size:12px;padding:6px;">Erro: ${err.message}</p>`;
  }
}

document.getElementById("novoDestinatarioBtn")?.addEventListener("click", adicionarDestinatario);
document.getElementById("versoesRefreshButton")?.addEventListener("click", loadVersoesAdmin);

document.getElementById("tenantForm").addEventListener("submit", criarTenant);
document.getElementById("clienteForm").addEventListener("submit", salvarCliente);
document.getElementById("vigenciaForm").addEventListener("submit", salvarVigencia);
document.getElementById("resetClienteFormButton").addEventListener("click", () => document.getElementById("clienteForm").reset());
document.getElementById("resetVigenciaFormButton").addEventListener("click", () => document.getElementById("vigenciaForm").reset());

setupDatePickerField("inicioVigencia", "inicioVigenciaNative", "inicioVigenciaPickerButton");
setupDatePickerField("fimVigencia", "fimVigenciaNative", "fimVigenciaPickerButton");

// Login form
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("loginButton");
  const errorEl = document.getElementById("loginError");
  errorEl.style.display = "none";
  btn.textContent = "Entrando...";
  btn.disabled = true;
  try {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const data = await adminLogin(email, password);
    localStorage.setItem(storageKeys.adminJwt, data.access_token);
    localStorage.setItem(storageKeys.adminEmail, data.email);
    hideLoginScreen();
    loadAdminData();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  } finally {
    btn.textContent = "Entrar";
    btn.disabled = false;
  }
});

document.getElementById("logoutButton").addEventListener("click", logout);

applyTheme();
populateSettings();
showSection("tenants");
renderVersionHistory();

// Verifica autenticação antes de carregar dados
if (getSettings().adminJwt || getSettings().adminToken) {
  hideLoginScreen();
  loadAdminData();
} else {
  showLoginScreen();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// PWA install prompt
(function () {
  const DISMISSED_KEY = 'agenda_admin_pwa_dismissed';
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
