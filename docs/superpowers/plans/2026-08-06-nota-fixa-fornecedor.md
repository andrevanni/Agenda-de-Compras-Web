# Nota fixa do fornecedor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar destaque, no modal de tratar agenda, à nota **permanente do fornecedor** que já existe mas é invisível, e oferecer um caminho de um clique para transformar em permanente as notas que os compradores já escreveram no campo errado.

**Architecture:** Só frontend. A nota permanente é `fornecedores.notas_relacionamento`, que existe desde o `schema_v1` — **sem migration**. A gravação reusa `persistSupplierNote()` de [script_utils.js](../../../frontend/script_utils.js), que já cobre a coluna real e o fallback legado em `clientes.observacoes`. A faixa nova preenche o elemento `agendaSupplierNotesPreview` que `refreshAgendaSupplierNotesState()` já procura desde sempre e nunca encontrou — código morto vira código vivo.

**Tech Stack:** JavaScript sem build (arquivos globais carregados por `<script>`), HTML/CSS puro, Supabase REST via `fetchSupabase()`. Validação com Playwright (Python) contra um servidor estático local. PDF final com ReportLab.

**Spec:** [docs/superpowers/specs/2026-08-06-nota-fixa-fornecedor-design.md](../specs/2026-08-06-nota-fixa-fornecedor-design.md)

## Global Constraints

- **Branch de trabalho:** `staging`. Não commitar em `main`.
- **Ordem dos `<script>` importa:** `script_state.js` → `script_utils.js` → `script_render.js` → `script_forms.js` → `script_eficiencia.js` → `script_atividades.js` → `script_data.js` → `script_main.js`. Uma função só pode ser referenciada **no boot** por arquivos carregados antes; referência em tempo de execução (dentro de handler) pode cruzar arquivos livremente.
- **Bump obrigatório do Service Worker:** `frontend/sw.js` `agenda-compras-v77` → `agenda-compras-v78`. Sem bump, o browser serve cache antigo e a correção não chega.
- **`VERSOES` vive em DOIS arquivos sincronizados:** [frontend/script_state.js](../../../frontend/script_state.js) (linha 73) e [backend/app/data/versoes.py](../../../backend/app/data/versoes.py) (linha 11). Mesmo conteúdo, sintaxes diferentes.
- **NUNCA citar nome de cliente, fornecedor, comprador ou pessoa real** nas notas de versão. Usar "compradores relataram", "foi solicitado".
- **Variáveis CSS que NÃO existem** em `styles.css`: `--surface-alt`, `--border`, `--card-bg`. Usar `--panel-soft`, `--line`, `--panel`, `--text`, `--muted`. Fallback hardcoded claro (ex.: `#f8fafc`) deixa texto ilegível no tema escuro.
- **`type="button"` obrigatório** em todo botão novo: o `agendaDetailModal` é um `<form method="dialog">` e um botão sem `type` fecha o modal ao clicar.
- **Nunca reutilizar um `id` no HTML** — `document.getElementById` devolve sempre o primeiro elemento.
- **Nenhuma migration, nenhum endpoint novo, nenhuma alteração no backend** além da entrada em `versoes.py`.
- **Total Socorro (`57e02e64-d14d-4049-8d80-2618df06a546`) permanece READ-ONLY.** Toda escrita de teste em produção, se houver, só no tenant Service Farma (`c2f65634-b7e0-47f0-8937-94446540701a`). Os testes deste plano usam estado stubado e `fetchSupabase` stubado — não tocam o banco.
- **Nenhum dado de cliente é apagado ou migrado por este plano.** As notas antigas só mudam por ação explícita do usuário na tela.
- ⚠️ **Todos os números de linha citados são do arquivo ORIGINAL**, antes de qualquer task deste plano. À medida que as tasks inserem código, as linhas deslocam — localize pelo trecho de código citado, não pelo número.

---

## File Structure

| Arquivo | Responsabilidade nesta feature |
|---|---|
| [frontend/index.html](../../../frontend/index.html) | Faixa `agendaSupplierNoteBand` (após linha 1037) · botão 📌 e rótulos (linhas 1070-1076) · rótulo do Novo Evento (linha 1578) · 3 trechos da Ajuda (linhas 596, 705-739, 562) |
| [frontend/styles.css](../../../frontend/styles.css) | Classes `.supplier-note-band*`, inseridas após `.audit-pre-treat` (linha ~1344) |
| [frontend/script_utils.js](../../../frontend/script_utils.js) | `mesclarNotaFixa()`, `ultimaNotaDoFornecedor()` — funções puras, após `getSupplierNote` (linha 228) |
| [frontend/script_render.js](../../../frontend/script_render.js) | `refreshAgendaSupplierNotesState()` reescrita, `renderAgendaSupplierNoteSuggestion()`, `openAgendaSupplierNoteEditor()`, `closeAgendaSupplierNoteEditor()`, `saveAgendaSupplierNote()`, `fixarNotaNoFornecedor()`, `updateFixarNotaButtonState()` + reset em `openAgendaDetail` |
| [frontend/script_data.js](../../../frontend/script_data.js) | Listeners novos em `bindEvents` (após linha 457) |
| [frontend/sw.js](../../../frontend/sw.js) | Bump `v77` → `v78` |
| [frontend/script_state.js](../../../frontend/script_state.js) + [backend/app/data/versoes.py](../../../backend/app/data/versoes.py) | Entrada `v78` |
| [CLAUDE.md](../../../CLAUDE.md) | Seções "Painel de Notas" e "Auditoria da Operação" + registro da entrega |
| `~/Desktop/Agenda_Compras_Nota_Fixa_Fornecedor_Guia.pdf` | PDF-guia (não versionado) |

**Decisão de decomposição:** as funções puras (`mesclarNotaFixa`, `ultimaNotaDoFornecedor`) ficam em `script_utils.js` porque são testáveis isoladamente e não tocam DOM. Tudo que lê ou escreve DOM do modal de agenda fica em `script_render.js`, junto de `openAgendaDetail` e `refreshAgendaSupplierNotesState`, que já moram lá. Nenhum arquivo novo — a feature é pequena demais para justificar um `script_notas.js`, e espalhá-la afastaria o código do `openAgendaDetail` que o chama.

---

## Setup do harness de validação (fazer uma vez, antes da Task 1)

Não há framework de testes no projeto. A validação é feita com Playwright contra o frontend servido localmente — padrão já usado neste repositório.

> Nos comandos, `$SP` = `/private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad` e `$PROJ` = `/Users/avj/Developer/Sistemas Python/Agenda de Compras Web`. Escreva os caminhos por extenso ao rodar.

- [ ] **Setup 1: Subir o servidor estático (deixar rodando em background)**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web/frontend" && python3 -m http.server 8123
```

- [ ] **Setup 2: Criar o venv com Playwright no scratchpad**

O Chromium empacotado costuma já estar em `~/Library/Caches/ms-playwright/`. Se `launch()` falhar por falta de browser, rodar `pwenv/bin/playwright install chromium`.

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && python3 -m venv pwenv && pwenv/bin/pip install -q playwright reportlab
```

- [ ] **Setup 3: Criar o seed compartilhado dos testes**

Todos os testes de UI stubam o estado — nenhum toca o Supabase. Criar `$SP/seed.py`:

```python
"""Seed compartilhado: injeta estado fake no portal e stuba fetchSupabase."""

SEED_JS = r"""
([opts]) => {
  window.__patches = [];
  window.fetchSupabase = async (path, init) => {
    window.__patches.push({ path, method: init?.method ?? "GET", body: init?.body ?? null });
    return [];
  };
  state.buyers = [{ id: "buy-1", nome_comprador: "Comprador Teste" }];
  state.suppliers = [{
    id: "sup-1",
    codigo_fornecedor: "001",
    nome_fornecedor: "Fornecedor Teste",
    frequencia_revisao: 4,
    dias_compra: ["SEGUNDA"],
    data_primeiro_pedido: "2026-08-03",
    parametro_estoque: 7,
    lead_time_entrega: 2,
    parametro_compra: 10,
    comprador_id: "buy-1",
    comprador_nome: "Comprador Teste",
    hora_inicio: null,
    hora_fim: null,
    notas_relacionamento: opts.notaFixa ?? "",
  }];
  state.categorias = [{ id: "cat-1", nome: "Agenda de Compras", cor: "#F59E0B" }];
  state.agenda = [{
    id: "occ-atual",
    fornecedor_id: "sup-1",
    comprador_id: "buy-1",
    data_prevista: "2026-08-10",
    status: "PENDENTE",
    nota: opts.lembrete ?? null,
    categoria_id: "cat-1",
    observacao: null,
  }];
  state.auditOccurrences = (opts.historico ?? []).map((h, i) => ({
    id: "occ-hist-" + i,
    fornecedor_id: "sup-1",
    comprador_id: "buy-1",
    data_prevista: h.data,
    data_realizacao: h.data,
    status: "REALIZADA",
    nota: h.nota,
    categoria_id: "cat-1",
    observacao: null,
  }));
  state.notasLivres = [];
  state.clientMeta = {};
  state.features = { fornecedorNotasColuna: true };
  localStorage.setItem("agenda_cliente_tenant_id", "tenant-teste");
  return true;
}
"""


def seed(page, **opts):
    page.evaluate(SEED_JS, [opts])


def abrir_detalhe(page):
    """Abre o modal de detalhe da agenda na ocorrência semeada."""
    page.evaluate("openAgendaDetail('occ-atual')")
    page.wait_for_timeout(200)
```

