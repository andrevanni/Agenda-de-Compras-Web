const initialItems = [
  {
    id: "occ-001",
    fornecedorId: "for-001",
    codigoFornecedor: "10023",
    nomeFornecedor: "Distribuidora Alfa",
    comprador: "Marina",
    dataPrevista: "2026-04-03",
    diasCompra: "SEGUNDA, QUINTA",
    statusLista: "hoje",
    frequencia: 8,
    proximaDataSugerida: "2026-04-06",
  },
  {
    id: "occ-002",
    fornecedorId: "for-002",
    codigoFornecedor: "20441",
    nomeFornecedor: "Farma Sul",
    comprador: "Eduardo",
    dataPrevista: "2026-04-04",
    diasCompra: "SABADO",
    statusLista: "proximas",
    frequencia: 4,
    proximaDataSugerida: "2026-04-11",
  },
  {
    id: "occ-003",
    fornecedorId: "for-003",
    codigoFornecedor: "08770",
    nomeFornecedor: "BioMedic Atacado",
    comprador: "Marina",
    dataPrevista: "2026-04-01",
    diasCompra: "QUARTA",
    statusLista: "atrasadas",
    frequencia: 1,
    proximaDataSugerida: "2026-04-29",
  },
  {
    id: "occ-004",
    fornecedorId: "for-004",
    codigoFornecedor: "77400",
    nomeFornecedor: "Nacional Hospitalar",
    comprador: "Sem Comprador",
    dataPrevista: "2026-04-08",
    diasCompra: "TERCA, SEXTA",
    statusLista: "proximas",
    frequencia: 8,
    proximaDataSugerida: "2026-04-10",
  },
];

let currentFilter = "todas";
let items = structuredClone(initialItems);
let selectedItemId = null;

const agendaList = document.getElementById("agendaList");
const statsGrid = document.getElementById("statsGrid");
const boardDescription = document.getElementById("boardDescription");
const detailsModal = document.getElementById("detailsModal");
const modalTitle = document.getElementById("modalTitle");
const modalSubtitle = document.getElementById("modalSubtitle");
const summaryList = document.getElementById("summaryList");
const suggestionText = document.getElementById("suggestionText");
const completionDate = document.getElementById("completionDate");
const nextDate = document.getElementById("nextDate");
const observation = document.getElementById("observation");
const resultBox = document.getElementById("resultBox");

function formatDate(dateText) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${dateText}T00:00:00`));
}

function filterItems() {
  if (currentFilter === "todas") {
    return items;
  }

  return items.filter((item) => item.statusLista === currentFilter);
}

function renderStats() {
  const stats = [
    {
      label: "Hoje",
      value: items.filter((item) => item.statusLista === "hoje").length,
      note: "Pendencias com acao imediata.",
    },
    {
      label: "Proximas",
      value: items.filter((item) => item.statusLista === "proximas").length,
      note: "Compras futuras ja programadas.",
    },
    {
      label: "Atrasadas",
      value: items.filter((item) => item.statusLista === "atrasadas").length,
      note: "Itens que exigem replanejamento.",
    },
    {
      label: "Realizadas",
      value: initialItems.length - items.length,
      note: "Ocorrencias tratadas nesta simulacao.",
    },
  ];

  statsGrid.innerHTML = stats.map((stat) => `
    <article class="stat-card">
      <span class="stat-label">${stat.label}</span>
      <strong class="stat-value">${stat.value}</strong>
      <div class="stat-note">${stat.note}</div>
    </article>
  `).join("");
}

function renderList() {
  const visibleItems = filterItems();
  boardDescription.textContent = `${visibleItems.length} ocorrencia(s) visiveis no filtro atual.`;

  if (!visibleItems.length) {
    agendaList.innerHTML = `
      <article class="agenda-card">
        <div>
          <h4>Nenhuma ocorrencia nesse filtro</h4>
          <p class="agenda-meta">Troque o filtro lateral ou recarregue os dados mockados.</p>
        </div>
      </article>
    `;
    return;
  }

  agendaList.innerHTML = visibleItems.map((item) => `
    <article class="agenda-card">
      <div>
        <h4>${item.nomeFornecedor}</h4>
        <p class="agenda-meta">Codigo ${item.codigoFornecedor} • Comprador ${item.comprador}</p>
        <p class="agenda-submeta">Dias de compra: ${item.diasCompra}</p>
      </div>
      <div>
        <span class="status-pill ${statusClass(item.statusLista)}">${statusLabel(item.statusLista)}</span>
        <p class="agenda-submeta">Prevista para ${formatDate(item.dataPrevista)}</p>
      </div>
      <div>
        <p class="agenda-meta">Sugestao</p>
        <strong>${formatDate(item.proximaDataSugerida)}</strong>
      </div>
      <div>
        <button class="primary-button" data-open-id="${item.id}">Ver detalhes</button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-open-id]").forEach((button) => {
    button.addEventListener("click", () => openModal(button.dataset.openId));
  });
}

