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
const PARAMETRO_MINIMO_FREQUENCIA = { 1: 28, 2: 14, 4: 7, 8: 4, 12: 3 };
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
  sidebarCollapsed: "agenda_sidebar_collapsed",
  calendarWeekdays: "agenda_calendar_weekdays",
  apiBaseUrl: "agenda_api_base_url",
  jwt: "agenda_jwt",
  refreshToken: "agenda_refresh_token",
  duracaoPadraoCompromissos: "agenda_duracao_compromissos",
  duracaoPadraoAgenda: "agenda_duracao_agenda",
  loggedPortalEmail: "agenda_cliente_logged_portal_email",
  logoUrl: "agenda_cliente_logo_url",
  theme: "agenda_ui_theme",
};

const defaultSettings = {
  supabaseUrl: "https://fnwsorhflueunqzkwsxu.supabase.co",
  supabaseKey: "sb_publishable_ZvbYTFdj6maOJiJACFR5Zw_9xJrBuUB",
  tenantId: "",
  logoUrl: "assets/logo_alta.jpg",
  apiBaseUrl: "https://agenda-de-compras-api.vercel.app",
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

// ============================================================
// HISTÓRICO DE VERSÕES
// ============================================================
// Mostrado no menu "🆕 Versões" da sidebar. Mais recente no topo.
// REGRA: a cada commit que altere comportamento visível ao usuário,
// adicione uma entrada nova no topo (ou complemente a do mesmo dia).
// NUNCA citar nomes de clientes, fornecedores ou pessoas reais nas notas
// — usar descrições genéricas ("um cliente reportou..." → "foi reportado...").
const VERSOES = [
  {
    versao: "v56",
    dataHora: "29/05/2026 — manhã",
    notas: [
      "Cadastro de compradores: os textos das opções de notificação por e-mail ficaram mais claros. Agora explicam que marcar 'Gestor' apenas amplia o conteúdo do relatório (mostra todos os compradores), enquanto são as opções 'Receber e-mail' que de fato ligam o envio — basta marcar ao menos uma delas para a pessoa passar a receber o relatório diário.",
      "Ajuda do portal: a seção 'Compradores — Cadastro e Acesso' ganhou uma explicação sobre as notificações por e-mail do relatório diário.",
    ],
  },
  {
    versao: "v53",
    dataHora: "28/05/2026 — tarde",
    notas: [
      "Fornecedores: a tela agora abre por padrão mostrando apenas os fornecedores do comprador ativo. Para ver a base completa, basta clicar em 'Mostrar todos' ao lado do campo de busca.",
    ],
  },
  {
    versao: "v52",
    dataHora: "28/05/2026 — manhã",
    notas: [
      "Novo (painel admin): botão '🔑 Trocar senha' no topo permite que o administrador logado altere a própria senha sem precisar de reset por SQL.",
    ],
  },
  {
    versao: "v51",
    dataHora: "27/05/2026 — tarde",
    notas: [
      "Novo (painel admin): seção 'Notas de Versão' permite cadastrar destinatários e enviar o changelog de cada versão por email.",
    ],
  },
  {
    versao: "v50",
    dataHora: "27/05/2026 — tarde",
    notas: [
      "Novo: menu 'Versões' na barra lateral com o histórico das mudanças do sistema.",
    ],
  },
  {
    versao: "v49",
    dataHora: "27/05/2026 — tarde",
    notas: [
      "Atualização do menu de Ajuda cobrindo as novas funcionalidades de Painel de Notas, Compromissos e edição de série recorrente no Calendário.",
    ],
  },
  {
    versao: "v48",
    dataHora: "27/05/2026 — tarde",
    notas: [
      "Novo: botões ✓ Concluir e ↩ Desfazer em Compromissos.",
      "Novo: toggle 'Mostrar concluídos' no topo da seção Compromissos.",
      "Novo: compromissos concluídos aparecem riscados no calendário (com ✓ no título e cor mais clara).",
    ],
  },
  {
    versao: "v47",
    dataHora: "27/05/2026 — tarde",
    notas: [
      "Correção: o calendário e a lista de pendências agora atualizam imediatamente após tratar uma agenda — sem precisar fechar e reabrir a tela.",
    ],
  },
  {
    versao: "v46",
    dataHora: "27/05/2026 — tarde",
    notas: [
      "Novo: post-it livre direto no Painel de Notas (botão '+ Nova nota').",
      "Edição inline ao clicar no card: blur ou Ctrl+Enter salva, Esc descarta, texto vazio exclui.",
      "Coexiste com a nota de ocorrência (a antiga, que fica grudada num compromisso).",
    ],
  },
  {
    versao: "v45",
    dataHora: "27/05/2026 — tarde",
    notas: [
      "Correção: novo botão '💾 Salvar nota' no modal de detalhe da Agenda — agora é possível registrar a nota sem precisar tratar a agenda.",
      "A correção vale também para corrigir a nota de uma agenda já tratada.",
    ],
  },
  {
    versao: "v44",
    dataHora: "27/05/2026 — tarde",
    notas: [
      "Novo: edição e exclusão de série de recorrência em massa.",
      "Ao editar um evento que pertence a uma série, aparece o seletor 'Aplicar mudanças a' com três opções: Só esta / Esta e as próximas / Toda a série (com a contagem ao lado).",
      "Em massa muda: título, horário, categoria e observação. Não muda: data, nota e comprador (esses ficam preservados em cada ocorrência).",
    ],
  },
];

const state = {
  currentSection: "calendario",
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
  auditLogs: [],
  categorias: [],
  feriados: [],
  notasLivres: [],
  calendarInstance: null,
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