- [ ] **Setup 4: Confirmar que a página carrega sem erro e o seed funciona**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python -c "
import sys; sys.path.insert(0, '.')
from seed import seed, abrir_detalhe
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8123/index.html'); pg.wait_for_timeout(1500)
    seed(pg, notaFixa='REGRA PERMANENTE')
    abrir_detalhe(pg)
    print('pageerror:', errs)
    print('modal aberto:', pg.evaluate(\"document.getElementById('agendaDetailModal').open\"))
    print('fornecedor:', pg.evaluate(\"document.getElementById('agendaDetailGrid').textContent.includes('Fornecedor Teste')\"))
    b.close()
"
```

Expected: `pageerror: []`, `modal aberto: True`, `fornecedor: True`.

---

### Task 1: Funções puras — `mesclarNotaFixa` e `ultimaNotaDoFornecedor`

**Files:**
- Modify: `frontend/script_utils.js:228` (logo após `getSupplierNote`)
- Test: `$SP/test_t1_helpers.py` (criar)

**Interfaces:**
- Consumes: `state.agenda`, `state.auditOccurrences` ([script_state.js](../../../frontend/script_state.js)).
- Produces:
  - `mesclarNotaFixa(notaAtual: string|null, novoTexto: string|null) -> string` — devolve a nota fixa resultante. Acrescenta `novoTexto` em bloco novo separado por linha em branco; nunca substitui. Texto já presente (comparação case-insensitive, bloco a bloco) não duplica. Entradas vazias tratadas: só a atual, ou só a nova, ou `""`.
  - `ultimaNotaDoFornecedor(fornecedorId: string, excluirOccId?: string) -> {nota: string, data: string} | null` — a nota mais recente escrita em qualquer ocorrência do fornecedor, ordenada por `data_prevista` desc. `null` quando não há nenhuma.

- [ ] **Step 1: Escrever o teste que falha**

Criar `$SP/test_t1_helpers.py`:

```python
import sys
sys.path.insert(0, ".")
from playwright.sync_api import sync_playwright
from seed import seed

URL = "http://localhost:8123/index.html"
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe!r}"))
    if not cond:
        falhas.append(nome)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1200)

    def mesclar(atual, novo):
        return page.evaluate("([a, n]) => mesclarNotaFixa(a, n)", [atual, novo])

    # --- mesclarNotaFixa ---
    check("nota vazia + texto novo = texto novo",
          mesclar("", "REGRA A") == "REGRA A", mesclar("", "REGRA A"))
    check("nota existente + texto novo acrescenta em bloco novo",
          mesclar("REGRA A", "REGRA B") == "REGRA A\n\nREGRA B", mesclar("REGRA A", "REGRA B"))
    check("nunca substitui: a regra antiga continua no resultado",
          "REGRA A" in mesclar("REGRA A", "REGRA B"))
    check("texto identico nao duplica",
          mesclar("REGRA A", "REGRA A") == "REGRA A", mesclar("REGRA A", "REGRA A"))
    check("texto identico ignorando caixa nao duplica",
          mesclar("REGRA A", "regra a") == "REGRA A", mesclar("REGRA A", "regra a"))
    check("bloco ja presente no meio nao duplica",
          mesclar("REGRA A\n\nREGRA B", "REGRA B") == "REGRA A\n\nREGRA B",
          mesclar("REGRA A\n\nREGRA B", "REGRA B"))
    check("texto novo vazio devolve a atual",
          mesclar("REGRA A", "   ") == "REGRA A", mesclar("REGRA A", "   "))
    check("ambos vazios devolve string vazia",
          mesclar(None, None) == "", mesclar(None, None))
    check("espacos nas pontas sao aparados",
          mesclar("  REGRA A  ", "  REGRA B  ") == "REGRA A\n\nREGRA B",
          mesclar("  REGRA A  ", "  REGRA B  "))

    # --- ultimaNotaDoFornecedor ---
    seed(page, historico=[
        {"data": "2026-07-10", "nota": "NOTA ANTIGA"},
        {"data": "2026-08-03", "nota": "NOTA MAIS RECENTE"},
        {"data": "2026-07-25", "nota": "NOTA DO MEIO"},
    ], lembrete="LEMBRETE DA OCORRENCIA ATUAL")

    got = page.evaluate("ultimaNotaDoFornecedor('sup-1', 'occ-atual')")
    check("pega a nota de data_prevista mais recente",
          got and got["nota"] == "NOTA MAIS RECENTE", got)
    check("devolve a data junto", got and got["data"] == "2026-08-03", got)

    got = page.evaluate("ultimaNotaDoFornecedor('sup-1', '')")
    check("sem excluir, a ocorrencia atual nao ganha da mais recente por acaso",
          got and got["nota"] in ("NOTA MAIS RECENTE", "LEMBRETE DA OCORRENCIA ATUAL"), got)

    check("fornecedor sem historico devolve null",
          page.evaluate("ultimaNotaDoFornecedor('sup-inexistente')") is None)
    check("id vazio devolve null", page.evaluate("ultimaNotaDoFornecedor('')") is None)

    seed(page, historico=[{"data": "2026-07-10", "nota": "   "}])
    check("nota so com espacos nao conta",
          page.evaluate("ultimaNotaDoFornecedor('sup-1', 'occ-atual')") is None)

    check("sem pageerror", erros == [], erros)
    browser.close()

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t1_helpers.py
```

Expected: FALHA em todos os checks de `mesclarNotaFixa` e `ultimaNotaDoFornecedor`, com `ReferenceError: mesclarNotaFixa is not defined` no detalhe.

- [ ] **Step 3: Implementar as duas funções**

Em `frontend/script_utils.js`, logo após o fechamento de `getSupplierNote` (linha 228):

```js
// Junta a nota fixa atual do fornecedor com um texto promovido do lembrete do
// ciclo. ACRESCENTA em bloco novo em vez de substituir — promover por engano
// não pode destruir a regra que já estava lá. Bloco idêntico não duplica.
function mesclarNotaFixa(notaAtual, novoTexto) {
  const atual = String(notaAtual ?? "").trim();
  const novo = String(novoTexto ?? "").trim();
  if (!novo) return atual;
  if (!atual) return novo;
  const jaTem = atual
    .split(/\n{2,}/)
    .some((bloco) => bloco.trim().toLowerCase() === novo.toLowerCase());
  return jaTem ? atual : `${atual}\n\n${novo}`;
}

// Última nota escrita em alguma ocorrência deste fornecedor, para oferecer
// "fixar" sem o usuário redigitar o que já escreveu. state.auditOccurrences é
// carregado inteiro e paginado na leva 1 (script_data.js), então o histórico
// relevante está sempre completo — a invariante de carga parcial de
// state.agenda não prejudica: notas antigas moram em ocorrências REALIZADAs.
function ultimaNotaDoFornecedor(fornecedorId, excluirOccId = "") {
  if (!fornecedorId) return null;
  const candidata = [...state.agenda, ...state.auditOccurrences]
    .filter((occ) => occ.fornecedor_id === fornecedorId
      && occ.id !== excluirOccId
      && String(occ.nota ?? "").trim())
    .sort((a, b) => String(b.data_prevista ?? "").localeCompare(String(a.data_prevista ?? "")))[0];
  return candidata
    ? { nota: String(candidata.nota).trim(), data: candidata.data_prevista }
    : null;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t1_helpers.py
```

Expected: todos `OK`, `FALHAS: nenhuma`, exit 0.

- [ ] **Step 5: Checar sintaxe e commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && node --check frontend/script_utils.js && git add frontend/script_utils.js && git commit -m "feat(notas): helpers mesclarNotaFixa e ultimaNotaDoFornecedor

mesclarNotaFixa acrescenta em bloco novo em vez de substituir — promover
uma nota por engano não pode apagar a regra permanente que já existia.
ultimaNotaDoFornecedor alimenta a sugestão de aproveitar notas antigas
sem redigitar.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Faixa "Nota fixa deste fornecedor" (exibição)

**Files:**
- Modify: `frontend/index.html:1037` (após `agendaDetailGrid`)
- Modify: `frontend/styles.css:1344` (após o bloco `.audit-pre-treat`)
- Modify: `frontend/script_render.js:672-686` (reescrever `refreshAgendaSupplierNotesState`)
- Modify: `frontend/script_render.js:513` (reset em `openAgendaDetail`)
- Test: `$SP/test_t2_faixa.py` (criar)

**Interfaces:**
- Consumes: `getSupplierNote(supplierId)` ([script_utils.js:221](../../../frontend/script_utils.js#L221)), `ultimaNotaDoFornecedor()` (Task 1), `formatDate(iso)` e `escapeHtml(texto)` ([script_main.js:183](../../../frontend/script_main.js#L183)).
- Produces:
  - Elementos com id `agendaSupplierNoteBand`, `agendaSupplierNotesPreview`, `agendaSupplierNoteEditButton`, `agendaSupplierNoteEditor`, `agendaSupplierNoteInput`, `agendaSupplierNoteCancelButton`, `agendaSupplierNoteSaveButton`, `agendaSupplierNoteSuggestion`.
  - `refreshAgendaSupplierNotesState(supplierId: string) -> void` — mantém a assinatura atual (já chamada em [script_render.js:513](../../../frontend/script_render.js#L513) e [script_utils.js:742](../../../frontend/script_utils.js#L742)).
  - `renderAgendaSupplierNoteSuggestion(supplierId: string, notaFixa: string) -> void`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `$SP/test_t2_faixa.py`:

```python
import sys
sys.path.insert(0, ".")
from playwright.sync_api import sync_playwright
from seed import seed, abrir_detalhe

URL = "http://localhost:8123/index.html"
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe!r}"))
    if not cond:
        falhas.append(nome)

def txt(page, ident):
    return page.evaluate(f"document.getElementById('{ident}')?.textContent?.trim() ?? null")

def visivel(page, ident):
    return page.evaluate(
        f"(() => {{ const e = document.getElementById('{ident}');"
        f" return !!e && !e.classList.contains('hidden') && e.offsetParent !== null; }})()"
    )

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1200)

    # 1) Fornecedor COM nota fixa: o texto aparece na tela, não só o botão.
    seed(page, notaFixa="COLOCAR NO PEDIDO DA PERFUMARIA PARA DAR MINIMO")
    abrir_detalhe(page)
    check("faixa visivel", visivel(page, "agendaSupplierNoteBand"))
    check("texto da nota fixa aparece integral",
          txt(page, "agendaSupplierNotesPreview") == "COLOCAR NO PEDIDO DA PERFUMARIA PARA DAR MINIMO",
          txt(page, "agendaSupplierNotesPreview"))
    check("botao diz Editar quando ja existe nota",
          txt(page, "agendaSupplierNoteEditButton") == "Editar",
          txt(page, "agendaSupplierNoteEditButton"))
    check("editor comeca escondido", not visivel(page, "agendaSupplierNoteEditor"))
    check("sem nota fixa nao ha sugestao quando ja existe nota fixa",
          not visivel(page, "agendaSupplierNoteSuggestion"))
    check("quebras de linha preservadas no CSS",
          page.evaluate("getComputedStyle(document.getElementById('agendaSupplierNotesPreview')).whiteSpace")
          == "pre-wrap")

    # 2) Fornecedor SEM nota fixa e SEM histórico: placeholder honesto.
    page.evaluate("document.getElementById('agendaDetailModal').close()")
    seed(page, notaFixa="")
    abrir_detalhe(page)
    check("placeholder quando nao ha nota fixa",
          "Sem nota fixa" in (txt(page, "agendaSupplierNotesPreview") or ""),
          txt(page, "agendaSupplierNotesPreview"))
    check("botao diz Adicionar quando nao ha nota",
          txt(page, "agendaSupplierNoteEditButton") == "Adicionar",
          txt(page, "agendaSupplierNoteEditButton"))
    check("sem historico, sem sugestao", not visivel(page, "agendaSupplierNoteSuggestion"))

    # 3) Fornecedor SEM nota fixa mas COM histórico: sugere a mais recente.
    page.evaluate("document.getElementById('agendaDetailModal').close()")
    seed(page, notaFixa="", historico=[
        {"data": "2026-07-10", "nota": "NOTA ANTIGA"},
        {"data": "2026-08-03", "nota": "FAZER TODA TERCA-FEIRA"},
    ])
    abrir_detalhe(page)
    check("sugestao aparece", visivel(page, "agendaSupplierNoteSuggestion"))
    sug = txt(page, "agendaSupplierNoteSuggestion") or ""
    check("sugestao mostra a nota mais recente", "FAZER TODA TERCA-FEIRA" in sug, sug)
    check("sugestao mostra a data formatada", "03/08/2026" in sug, sug)
    check("sugestao nao mostra a nota antiga", "NOTA ANTIGA" not in sug, sug)

    # 4) Com nota fixa E histórico: a sugestão não aparece (já tem regra).
    page.evaluate("document.getElementById('agendaDetailModal').close()")
    seed(page, notaFixa="JA TENHO REGRA", historico=[{"data": "2026-08-03", "nota": "ANTIGA"}])
    abrir_detalhe(page)
    check("com nota fixa a sugestao some", not visivel(page, "agendaSupplierNoteSuggestion"))

    check("sem pageerror", erros == [], erros)
    browser.close()

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t2_faixa.py
```

Expected: FALHA em "faixa visivel" e nos demais — os elementos ainda não existem.

- [ ] **Step 3: Adicionar a faixa no HTML**

Em `frontend/index.html`, logo **após** a linha 1037 (`<div id="agendaDetailGrid" class="grid detail-grid"></div>`):

```html

        <div id="agendaSupplierNoteBand" class="supplier-note-band">
          <div class="supplier-note-band-head">
            <strong>&#128204; Nota fixa deste fornecedor</strong>
            <button id="agendaSupplierNoteEditButton" class="btn btn-outline btn-sm" type="button">Editar</button>
          </div>
          <div id="agendaSupplierNotesPreview" class="supplier-note-band-text"></div>
          <div id="agendaSupplierNoteEditor" class="supplier-note-band-editor hidden">
            <textarea id="agendaSupplierNoteInput" rows="3" placeholder="Regra que vale para todo pedido deste fornecedor..."></textarea>
            <div class="supplier-note-band-editor-actions">
              <button id="agendaSupplierNoteCancelButton" class="btn btn-outline btn-sm" type="button">Cancelar</button>
              <button id="agendaSupplierNoteSaveButton" class="btn btn-sm" type="button">Salvar nota fixa</button>
            </div>
          </div>
          <div id="agendaSupplierNoteSuggestion" class="supplier-note-band-suggestion hidden"></div>
        </div>
```

- [ ] **Step 4: Adicionar o CSS**

Em `frontend/styles.css`, após o fechamento de `.audit-pre-treat` (linha 1344):

```css

/* === Faixa "Nota fixa deste fornecedor" (modal de tratar agenda) ===
   A nota permanente do fornecedor era invisível — só um botão no canto.
   A borda âmbar à esquerda é a mesma cor da categoria Agenda de Compras. */
.supplier-note-band {
  background: var(--panel-soft);
  border: 1px solid var(--line);
  border-left: 4px solid #f59e0b;
  border-radius: 8px;
  padding: 10px 14px;
  margin: 12px 0 4px;
  display: grid;
  gap: 8px;
}

.supplier-note-band-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.supplier-note-band-head strong {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}

.supplier-note-band-text {
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.45;
  color: var(--text);
  max-height: 160px;
  overflow-y: auto;
}

.supplier-note-band-text.muted {
  font-style: italic;
}

.supplier-note-band-editor {
  display: grid;
  gap: 8px;
}

.supplier-note-band-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.supplier-note-band-suggestion {
  border-top: 1px dashed var(--line);
  padding-top: 8px;
  font-size: 13px;
  color: var(--muted);
  display: grid;
  gap: 6px;
}

.supplier-note-band-suggestion-text {
  color: var(--text);
  font-style: italic;
  white-space: pre-wrap;
}
```

- [ ] **Step 5: Reescrever `refreshAgendaSupplierNotesState` e criar a sugestão**

Em `frontend/script_render.js`, substituir o corpo atual (linhas 672-686) por:

```js
// A nota permanente do fornecedor (fornecedores.notas_relacionamento) era
// invisível: só um botão no canto que mudava de rótulo. O elemento
// agendaSupplierNotesPreview era procurado aqui desde sempre e nunca existiu
// no HTML — agora existe, e a nota aparece em destaque na hora de comprar.
function refreshAgendaSupplierNotesState(supplierId) {
  const noteText = getSupplierNote(supplierId).trim();
  const notesButton = document.getElementById("openAgendaSupplierNotesButton");
  const preview = document.getElementById("agendaSupplierNotesPreview");
  const editButton = document.getElementById("agendaSupplierNoteEditButton");

  if (notesButton) {
    notesButton.classList.toggle("has-note", Boolean(noteText));
    notesButton.textContent = noteText ? "Notas salvas" : "Notas";
  }

  if (preview) {
    preview.textContent = noteText || "Sem nota fixa neste fornecedor.";
    preview.classList.toggle("muted", !noteText);
  }

  if (editButton) {
    editButton.textContent = noteText ? "Editar" : "Adicionar";
  }

  renderAgendaSupplierNoteSuggestion(supplierId, noteText);
}

// Oferece a última nota já escrita em pedidos anteriores deste fornecedor.
// Só aparece quando ainda NÃO existe nota fixa — quem já tem a regra
// permanente não precisa da sugestão.
function renderAgendaSupplierNoteSuggestion(supplierId, notaFixa) {
  const box = document.getElementById("agendaSupplierNoteSuggestion");
  if (!box) return;
  const sugestao = notaFixa ? null : ultimaNotaDoFornecedor(supplierId, state.selectedOccurrenceId);
  if (!sugestao) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `
    <span>&Uacute;ltima nota registrada neste fornecedor em ${formatDate(sugestao.data)}:</span>
    <span class="supplier-note-band-suggestion-text">${escapeHtml(sugestao.nota)}</span>
  `;
  box.classList.remove("hidden");
}
```

- [ ] **Step 6: Resetar a faixa ao abrir o modal**

Em `frontend/script_render.js`, dentro de `openAgendaDetail`, **antes** da linha `refreshAgendaSupplierNotesState(supplier.id);` (linha 513), inserir:

```js
  // Reset da faixa: o editor não pode sobreviver entre aberturas do modal.
  // Mesma classe de resíduo que quebrou o newEventRecorrenciaFim na v77.
  document.getElementById("agendaSupplierNoteEditor")?.classList.add("hidden");
  document.getElementById("agendaSupplierNotesPreview")?.classList.remove("hidden");
  document.getElementById("agendaSupplierNoteEditButton")?.classList.remove("hidden");

```

- [ ] **Step 7: Rodar o teste e ver passar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t2_faixa.py
```

Expected: todos `OK`, `FALHAS: nenhuma`, exit 0.

- [ ] **Step 8: Checar sintaxe e commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && node --check frontend/script_render.js && git add frontend/index.html frontend/styles.css frontend/script_render.js && git commit -m "feat(notas): faixa com a nota fixa do fornecedor no modal de tratar agenda

A nota permanente do fornecedor existia desde o schema_v1 mas aparecia
só como um botão no canto, sem mostrar o texto. refreshAgendaSupplierNotesState
já procurava um elemento agendaSupplierNotesPreview que nunca existiu no
HTML — agora existe.

Quando o fornecedor ainda não tem nota fixa mas já teve nota em pedidos
anteriores, a faixa mostra a mais recente.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Edição inline da nota fixa

**Files:**
- Modify: `frontend/script_render.js` (após `renderAgendaSupplierNoteSuggestion`, criada na Task 2)
- Modify: `frontend/script_data.js:457` (após o listener de `saveSupplierNotesButton`)
- Test: `$SP/test_t3_edicao.py` (criar)

**Interfaces:**
- Consumes: `persistSupplierNote(supplierId, noteText)` ([script_utils.js:754](../../../frontend/script_utils.js#L754)) — já grava na coluna real e cai no fallback legado de `clientes.observacoes`, e atualiza `state.suppliers` em memória. `occurrenceRows()` ([script_forms.js:377](../../../frontend/script_forms.js#L377)), `setFeedback(msg, tipo, alvo)`, `agendaDetailFeedback` (global de [script_state.js](../../../frontend/script_state.js)), `renderSuppliers()` ([script_utils.js:356](../../../frontend/script_utils.js#L356), sem argumentos).
- Produces: `openAgendaSupplierNoteEditor() -> void`, `closeAgendaSupplierNoteEditor() -> void`, `saveAgendaSupplierNote() -> Promise<void>`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `$SP/test_t3_edicao.py`:

```python
import sys, json
sys.path.insert(0, ".")
from playwright.sync_api import sync_playwright
from seed import seed, abrir_detalhe

URL = "http://localhost:8123/index.html"
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe!r}"))
    if not cond:
        falhas.append(nome)

def visivel(page, ident):
    return page.evaluate(
        f"(() => {{ const e = document.getElementById('{ident}');"
        f" return !!e && !e.classList.contains('hidden') && e.offsetParent !== null; }})()"
    )

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1200)

    # 1) Abrir o editor pré-preenchido com a nota atual.
    seed(page, notaFixa="REGRA ATUAL")
    abrir_detalhe(page)
    page.click("#agendaSupplierNoteEditButton")
    page.wait_for_timeout(150)
    check("editor abre", visivel(page, "agendaSupplierNoteEditor"))
    check("preview esconde enquanto edita", not visivel(page, "agendaSupplierNotesPreview"))
    check("botao Editar esconde enquanto edita", not visivel(page, "agendaSupplierNoteEditButton"))
    check("textarea vem preenchido com a nota atual",
          page.input_value("#agendaSupplierNoteInput") == "REGRA ATUAL",
          page.input_value("#agendaSupplierNoteInput"))

    # 2) Cancelar não grava nada e restaura a faixa.
    page.fill("#agendaSupplierNoteInput", "TEXTO DESCARTADO")
    page.click("#agendaSupplierNoteCancelButton")
    page.wait_for_timeout(150)
    check("cancelar fecha o editor", not visivel(page, "agendaSupplierNoteEditor"))
    check("cancelar restaura a preview", visivel(page, "agendaSupplierNotesPreview"))
    check("cancelar mantem o texto original",
          page.evaluate("document.getElementById('agendaSupplierNotesPreview').textContent.trim()")
          == "REGRA ATUAL")
    check("cancelar nao dispara PATCH",
          page.evaluate("window.__patches.filter(p => p.method === 'PATCH').length") == 0,
          page.evaluate("JSON.stringify(window.__patches)"))

    # 3) Salvar grava via PATCH no fornecedor e atualiza a faixa sem recarregar.
    page.click("#agendaSupplierNoteEditButton")
    page.wait_for_timeout(150)
    page.fill("#agendaSupplierNoteInput", "REGRA NOVA EDITADA")
    page.click("#agendaSupplierNoteSaveButton")
    page.wait_for_timeout(400)
    patches = page.evaluate("window.__patches")
    forn = [p for p in patches if "fornecedores" in p["path"] and p["method"] == "PATCH"]
    check("salvar dispara PATCH em fornecedores", len(forn) == 1, json.dumps(patches))
    check("PATCH grava notas_relacionamento com o texto novo",
          forn and forn[0]["body"].get("notas_relacionamento") == "REGRA NOVA EDITADA",
          forn[0]["body"] if forn else None)
    check("editor fecha depois de salvar", not visivel(page, "agendaSupplierNoteEditor"))
    check("faixa mostra o texto novo",
          page.evaluate("document.getElementById('agendaSupplierNotesPreview').textContent.trim()")
          == "REGRA NOVA EDITADA",
          page.evaluate("document.getElementById('agendaSupplierNotesPreview').textContent.trim()"))
    check("nao recarrega a agenda inteira (sem GET de agenda_ocorrencias)",
          not [p for p in page.evaluate("window.__patches") if "agenda_ocorrencias" in p["path"]],
          json.dumps(page.evaluate("window.__patches")))

    # 4) Adicionar nota em fornecedor que não tinha.
    page.evaluate("document.getElementById('agendaDetailModal').close()")
    seed(page, notaFixa="")
    abrir_detalhe(page)
    page.click("#agendaSupplierNoteEditButton")
    page.wait_for_timeout(150)
    check("textarea vazio quando nao havia nota",
          page.input_value("#agendaSupplierNoteInput") == "")
    page.fill("#agendaSupplierNoteInput", "PRIMEIRA REGRA")
    page.click("#agendaSupplierNoteSaveButton")
    page.wait_for_timeout(400)
    check("primeira nota aparece na faixa",
          page.evaluate("document.getElementById('agendaSupplierNotesPreview').textContent.trim()")
          == "PRIMEIRA REGRA")
    check("botao vira Editar depois de ganhar nota",
          page.evaluate("document.getElementById('agendaSupplierNoteEditButton').textContent.trim()")
          == "Editar")

    # 5) O modal não pode fechar ao clicar nos botões (form method=dialog).
    check("modal continua aberto apos os cliques",
          page.evaluate("document.getElementById('agendaDetailModal').open"))

    check("sem pageerror", erros == [], erros)
    browser.close()

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t3_edicao.py
```

Expected: FALHA em "editor abre" — o clique em `#agendaSupplierNoteEditButton` ainda não tem listener.

- [ ] **Step 3: Implementar as três funções do editor**

Em `frontend/script_render.js`, logo após `renderAgendaSupplierNoteSuggestion`:

```js
function agendaSupplierIdAtual() {
  return occurrenceRows().find((item) => item.id === state.selectedOccurrenceId)?.supplier?.id ?? "";
}

function openAgendaSupplierNoteEditor() {
  const supplierId = agendaSupplierIdAtual();
  if (!supplierId) {
    setFeedback("Fornecedor da agenda não localizado.", "error", agendaDetailFeedback);
    return;
  }
  document.getElementById("agendaSupplierNoteInput").value = getSupplierNote(supplierId);
  document.getElementById("agendaSupplierNotesPreview").classList.add("hidden");
  document.getElementById("agendaSupplierNoteEditButton").classList.add("hidden");
  document.getElementById("agendaSupplierNoteSuggestion").classList.add("hidden");
  document.getElementById("agendaSupplierNoteEditor").classList.remove("hidden");
  document.getElementById("agendaSupplierNoteInput").focus();
}

function closeAgendaSupplierNoteEditor() {
  document.getElementById("agendaSupplierNoteEditor").classList.add("hidden");
  document.getElementById("agendaSupplierNotesPreview").classList.remove("hidden");
  document.getElementById("agendaSupplierNoteEditButton").classList.remove("hidden");
  // refresh re-avalia a sugestão: se o usuário acabou de salvar uma nota fixa,
  // ela deixa de aparecer.
  refreshAgendaSupplierNotesState(agendaSupplierIdAtual());
}

async function saveAgendaSupplierNote() {
  const supplierId = agendaSupplierIdAtual();
  if (!supplierId) return;
  const texto = document.getElementById("agendaSupplierNoteInput").value.trim();
  const btn = document.getElementById("agendaSupplierNoteSaveButton");
  const rotulo = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Salvando..."; }
  try {
    // persistSupplierNote cobre a coluna real e o fallback legado, e já
    // atualiza state.suppliers em memória. Não chamar loadPortalData aqui —
    // recarga completa da agenda por causa de um campo de texto.
    await persistSupplierNote(supplierId, texto);
    closeAgendaSupplierNoteEditor();
    renderSuppliers();
    setFeedback(
      texto ? "Nota fixa do fornecedor salva." : "Nota fixa removida.",
      "success",
      agendaDetailFeedback,
    );
  } catch (err) {
    setFeedback(`Não foi possível salvar a nota fixa: ${err.message}`, "error", agendaDetailFeedback);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = rotulo ?? "Salvar nota fixa"; }
  }
}
```

- [ ] **Step 4: Ligar os listeners**

Em `frontend/script_data.js`, logo após a linha 457 (`document.getElementById("saveSupplierNotesButton").addEventListener(...)`):

```js
  document.getElementById("agendaSupplierNoteEditButton")?.addEventListener("click", openAgendaSupplierNoteEditor);
  document.getElementById("agendaSupplierNoteCancelButton")?.addEventListener("click", closeAgendaSupplierNoteEditor);
  document.getElementById("agendaSupplierNoteSaveButton")?.addEventListener("click", saveAgendaSupplierNote);
```

- [ ] **Step 5: Rodar o teste e ver passar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t3_edicao.py
```

Expected: todos `OK`, `FALHAS: nenhuma`, exit 0.

- [ ] **Step 6: Checar sintaxe e commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && node --check frontend/script_render.js && node --check frontend/script_data.js && git add frontend/script_render.js frontend/script_data.js && git commit -m "feat(notas): edicao inline da nota fixa do fornecedor

Editar/Adicionar abre um textarea na propria faixa, sem tirar o comprador
do fluxo de tratar. Salva por persistSupplierNote (que ja cobre a coluna
real e o fallback legado) sem chamar loadPortalData.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Botão 📌 "Fixar neste fornecedor" + rótulos dos campos

**Files:**
- Modify: `frontend/index.html:1070-1076` (rótulo + botões do lembrete)
- Modify: `frontend/index.html:1578` (rótulo no Novo Evento)
- Modify: `frontend/script_render.js` (após `saveAgendaSupplierNote`) + `renderAgendaSupplierNoteSuggestion` ganha o botão
- Modify: `frontend/script_render.js:513` (habilitar/desabilitar o botão ao abrir)
- Modify: `frontend/script_data.js` (listeners)
- Test: `$SP/test_t4_fixar.py` (criar)

**Interfaces:**
- Consumes: `mesclarNotaFixa()` e `ultimaNotaDoFornecedor()` (Task 1), `persistSupplierNote()`, `getSupplierNote()`, `getSettings()`, `fetchSupabase()`, `renderPainel()` ([script_main.js:83](../../../frontend/script_main.js#L83)), `refreshAgendaSupplierNotesState()` (Task 2).
- Produces:
  - `fixarNotaNoFornecedor(texto: string, opcoes?: {limparLembrete?: boolean}) -> Promise<void>` — `limparLembrete` default `true`.
  - `updateFixarNotaButtonState() -> void` — liga/desliga o botão conforme o textarea do lembrete tem texto.

- [ ] **Step 1: Escrever o teste que falha**

Criar `$SP/test_t4_fixar.py`:

```python
import sys, json
sys.path.insert(0, ".")
from playwright.sync_api import sync_playwright
from seed import seed, abrir_detalhe

URL = "http://localhost:8123/index.html"
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe!r}"))
    if not cond:
        falhas.append(nome)

def patches_de(page, alvo, metodo="PATCH"):
    return [p for p in page.evaluate("window.__patches")
            if alvo in p["path"] and p["method"] == metodo]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.on("dialog", lambda d: d.accept())  # aceita o confirm de fixar
    page.goto(URL)
    page.wait_for_timeout(1200)

    # 1) Rótulos: o campo que confundiu não pode mais dizer "fixada".
    seed(page, notaFixa="", lembrete="LEMBRETE DO CICLO")
    abrir_detalhe(page)
    rotulo = page.evaluate(
        "document.getElementById('agendaNota').closest('label').textContent"
    )
    check("rotulo do lembrete nao diz 'fixada no Painel'", "fixada no Painel" not in rotulo, rotulo)
    check("rotulo do lembrete diz que vale so para este pedido",
          "só deste pedido" in rotulo or "so deste pedido" in rotulo, rotulo)

    # 2) Promover um lembrete para fornecedor SEM nota fixa.
    page.click("#fixarNotaFornecedorButton")
    page.wait_for_timeout(400)
    forn = patches_de(page, "fornecedores")
    check("fixar dispara PATCH em fornecedores", len(forn) == 1, json.dumps(page.evaluate("window.__patches")))
    check("grava o texto do lembrete como nota fixa",
          forn and forn[0]["body"].get("notas_relacionamento") == "LEMBRETE DO CICLO",
          forn[0]["body"] if forn else None)
    occ = patches_de(page, "agenda_ocorrencias")
    check("limpa o lembrete da ocorrencia", len(occ) == 1 and occ[0]["body"].get("nota") is None,
          occ[0]["body"] if occ else None)
    check("textarea do lembrete fica vazio", page.input_value("#agendaNota") == "")
    check("faixa passa a mostrar a nota fixa",
          page.evaluate("document.getElementById('agendaSupplierNotesPreview').textContent.trim()")
          == "LEMBRETE DO CICLO")
    check("modal continua aberto", page.evaluate("document.getElementById('agendaDetailModal').open"))

    # 3) Promover quando JÁ existe nota fixa: acrescenta, não substitui.
    page.evaluate("document.getElementById('agendaDetailModal').close()")
    seed(page, notaFixa="REGRA ANTIGA", lembrete="REGRA NOVA")
    abrir_detalhe(page)
    page.click("#fixarNotaFornecedorButton")
    page.wait_for_timeout(400)
    forn = patches_de(page, "fornecedores")
    corpo = forn[0]["body"].get("notas_relacionamento") if forn else ""
    check("mantem a regra antiga", "REGRA ANTIGA" in (corpo or ""), corpo)
    check("acrescenta a regra nova", "REGRA NOVA" in (corpo or ""), corpo)
    check("separa em blocos", corpo == "REGRA ANTIGA\n\nREGRA NOVA", corpo)

    # 4) Botão desabilitado quando não há lembrete escrito.
    page.evaluate("document.getElementById('agendaDetailModal').close()")
    seed(page, notaFixa="", lembrete=None)
    abrir_detalhe(page)
    check("botao fixar desabilitado sem texto",
          page.evaluate("document.getElementById('fixarNotaFornecedorButton').disabled"))
    page.fill("#agendaNota", "ALGUM TEXTO")
    page.dispatch_event("#agendaNota", "input")
    page.wait_for_timeout(100)
    check("botao fixar habilita ao digitar",
          not page.evaluate("document.getElementById('fixarNotaFornecedorButton').disabled"))

    # 5) Fixar a partir da SUGESTÃO: não altera a ocorrência antiga.
    page.evaluate("document.getElementById('agendaDetailModal').close()")
    seed(page, notaFixa="", historico=[{"data": "2026-08-03", "nota": "REGRA DO HISTORICO"}])
    abrir_detalhe(page)
    check("botao da sugestao existe",
          page.evaluate("!!document.getElementById('agendaSupplierNoteSuggestionButton')"))
    page.click("#agendaSupplierNoteSuggestionButton")
    page.wait_for_timeout(400)
    forn = patches_de(page, "fornecedores")
    check("sugestao grava a nota antiga como fixa",
          forn and forn[0]["body"].get("notas_relacionamento") == "REGRA DO HISTORICO",
          forn[0]["body"] if forn else None)
    check("sugestao NAO altera nenhuma ocorrencia (historico preservado)",
          patches_de(page, "agenda_ocorrencias") == [],
          json.dumps(page.evaluate("window.__patches")))
    check("sugestao some depois de fixada",
          page.evaluate(
              "document.getElementById('agendaSupplierNoteSuggestion').classList.contains('hidden')"
          ))

    check("sem pageerror", erros == [], erros)
    browser.close()

# Segunda sessão só para o caso "usuário cancela o confirm" — o handler de
# dialog é registrado por página, e aqui ele precisa recusar em vez de aceitar.
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("dialog", lambda d: d.dismiss())
    page.goto(URL)
    page.wait_for_timeout(1200)
    seed(page, notaFixa="", lembrete="NAO DEVE SER FIXADO")
    abrir_detalhe(page)
    page.click("#fixarNotaFornecedorButton")
    page.wait_for_timeout(300)
    check("cancelar o confirm nao grava nada",
          page.evaluate("window.__patches.length") == 0,
          json.dumps(page.evaluate("window.__patches")))
    check("cancelar o confirm preserva o lembrete",
          page.input_value("#agendaNota") == "NAO DEVE SER FIXADO")
    browser.close()

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t4_fixar.py
```

Expected: FALHA já no rótulo e em "fixar dispara PATCH" — o botão ainda não existe.

- [ ] **Step 3: Trocar os rótulos e adicionar o botão no HTML**

Em `frontend/index.html`, substituir o bloco das linhas 1070-1076 por:

```html
              <label class="detail-observation-field">
                Lembrete s&oacute; deste pedido<br>
                <span class="muted" style="font-size:12px">Aparece no Painel de Notas e <strong>n&atilde;o</strong> passa para os pr&oacute;ximos pedidos.</span>
                <textarea id="agendaNota" rows="2" placeholder="Recado pontual deste pedido..."></textarea>
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
                  <button id="fixarNotaFornecedorButton" class="btn btn-outline btn-sm" type="button" title="Transformar este lembrete em nota fixa do fornecedor">&#128204; Fixar neste fornecedor</button>
                  <button id="saveAgendaNotaButton" class="btn btn-outline btn-sm" type="button" title="Salvar somente o lembrete, sem tratar a agenda">&#128190; Salvar lembrete</button>
                </div>
              </label>
```

Em `frontend/index.html`, substituir a linha 1578 por:

```html
          <label style="grid-column:1/-1">Lembrete s&oacute; deste compromisso<br>
            <span class="muted" style="font-size:12px">Aparece no Painel de Notas e n&atilde;o se repete nas pr&oacute;ximas datas da s&eacute;rie.</span>
```

- [ ] **Step 4: Implementar `fixarNotaNoFornecedor` e `updateFixarNotaButtonState`**

Em `frontend/script_render.js`, após `saveAgendaSupplierNote`:

```js
// Promove um texto para nota FIXA do fornecedor. Usado em dois lugares: o
// botão ao lado do lembrete do ciclo (limpa o lembrete depois, senão o mesmo
// texto fica em dois lugares na tela e o card duplicado continua no Painel) e
// o botão da sugestão de nota antiga (limparLembrete: false — a ocorrência
// antiga é histórico de um pedido que já aconteceu e não se mexe nela).
async function fixarNotaNoFornecedor(texto, { limparLembrete = true } = {}) {
  const row = occurrenceRows().find((item) => item.id === state.selectedOccurrenceId);
  const supplierId = row?.supplier?.id;
  const novo = String(texto ?? "").trim();
  if (!supplierId || !novo) return;

  const resultado = mesclarNotaFixa(getSupplierNote(supplierId), novo);
  const confirmou = window.confirm(
    `Fixar este texto como nota permanente de ${row.nome_fornecedor}?\n\n` +
    `"${novo}"\n\n` +
    "Ele vai aparecer toda vez que esta agenda for aberta, em todos os próximos pedidos."
  );
  if (!confirmou) return;

  const btn = document.getElementById("fixarNotaFornecedorButton");
  if (btn) btn.disabled = true;
  try {
    await persistSupplierNote(supplierId, resultado);

    if (limparLembrete) {
      const s = getSettings();
      await fetchSupabase(
        `/rest/v1/agenda_ocorrencias?id=eq.${row.id}&tenant_id=eq.${s.tenantId}`,
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { nota: null } },
      );
      const occ = state.agenda.find((o) => o.id === row.id)
        ?? state.auditOccurrences.find((o) => o.id === row.id);
      if (occ) occ.nota = null;
      const textarea = document.getElementById("agendaNota");
      if (textarea) textarea.value = "";
      renderPainel();
    }

    refreshAgendaSupplierNotesState(supplierId);
    renderSuppliers();
    setFeedback(
      "Nota fixada no fornecedor. Ela vai aparecer em todos os próximos pedidos.",
      "success",
      agendaDetailFeedback,
    );
  } catch (err) {
    setFeedback(`Não foi possível fixar a nota: ${err.message}`, "error", agendaDetailFeedback);
  } finally {
    updateFixarNotaButtonState();
  }
}

function updateFixarNotaButtonState() {
  const btn = document.getElementById("fixarNotaFornecedorButton");
  const textarea = document.getElementById("agendaNota");
  if (btn && textarea) btn.disabled = !textarea.value.trim();
}
```

- [ ] **Step 5: Dar o botão à sugestão**

Em `frontend/script_render.js`, substituir o corpo de `renderAgendaSupplierNoteSuggestion` (criado na Task 2) por:

```js
function renderAgendaSupplierNoteSuggestion(supplierId, notaFixa) {
  const box = document.getElementById("agendaSupplierNoteSuggestion");
  if (!box) return;
  const sugestao = notaFixa ? null : ultimaNotaDoFornecedor(supplierId, state.selectedOccurrenceId);
  if (!sugestao) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `
    <span>&Uacute;ltima nota registrada neste fornecedor em ${formatDate(sugestao.data)}:</span>
    <span class="supplier-note-band-suggestion-text">${escapeHtml(sugestao.nota)}</span>
    <div>
      <button id="agendaSupplierNoteSuggestionButton" class="btn btn-outline btn-sm" type="button">
        &#128204; Fixar como nota deste fornecedor
      </button>
    </div>
  `;
  box.classList.remove("hidden");
  // Listener no elemento recém-criado: o innerHTML acima descarta o anterior,
  // então não há acúmulo de handlers.
  document.getElementById("agendaSupplierNoteSuggestionButton")
    .addEventListener("click", () => fixarNotaNoFornecedor(sugestao.nota, { limparLembrete: false }));
}
```

- [ ] **Step 6: Ligar os listeners e o estado inicial do botão**

Em `frontend/script_data.js`, junto dos listeners da Task 3:

```js
  document.getElementById("fixarNotaFornecedorButton")?.addEventListener("click", () => {
    fixarNotaNoFornecedor(document.getElementById("agendaNota").value);
  });
  document.getElementById("agendaNota")?.addEventListener("input", updateFixarNotaButtonState);
```

Em `frontend/script_render.js`, dentro de `openAgendaDetail`, logo após a linha `document.getElementById("agendaNota").value = row.nota ?? "";` (linha 485):

```js
  updateFixarNotaButtonState();
```

- [ ] **Step 7: Rodar o teste e ver passar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t4_fixar.py
```

Expected: todos `OK`, `FALHAS: nenhuma`, exit 0.

- [ ] **Step 8: Rodar TODOS os testes anteriores (regressão)**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && for t in test_t1_helpers.py test_t2_faixa.py test_t3_edicao.py test_t4_fixar.py; do echo "== $t"; pwenv/bin/python $t || echo "!! $t FALHOU"; done
```

Expected: os 4 com `FALHAS: nenhuma`.

- [ ] **Step 9: Checar sintaxe e commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && node --check frontend/script_render.js && node --check frontend/script_data.js && git add frontend/index.html frontend/script_render.js frontend/script_data.js && git commit -m "feat(notas): botao Fixar neste fornecedor e rotulos sem ambiguidade

O campo 'Nota (fixada no Painel)' virou 'Lembrete so deste pedido' — a
palavra 'fixada' fazia o comprador achar que a nota valia para o
fornecedor. O botao novo promove o lembrete para nota permanente,
acrescentando em bloco novo quando ja existe regra, com confirmacao
mostrando o texto.

A sugestao de nota antiga tambem ganha botao de fixar, e nesse caminho
a ocorrencia historica nao e alterada.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Ajuda do Portal do Cliente

**Files:**
- Modify: `frontend/index.html:596` (passo 5 do fluxo de tratar)
- Modify: `frontend/index.html:562` (fim da seção Fornecedores)
- Modify: `frontend/index.html:706-737` (seção Painel de Notas)
- Test: `$SP/test_t5_ajuda.py` (criar)

**Interfaces:**
- Consumes: nada. É conteúdo estático.
- Produces: nada consumido por outras tasks.

O aviso das "3 notas diferentes" já existe na linha 737 e está **desatualizado** — diz que a nota do fornecedor "fica no cadastro do fornecedor", sem mencionar que agora aparece na hora de comprar.

- [ ] **Step 1: Escrever o teste que falha**

Criar `$SP/test_t5_ajuda.py`:

```python
import sys
sys.path.insert(0, ".")
from playwright.sync_api import sync_playwright

URL = "http://localhost:8123/index.html"
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe!r}"))
    if not cond:
        falhas.append(nome)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1200)

    # Abre todos os <details> da Ajuda para ler o texto renderizado.
    page.evaluate("document.querySelectorAll('details.ajuda-item').forEach(d => d.open = true)")
    ajuda = page.evaluate(
        "Array.from(document.querySelectorAll('details.ajuda-item')).map(d => d.textContent).join(' ')"
    )

    check("ajuda explica a nota fixa do fornecedor",
          "Nota fixa deste fornecedor" in ajuda, ajuda[:200])
    check("ajuda explica que a nota fixa sobrevive ao tratamento",
          "continua lá depois" in ajuda or "não some" in ajuda)
    check("ajuda ensina o botao de fixar",
          "Fixar neste fornecedor" in ajuda)
    check("ajuda usa o rotulo novo do lembrete",
          "Lembrete só deste pedido" in ajuda)
    check("ajuda nao ensina mais o rotulo antigo",
          "post-it que vai para o Painel de Notas" not in ajuda)
    check("aviso das 3 notas foi atualizado",
          "aparece em destaque" in ajuda or "aparece na hora de tratar" in ajuda)
    check("ajuda menciona a sugestao de aproveitar nota antiga",
          "Última nota registrada" in ajuda or "sem redigitar" in ajuda)

    check("sem pageerror", erros == [], erros)
    browser.close()

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t5_ajuda.py
```

Expected: FALHA em todos os checks de conteúdo novo.

- [ ] **Step 3: Atualizar o passo 5 do fluxo de tratar**

Em `frontend/index.html`, substituir a linha 596 por:

```html
                    <li>Confira a <strong>&#128204; Nota fixa deste fornecedor</strong> no topo da janela &mdash; &eacute; a regra permanente que vale para todo pedido dele</li>
                    <li>Preencha a <strong>Observa&ccedil;&atilde;o</strong> e, se precisar, um <strong>Lembrete s&oacute; deste pedido</strong> (vai para o Painel de Notas e n&atilde;o se repete no pr&oacute;ximo)</li>