function statusLabel(status) {
  if (status === "hoje") return "Hoje";
  if (status === "proximas") return "Proxima";
  return "Atrasada";
}

function statusClass(status) {
  if (status === "hoje") return "status-hoje";
  if (status === "proximas") return "status-proxima";
  return "status-atrasada";
}

function openModal(itemId) {
  const item = items.find((entry) => entry.id === itemId);
  if (!item) return;

  selectedItemId = itemId;
  modalTitle.textContent = item.nomeFornecedor;
  modalSubtitle.textContent = `Ocorrencia ${item.id} • Fornecedor ${item.codigoFornecedor}`;
  suggestionText.textContent = `A API sugeriria ${formatDate(item.proximaDataSugerida)} com base na frequencia ${item.frequencia} e nos dias ${item.diasCompra}.`;
  completionDate.value = "2026-04-03";
  nextDate.value = item.proximaDataSugerida;
  observation.value = "";
  resultBox.classList.add("hidden");

  summaryList.innerHTML = [
    ["Comprador", item.comprador],
    ["Status visual", statusLabel(item.statusLista)],
    ["Prevista", formatDate(item.dataPrevista)],
    ["Dias de compra", item.diasCompra],
    ["Frequencia", `${item.frequencia} revisoes`],
    ["Fornecedor ID", item.fornecedorId],
  ].map(([label, value]) => `
    <div>
      <dt>${label}</dt>
      <dd>${value}</dd>
    </div>
  `).join("");

  detailsModal.showModal();
}

function closeModal() {
  detailsModal.close();
}

function useSuggestion() {
  const item = items.find((entry) => entry.id === selectedItemId);
  if (!item) return;
  nextDate.value = item.proximaDataSugerida;
}

function completeOccurrence() {
  const itemIndex = items.findIndex((entry) => entry.id === selectedItemId);
  if (itemIndex === -1) return;

  const item = items[itemIndex];
  const nextOccurrenceId = `nova-${item.id}`;

  items.splice(itemIndex, 1);
  items.push({
    ...item,
    id: nextOccurrenceId,
    dataPrevista: nextDate.value,
    proximaDataSugerida: nextDate.value,
    statusLista: "proximas",
  });

  renderStats();
  renderList();

  resultBox.textContent = `Simulacao concluida: ${item.id} foi marcada como realizada e a nova pendencia ${nextOccurrenceId} foi criada para ${formatDate(nextDate.value)}.`;
  resultBox.classList.remove("hidden");
}

function resetData() {
  items = structuredClone(initialItems);
  renderStats();
  renderList();
}

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    document.querySelectorAll(".nav-link").forEach((link) => link.classList.remove("active"));
    button.classList.add("active");
    renderList();
  });
});

document.getElementById("refreshButton").addEventListener("click", resetData);
document.getElementById("openFirstPending").addEventListener("click", () => {
  const first = filterItems()[0] ?? items[0];
  if (first) openModal(first.id);
});
document.getElementById("useSuggestionButton").addEventListener("click", useSuggestion);
document.getElementById("completeButton").addEventListener("click", completeOccurrence);
document.querySelector(".close-button").addEventListener("click", closeModal);
detailsModal.addEventListener("click", (event) => {
  if (event.target === detailsModal) closeModal();
});

renderStats();
renderList();