```

- [ ] **Step 4: Documentar a nota fixa na seção Fornecedores**

Em `frontend/index.html`, após a linha 562 (último `<p>` da seção Fornecedores, antes do `</div>`):

```html
                  <h4>&#128204; Nota fixa do fornecedor</h4>
                  <p>Cada fornecedor pode ter uma <strong>nota permanente</strong> &mdash; a regra que vale <em>toda vez</em> que voc&ecirc; comprar dele ("incluir no pedido da perfumaria", "gerar na ter&ccedil;a para faturar na quarta"). Ela <strong>continua l&aacute; depois</strong> que a agenda &eacute; tratada e reaparece em todos os pr&oacute;ximos pedidos.</p>
                  <p>Onde criar ou editar:</p>
                  <ul>
                    <li>Na tela <strong>Fornecedores</strong>, bot&atilde;o <strong>Notas</strong> na linha do fornecedor</li>
                    <li>Ou direto na janela de <strong>tratar a agenda</strong>: a faixa <strong>&#128204; Nota fixa deste fornecedor</strong> fica no topo, com o bot&atilde;o <strong>Editar</strong> (ou <strong>Adicionar</strong>, se ainda n&atilde;o houver nota)</li>
                  </ul>
```

- [ ] **Step 5: Reescrever a seção Painel de Notas**

Em `frontend/index.html`, substituir as linhas 710-716 (bloco "1. Nota vinculada a um compromisso") por:

```html
                  <h4>1. Lembrete de um pedido (nota de ocorr&ecirc;ncia)</h4>
                  <p>&Eacute; um recado grudado num evento espec&iacute;fico do calend&aacute;rio, para aquela data. Aparece no painel com o <strong>nome do fornecedor (ou t&iacute;tulo do evento) + data + hor&aacute;rio</strong>. <strong>N&atilde;o</strong> passa para os pr&oacute;ximos pedidos &mdash; para uma regra que vale sempre, use a nota fixa do fornecedor (abaixo).</p>
                  <p>Como criar:</p>
                  <ul>
                    <li><strong>Janela de detalhe da Agenda de Compras</strong>: preencha o campo <em>Lembrete s&oacute; deste pedido</em> e clique em <strong>&#128190; Salvar lembrete</strong>. N&atilde;o precisa tratar a agenda &mdash; pode s&oacute; deixar o lembrete e fechar.</li>
                    <li>Tamb&eacute;m grava ao clicar em <strong>Tratar Agenda</strong> ou ao salvar um <strong>Novo Evento</strong> com o campo preenchido.</li>
                  </ul>
                  <p>Se voc&ecirc; escreveu ali uma regra que na verdade vale <strong>sempre</strong>, clique em <strong>&#128204; Fixar neste fornecedor</strong> ao lado do campo: o texto vira nota permanente do fornecedor e o lembrete &eacute; limpo. Quando o fornecedor ainda n&atilde;o tem nota fixa, a janela mostra a <strong>&Uacute;ltima nota registrada</strong> nele e oferece fix&aacute;-la com um clique &mdash; sem redigitar.</p>
```

Em seguida, substituir a linha 737 (o aviso das 3 notas) por:

```html
                  <p class="ajuda-dica">💡 <strong>Aten&ccedil;&atilde;o &agrave;s 3 notas diferentes</strong>: (1) <em>lembrete do pedido</em> &mdash; vale s&oacute; para aquela data e some do painel quando o compromisso &eacute; conclu&iacute;do; (2) <em>post-it livre</em> &mdash; aut&ocirc;nomo, persiste at&eacute; excluir; (3) <em>&#128204; nota fixa do fornecedor</em> &mdash; permanente, <strong>aparece em destaque na hora de tratar a agenda</strong> e continua l&aacute; depois do pedido, valendo para todos os pr&oacute;ximos. Ela n&atilde;o aparece no Painel de Notas &mdash; o lugar dela &eacute; a janela do fornecedor.</p>
```

- [ ] **Step 6: Rodar o teste e ver passar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t5_ajuda.py
```

Expected: todos `OK`, `FALHAS: nenhuma`, exit 0.

- [ ] **Step 7: Commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && git add frontend/index.html && git commit -m "docs(ajuda): explica a nota fixa do fornecedor no portal do cliente

O aviso das '3 notas diferentes' ja existia mas estava desatualizado:
dizia que a nota do fornecedor 'fica no cadastro', sem mencionar que
agora aparece em destaque na hora de comprar. Atualizado, mais o fluxo
de tratar agenda e a secao Fornecedores.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Versão v78, Service Worker e CLAUDE.md

**Files:**
- Modify: `frontend/script_state.js:73` (topo do array `VERSOES`)
- Modify: `backend/app/data/versoes.py:11` (topo da lista `VERSOES`)
- Modify: `frontend/sw.js:1`
- Modify: `CLAUDE.md`
- Test: `$SP/test_t6_versao.py` (criar)

**Interfaces:**
- Consumes: nada.
- Produces: `VERSOES[0].versao === "v78"` — lido pelo rodapé (`footerVersionChip`) e pelo endpoint `/api/v1/admin/versoes/list`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `$SP/test_t6_versao.py`:

```python
import sys, re, json, subprocess
sys.path.insert(0, ".")
from playwright.sync_api import sync_playwright

PROJ = "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web"
URL = "http://localhost:8123/index.html"
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe!r}"))
    if not cond:
        falhas.append(nome)

# 1) Service Worker bumpado.
sw = open(f"{PROJ}/frontend/sw.js", encoding="utf-8").read()
check("sw.js na v78", "agenda-compras-v78" in sw, sw.splitlines()[0])
check("sw.js nao ficou na v77", "agenda-compras-v77" not in sw)

# 2) versoes.py sincronizado (lido pelo Python de verdade).
out = subprocess.run(
    [sys.executable, "-c",
     f"import sys; sys.path.insert(0, {PROJ + '/backend'!r});"
     " from app.data.versoes import VERSOES;"
     " import json; print(json.dumps(VERSOES[0]))"],
    capture_output=True, text=True,
)
check("versoes.py importa sem erro", out.returncode == 0, out.stderr)
py_top = json.loads(out.stdout) if out.returncode == 0 else {}
check("versoes.py topo e v78", py_top.get("versao") == "v78", py_top.get("versao"))

# 3) VERSOES do JS via browser + paridade com o Python.
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1200)
    js_top = page.evaluate("VERSOES[0]")
    check("script_state.js topo e v78", js_top.get("versao") == "v78", js_top.get("versao"))
    check("notas identicas nos dois arquivos",
          js_top.get("notas") == py_top.get("notas"),
          {"js": js_top.get("notas"), "py": py_top.get("notas")})
    check("dataHora identica nos dois arquivos",
          js_top.get("dataHora") == py_top.get("dataHora"),
          {"js": js_top.get("dataHora"), "py": py_top.get("dataHora")})
    check("rodape mostra a versao nova",
          page.evaluate("document.getElementById('footerVersionChip')?.textContent") is not None)
    check("sem pageerror", erros == [], erros)
    browser.close()

# 4) Nenhum nome real de cliente nas notas (regra do CLAUDE.md). Só nomes de
# tenant/cliente — não incluir siglas curtas, que dão falso positivo.
PROIBIDOS = ["Total Socorro", "total_socorro", "Conviva", "Drogaria", "Velanes",
             "Service Farma", "Casa Branca", "Glicofarma", "Trevizan", "Farmaplus"]
notas = " ".join(py_top.get("notas", []))
vazou = [n for n in PROIBIDOS if n.lower() in notas.lower()]
check("notas sem nome real de cliente ou pessoa", not vazou, vazou)

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t6_versao.py
```

Expected: FALHA em "sw.js na v78" e "topo e v78".

- [ ] **Step 3: Bumpar o Service Worker**

Em `frontend/sw.js`, linha 1:

```js
const CACHE = 'agenda-compras-v78';
```

- [ ] **Step 4: Adicionar a entrada v78 no JS**

Em `frontend/script_state.js`, inserir como **primeiro** elemento do array `VERSOES` (linha 74, antes do objeto `v77`):

```js
  {
    versao: "v78",
    dataHora: "06/08/2026 — tarde",
    notas: [
      "A nota do fornecedor agora aparece em destaque na janela de tratar a agenda, com o texto à vista — antes era só um botão no canto, e quase ninguém encontrava.",
      "Essa nota é permanente: continua lá depois que o pedido é tratado e reaparece em todos os próximos. É o lugar certo para regras que valem sempre, como \"incluir no pedido da perfumaria\" ou \"gerar na terça para faturar na quarta\".",
      "O campo de nota que ficava no meio da janela passou a se chamar \"Lembrete só deste pedido\", para deixar claro que ele vale apenas para aquela data.",
      "Novo botão \"Fixar neste fornecedor\" transforma um lembrete em nota permanente, sem apagar a regra que já estivesse gravada — o texto é acrescentado.",
      "Quando o fornecedor ainda não tem nota permanente, a janela mostra a última nota escrita nele e permite fixá-la com um clique, sem redigitar nada.",
      "Nada do que já estava escrito foi apagado.",
    ],
  },
```

- [ ] **Step 5: Espelhar a entrada no Python**

Em `backend/app/data/versoes.py`, inserir como **primeiro** elemento da lista `VERSOES` (linha 12, antes do dict `v77`):

```python
    {
        "versao": "v78",
        "dataHora": "06/08/2026 — tarde",
        "notas": [
            "A nota do fornecedor agora aparece em destaque na janela de tratar a agenda, com o texto à vista — antes era só um botão no canto, e quase ninguém encontrava.",
            "Essa nota é permanente: continua lá depois que o pedido é tratado e reaparece em todos os próximos. É o lugar certo para regras que valem sempre, como \"incluir no pedido da perfumaria\" ou \"gerar na terça para faturar na quarta\".",
            "O campo de nota que ficava no meio da janela passou a se chamar \"Lembrete só deste pedido\", para deixar claro que ele vale apenas para aquela data.",
            "Novo botão \"Fixar neste fornecedor\" transforma um lembrete em nota permanente, sem apagar a regra que já estivesse gravada — o texto é acrescentado.",
            "Quando o fornecedor ainda não tem nota permanente, a janela mostra a última nota escrita nele e permite fixá-la com um clique, sem redigitar nada.",
            "Nada do que já estava escrito foi apagado.",
        ],
    },
```

- [ ] **Step 6: Rodar o teste e ver passar**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t6_versao.py
```

Expected: todos `OK`, `FALHAS: nenhuma`, exit 0.

- [ ] **Step 7: Atualizar o CLAUDE.md**

Na seção **"Painel de Notas (`#painel`)"**, substituir o parágrafo final de aviso (o que começa com `⚠️ Não confundir com a **Nota do Fornecedor**`) por:

```markdown
⚠️ Não confundir com a **Nota do Fornecedor** (`fornecedores.notas_relacionamento`, schema_v4) — permanente, 1 por fornecedor, **não aparece no Painel**. Desde a v78 ela é exibida em destaque na faixa `agendaSupplierNoteBand` no topo do modal de tratar agenda, com edição inline (`openAgendaSupplierNoteEditor` / `saveAgendaSupplierNote` em [script_render.js](frontend/script_render.js)) — antes era só o botão "Notas" no canto e o texto nunca aparecia. Também editável pela tela de Fornecedores via `supplierNotesModal`.

**Promoção de lembrete → nota fixa (v78)**: `fixarNotaNoFornecedor(texto, {limparLembrete})` em [script_render.js](frontend/script_render.js) transforma o lembrete do ciclo em nota permanente. Usa `mesclarNotaFixa` ([script_utils.js](frontend/script_utils.js)), que **acrescenta em bloco novo e nunca substitui** — promover por engano não pode destruir a regra existente. Pelo botão ao lado do lembrete, limpa a `nota` da ocorrência depois (senão o texto fica em dois lugares e o card duplica no Painel); pelo botão da sugestão, **não** toca a ocorrência histórica. `ultimaNotaDoFornecedor()` alimenta a sugestão e só aparece quando ainda não há nota fixa.
```

Na seção **"Pendências"**, adicionar logo abaixo do título, antes da subseção mais recente:

```markdown
### Entregue em 06/08/2026 — nota fixa do fornecedor (SW v77→v78)

Apontamento de compradora: a nota que ela "fixava" por fornecedor sumia ao tratar a agenda. **Diagnóstico: a funcionalidade já existia** — `fornecedores.notas_relacionamento`, desde o `schema_v1` — mas era invisível: só um botão pequeno no canto do modal, e `refreshAgendaSupplierNotesState` procurava um `agendaSupplierNotesPreview` que **nunca existiu no HTML** (código morto). Ela usava o campo grande do meio da tela, rotulado "Nota (fixada no Painel)", que é por ocorrência — a palavra "fixada" era a armadilha.

Levantamento no banco: o tenant dela tinha **55 notas de ocorrência contra 5 de fornecedor**, a maior concentração da base; o conteúdo é majoritariamente regra permanente ("incluir no pedido da perfumaria", "gerar na terça para faturar na quarta"), mas ~1/3 é pontual (avaria, item específico) — por isso a promoção é **explícita por clique, nunca automática**.

**Duas correções ao relato, que mudaram o desenho:** (1) a nota não sumia — continuava no Painel presa à ocorrência tratada, com data velha (`renderPainel` inclui `auditOccurrences`); o que nascia vazia era a **próxima** ocorrência. (2) Nem toda nota dela é permanente.

Entregue: faixa em destaque com edição inline, rótulos sem ambiguidade nos dois modais, botão "📌 Fixar neste fornecedor" com confirmação, e sugestão da última nota do fornecedor para aproveitar o acervo sem redigitar. Ajuda do portal atualizada em 3 pontos (o aviso das "3 notas diferentes" já existia e estava desatualizado). **Sem migration, sem backend, sem apagar dado de cliente.**

Spec e plano em [docs/superpowers/specs/2026-08-06-nota-fixa-fornecedor-design.md](docs/superpowers/specs/2026-08-06-nota-fixa-fornecedor-design.md) e [docs/superpowers/plans/2026-08-06-nota-fixa-fornecedor.md](docs/superpowers/plans/2026-08-06-nota-fixa-fornecedor.md).

**Fora de escopo (decidido):** os cards de agendas já tratadas que se acumulam no Painel sem prazo de validade — o tenant citado tem 44. Depois que as regras virarem nota fixa, boa parte perde a razão de existir. Se continuar incomodando, é a segunda leva natural.
```

Também atualizar a linha do topo do arquivo (`cache v77 hoje` → `cache v78 hoje`) e a seção "Service Worker e PWA" (`agenda-compras-v77` → `agenda-compras-v78`).

- [ ] **Step 8: Commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && git add frontend/sw.js frontend/script_state.js backend/app/data/versoes.py CLAUDE.md && git commit -m "chore(v78): entrada de versao, bump do SW e CLAUDE.md

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Validação final — Chrome real, temas e regressão

**Files:**
- Test: `$SP/test_t7_final.py` (criar)
- Nenhum arquivo de produção é modificado nesta task, **exceto** correções que os testes revelarem.

**Interfaces:**
- Consumes: tudo das Tasks 1-6.
- Produces: screenshots em `$SP/shots/` usadas pelo PDF da Task 8.

- [ ] **Step 1: Escrever a suíte final**

Criar `$SP/test_t7_final.py`:

```python
import sys, os
sys.path.insert(0, ".")
from playwright.sync_api import sync_playwright
from seed import seed, abrir_detalhe

URL = "http://localhost:8123/index.html"
SHOTS = "shots"
os.makedirs(SHOTS, exist_ok=True)
falhas = []

def check(nome, cond, detalhe=""):
    print(("OK    " if cond else "FALHA ") + nome + ("" if cond else f" -> {detalhe!r}"))
    if not cond:
        falhas.append(nome)

def rodar(p, canal, sufixo):
    launch = {"channel": canal} if canal else {}
    browser = p.chromium.launch(**launch)
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.on("dialog", lambda d: d.accept())
    page.goto(URL)
    page.wait_for_timeout(1500)
    check(f"[{sufixo}] boot sem pageerror", erros == [], erros)

    for tema in ("dark", "light"):
        page.evaluate(f"document.body.setAttribute('data-theme', '{tema}')")

        # Faixa com nota fixa + lembrete preenchido.
        seed(page, notaFixa="COLOCAR NO PEDIDO DA PERFUMARIA PARA DAR MINIMO DE FATURAMENTO",
             lembrete="Conferir avaria da ultima entrega")
        abrir_detalhe(page)
        page.wait_for_timeout(250)

        cor = page.evaluate(
            "getComputedStyle(document.getElementById('agendaSupplierNotesPreview')).color"
        )
        fundo = page.evaluate(
            "getComputedStyle(document.getElementById('agendaSupplierNoteBand')).backgroundColor"
        )
        check(f"[{sufixo}/{tema}] texto da faixa nao e transparente",
              cor and "rgba(0, 0, 0, 0)" not in cor, cor)
        check(f"[{sufixo}/{tema}] faixa tem fundo proprio",
              fundo and "rgba(0, 0, 0, 0)" not in fundo, fundo)
        check(f"[{sufixo}/{tema}] faixa cabe no modal sem rolagem horizontal",
              page.evaluate(
                  "(() => { const c = document.querySelector('#agendaDetailModal .modal-card');"
                  " return c.scrollWidth <= c.clientWidth + 1; })()"
              ))
        page.screenshot(path=f"{SHOTS}/faixa-{tema}-{sufixo}.png",
                        clip=page.evaluate(
                            "(() => { const r = document.getElementById('agendaSupplierNoteBand')"
                            ".getBoundingClientRect();"
                            " return {x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16}; })()"
                        ))

        # Sugestão de nota antiga.
        page.evaluate("document.getElementById('agendaDetailModal').close()")
        seed(page, notaFixa="", historico=[{"data": "2026-08-03", "nota": "FAZER TODA TERCA-FEIRA"}])
        abrir_detalhe(page)
        page.wait_for_timeout(250)
        check(f"[{sufixo}/{tema}] sugestao visivel",
              page.evaluate(
                  "!document.getElementById('agendaSupplierNoteSuggestion').classList.contains('hidden')"
              ))
        page.screenshot(path=f"{SHOTS}/sugestao-{tema}-{sufixo}.png",
                        clip=page.evaluate(
                            "(() => { const r = document.getElementById('agendaSupplierNoteBand')"
                            ".getBoundingClientRect();"
                            " return {x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16}; })()"
                        ))

        # Modal inteiro, para o PDF.
        page.evaluate("document.getElementById('agendaDetailModal').close()")
        seed(page, notaFixa="GERAR NA TERCA PARA FATURAR NA QUARTA", lembrete="")
        abrir_detalhe(page)
        page.wait_for_timeout(250)
        page.locator("#agendaDetailModal .modal-card").screenshot(
            path=f"{SHOTS}/modal-{tema}-{sufixo}.png")
        page.evaluate("document.getElementById('agendaDetailModal').close()")

    check(f"[{sufixo}] nenhum pageerror acumulado", erros == [], erros)
    browser.close()

with sync_playwright() as p:
    rodar(p, None, "chromium")
    try:
        rodar(p, "chrome", "chrome")
    except Exception as e:
        falhas.append("chrome-real-nao-rodou")
        print("FALHA chrome real:", e)

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
```

- [ ] **Step 2: Rodar a suíte final**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python test_t7_final.py
```

Expected: `FALHAS: nenhuma`. Se o Chrome real não estiver instalado, o teste acusa `chrome-real-nao-rodou` — **isso é uma falha de verdade**, não um aviso: instale o Chrome ou reporte a lacuna explicitamente na entrega.

- [ ] **Step 3: Rodar toda a bateria de regressão**

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && for t in test_t1_helpers.py test_t2_faixa.py test_t3_edicao.py test_t4_fixar.py test_t5_ajuda.py test_t6_versao.py test_t7_final.py; do echo "== $t"; pwenv/bin/python $t >/dev/null && echo "   OK" || echo "   !! FALHOU"; done
```

Expected: os 7 com `OK`.

- [ ] **Step 4: Conferir os screenshots com os próprios olhos**

Abrir `$SP/shots/faixa-light-chrome.png`, `faixa-dark-chrome.png`, `sugestao-light-chrome.png`, `sugestao-dark-chrome.png`, `modal-light-chrome.png` e `modal-dark-chrome.png`. Confirmar: texto legível nos dois temas, nada cortado na borda direita, botões alinhados, a faixa não domina o modal a ponto de empurrar o botão "Tratar Agenda" para fora da vista.

Se algo estiver errado, corrigir o CSS e voltar ao Step 2.

- [ ] **Step 5: Commitar eventuais correções**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && git status --short
```

Se houver alterações, commitar com mensagem descrevendo o que os screenshots revelaram. Se não houver, seguir.

---

### Task 8: PDF-guia para a compradora

**Files:**
- Create: `$SP/gerar_pdf_guia.py`
- Output: `~/Desktop/Agenda_Compras_Nota_Fixa_Fornecedor_Guia.pdf` (**não versionado** — mesmo precedente do guia de Outras Atividades de jul/2026)

**Interfaces:**
- Consumes: screenshots de `$SP/shots/` gerados na Task 7.
- Produces: o PDF. Nada depende dele.

- [ ] **Step 1: Escrever o gerador**

Criar `$SP/gerar_pdf_guia.py`. O nome da destinatária vem por argumento — não deixar hardcoded, para o guia servir a outros clientes:

```python
"""Gera o PDF-guia da nota fixa do fornecedor (v78).

Uso: pwenv/bin/python gerar_pdf_guia.py "Nome da Compradora"
"""
import os
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Image, PageBreak, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

DESTINATARIA = sys.argv[1] if len(sys.argv) > 1 else "voce"
SHOTS = "shots"
SAIDA = os.path.expanduser("~/Desktop/Agenda_Compras_Nota_Fixa_Fornecedor_Guia.pdf")

AZUL = colors.HexColor("#1e3a8a")
AMBAR = colors.HexColor("#f59e0b")
CINZA = colors.HexColor("#475569")

base = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=base["Heading1"], textColor=AZUL, fontSize=19,
                    spaceAfter=10, leading=23)
H2 = ParagraphStyle("H2", parent=base["Heading2"], textColor=AZUL, fontSize=13.5,
                    spaceBefore=14, spaceAfter=6, leading=17)
P = ParagraphStyle("P", parent=base["BodyText"], fontSize=10.5, leading=15.5,
                   alignment=TA_LEFT, spaceAfter=7)
PASSO = ParagraphStyle("PASSO", parent=P, leftIndent=14, spaceAfter=5)
NOTA = ParagraphStyle("NOTA", parent=P, textColor=CINZA, fontSize=9.5, leading=13.5)

story = []


def img(nome, largura=155 * mm):
    """Insere um screenshot preservando a proporção. Some se o arquivo faltar."""
    caminho = os.path.join(SHOTS, nome)
    if not os.path.exists(caminho):
        print(f"AVISO: screenshot ausente, pulando: {caminho}")
        return
    from reportlab.lib.utils import ImageReader
    iw, ih = ImageReader(caminho).getSize()
    story.append(Image(caminho, width=largura, height=largura * ih / iw))
    story.append(Spacer(1, 8))


# --- Capa / abertura ---
story.append(Paragraph("Agenda de Compras — Nota fixa do fornecedor", H1))
story.append(Paragraph(
    f"Guia da atualiza&ccedil;&atilde;o <b>v78</b> &mdash; preparado para {DESTINATARIA}, "
    "a partir do que voc&ecirc; reportou.", P))
story.append(Spacer(1, 6))

story.append(Paragraph("1. O que você reportou", H2))
story.append(Paragraph(
    "&ldquo;A gente estava colocando observa&ccedil;&otilde;es para os pr&oacute;ximos pedidos, "
    "coisas que precisamos considerar toda vez que formos comprar de um fornecedor. "
    "Mas quando a gente trata a agenda, essa nota some &mdash; ela n&atilde;o fica fixada "
    "para os pr&oacute;ximos pedidos.&rdquo;", P))

story.append(Paragraph("2. O que encontramos", H2))
story.append(Paragraph(
    "O sistema tem <b>tr&ecirc;s</b> tipos de nota, e elas se pareciam demais na tela. "
    "A que voc&ecirc; queria <b>j&aacute; existia</b> &mdash; mas estava escondida atr&aacute;s "
    "de um bot&atilde;o pequeno no canto, que nunca mostrava o texto. "
    "O campo grande no meio da janela, que era o &uacute;nico vis&iacute;vel, se chamava "
    "&ldquo;Nota (fixada no Painel)&rdquo;. A palavra <i>fixada</i> passava a ideia errada: "
    "ela era fixada no <b>painel</b>, n&atilde;o no <b>fornecedor</b>.", P))
story.append(Paragraph(
    "Uma corre&ccedil;&atilde;o importante, para voc&ecirc; ficar tranquila: <b>nenhuma nota sua foi perdida</b>. "
    "Elas n&atilde;o sumiam &mdash; ficavam presas ao pedido antigo, com a data antiga. "
    "O que acontecia &eacute; que o <b>pr&oacute;ximo</b> pedido nascia sem nota. Tudo o que voc&ecirc; "
    "escreveu continua no sistema.", P))

story.append(Paragraph("3. O que mudamos", H2))
story.append(Paragraph(
    "A nota permanente do fornecedor agora aparece em <b>destaque no topo</b> da janela de "
    "tratar a agenda, com o texto todo &agrave; vista e um bot&atilde;o para editar ali mesmo:", P))
img("faixa-light-chrome.png")
story.append(Paragraph(
    "E o campo que confundia mudou de nome para <b>&ldquo;Lembrete s&oacute; deste pedido&rdquo;</b>, "
    "deixando claro que ele vale apenas para aquela data.", P))

story.append(PageBreak())

story.append(Paragraph("4. Passo a passo: criar uma nota que vale sempre", H2))
for i, passo in enumerate([
    "Abra a <b>Agenda do Dia</b> ou clique no fornecedor no <b>Calend&aacute;rio</b>.",
    "Clique em <b>Ver Detalhe</b> para abrir a janela do fornecedor.",
    "No topo da janela, procure a faixa <b>&#128204; Nota fixa deste fornecedor</b>.",
    "Clique em <b>Adicionar</b> (ou <b>Editar</b>, se j&aacute; houver uma nota).",
    "Escreva a regra que vale para <i>todo</i> pedido desse fornecedor.",
    "Clique em <b>Salvar nota fixa</b>.",
], 1):
    story.append(Paragraph(f"<b>{i}.</b> {passo}", PASSO))
story.append(Paragraph(
    "Pronto: essa nota <b>continua l&aacute;</b> depois de tratar a agenda e reaparece em todos "
    "os pr&oacute;ximos pedidos daquele fornecedor.", P))

story.append(Paragraph("5. Passo a passo: aproveitar o que você já escreveu", H2))
story.append(Paragraph(
    "Voc&ecirc; n&atilde;o precisa redigitar nada. H&aacute; dois caminhos, os dois de um clique:", P))
story.append(Paragraph(
    "<b>a) A nota j&aacute; est&aacute; no pedido aberto</b> &mdash; no campo "
    "&ldquo;Lembrete s&oacute; deste pedido&rdquo;, clique em "
    "<b>&#128204; Fixar neste fornecedor</b>. O sistema mostra o texto e pede confirma&ccedil;&atilde;o.", PASSO))
story.append(Paragraph(
    "<b>b) A nota estava num pedido antigo</b> &mdash; se o fornecedor ainda n&atilde;o tem nota "
    "permanente, a janela mostra sozinha a <b>&uacute;ltima nota registrada</b> nele, com um bot&atilde;o "
    "para fix&aacute;-la:", PASSO))
img("sugestao-light-chrome.png")
story.append(Paragraph(
    "Se o fornecedor <i>j&aacute;</i> tiver uma nota permanente, o texto novo &eacute; "
    "<b>acrescentado</b> embaixo &mdash; nunca substitui o que estava l&aacute;.", NOTA))

story.append(PageBreak())

story.append(Paragraph("6. Qual nota usar em cada caso", H2))
tabela = Table([
    [Paragraph("<b>Situa&ccedil;&atilde;o</b>", P), Paragraph("<b>Use</b>", P), Paragraph("<b>Onde fica</b>", P)],
    [Paragraph("Regra que vale <b>toda vez</b> que comprar desse fornecedor", P),
     Paragraph("&#128204; <b>Nota fixa do fornecedor</b>", P),
     Paragraph("Faixa no topo da janela de tratar a agenda", P)],
    [Paragraph("Recado de <b>um pedido s&oacute;</b> (avaria, item espec&iacute;fico, abatimento)", P),
     Paragraph("<b>Lembrete s&oacute; deste pedido</b>", P),
     Paragraph("Painel de Notas, com o nome do fornecedor e a data", P)],
    [Paragraph("Anota&ccedil;&atilde;o solta, sem liga&ccedil;&atilde;o com fornecedor", P),
     Paragraph("<b>Post-it livre</b>", P),
     Paragraph("Painel de Notas, bot&atilde;o <b>+ Nova nota</b>", P)],
], colWidths=[62 * mm, 46 * mm, 55 * mm])
tabela.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eff6ff")),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(tabela)
story.append(Spacer(1, 12))

story.append(Paragraph("7. O que não mudou", H2))
for item in [
    "<b>Nenhuma nota sua foi apagada.</b> Tudo o que voc&ecirc; escreveu continua no sistema.",
    "Os lembretes de pedidos antigos continuam no Painel de Notas. Se quiser limpar algum, "
    "basta clicar no <b>&#10005;</b> no canto do post-it.",
    "O resto do fluxo de tratar a agenda &mdash; pr&oacute;xima data, par&acirc;metro, "
    "&ldquo;Deu pedido?&rdquo; &mdash; est&aacute; igual.",
]:
    story.append(Paragraph(f"&bull; {item}", PASSO))

story.append(Spacer(1, 16))
story.append(Paragraph(
    "Para a atualiza&ccedil;&atilde;o aparecer, feche e abra o portal. Se o rodap&eacute; n&atilde;o mostrar "
    "<b>v78</b>, acesse o portal com <b>/?limpar=1</b> no fim do endere&ccedil;o &mdash; isso for&ccedil;a "
    "o navegador a buscar a vers&atilde;o nova.", NOTA))

doc = SimpleDocTemplate(
    SAIDA, pagesize=A4,
    leftMargin=22 * mm, rightMargin=22 * mm, topMargin=20 * mm, bottomMargin=18 * mm,
    title="Agenda de Compras — Nota fixa do fornecedor (v78)",
    author="Service Farma",
)


def rodape(canvas, _doc):
    canvas.saveState()
    canvas.setStrokeColor(AMBAR)
    canvas.setLineWidth(2)
    canvas.line(22 * mm, 14 * mm, A4[0] - 22 * mm, 14 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(CINZA)
    canvas.drawString(22 * mm, 9 * mm, "Agenda de Compras — Service Farma")
    canvas.drawRightString(A4[0] - 22 * mm, 9 * mm, f"p. {canvas.getPageNumber()}")
    canvas.restoreState()


doc.build(story, onFirstPage=rodape, onLaterPages=rodape)
print("PDF gerado em:", SAIDA)
```

- [ ] **Step 2: Gerar o PDF**

O primeiro nome da compradora é o único dado que não está no plano — ele vem da conversa com o usuário, de propósito, para o nome real não ficar versionado no repositório. Trocar `PRIMEIRO_NOME` por ele ao rodar:

```bash
cd /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/a73cd011-a181-4183-8983-a5f1ae32c0df/scratchpad && pwenv/bin/python gerar_pdf_guia.py "PRIMEIRO_NOME"
```

Expected: `PDF gerado em: /Users/avj/Desktop/Agenda_Compras_Nota_Fixa_Fornecedor_Guia.pdf`, **sem** nenhuma linha `AVISO: screenshot ausente`. Se aparecer aviso, os screenshots da Task 7 não foram gerados — voltar e rodar `test_t7_final.py`.

- [ ] **Step 3: Conferir o PDF página a página**

Abrir o PDF e ler as 3 páginas. Confirmar:
- As imagens aparecem, estão nítidas e mostram a faixa nova (não um modal vazio).
- Nenhum texto cortado ou sobreposto; a tabela da seção 6 cabe na largura.
- Nenhuma entidade HTML crua visível (`&mdash;`, `&#128204;` aparecendo como texto em vez de símbolo).
- O nome da destinatária está correto na abertura.

- [ ] **Step 4: Registrar o PDF no CLAUDE.md**

Na subseção "Entregue em 06/08/2026" criada na Task 6, acrescentar ao final:

```markdown
**PDF-guia para a compradora** (comunicação, não versionado): `~/Desktop/Agenda_Compras_Nota_Fixa_Fornecedor_Guia.pdf`, gerado com ReportLab a partir de screenshots reais da interface — pode ser regenerado por `gerar_pdf_guia.py`. Cobre o que foi reportado, o diagnóstico em linguagem de operação, o passo a passo de criar a nota fixa e o de aproveitar as notas antigas com um clique.
```

- [ ] **Step 5: Commitar**

```bash
cd "/Users/avj/Developer/Sistemas Python/Agenda de Compras Web" && git add CLAUDE.md && git commit -m "docs(claude.md): registra o PDF-guia da v78

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Encerramento

- [ ] **Rodar a bateria completa uma última vez** (Task 7, Step 3) — os 7 testes verdes.
- [ ] **`git log --oneline` conferindo** que todos os commits estão em `staging`, nenhum em `main`.
- [ ] **Relatar honestamente** na entrega: o que foi validado (Chromium + Chrome real, temas claro e escuro, com estado stubado), e a lacuna conhecida — **WebKit/Safari não foi testado**, e a validação usou dados stubados, não o banco de produção.
- [ ] **Merge `staging` → `main`** só depois do aval do usuário.
