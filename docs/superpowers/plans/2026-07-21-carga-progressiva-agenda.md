# Carga progressiva da agenda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dividir a carga de ocorrências PENDENTES em duas levas — leva 1 (vencidos + próximos 3 meses) destrava a tela; leva 2 (resto do futuro) chega em segundo plano — reduzindo em ~70% a janela em que uma oscilação de rede derruba a carga.

**Architecture:** Só `state.agenda` é dividido. A leva 1 entra no `Promise.all` existente com o filtro `data_prevista=lte.<hoje+3meses>`; a leva 2 (`gt.<hoje+3meses>`) é disparada sem `await` após a renderização, mescla por `id` e re-renderiza silenciosamente. Um contador de geração descarta levas obsoletas. O `backfill` migra para depois da leva 2 (precisa da agenda completa para não criar duplicatas).

**Tech Stack:** JavaScript vanilla em escopo global (não são ES modules), PostgREST/Supabase via `fetchSupabase`/`fetchSupabaseAll`, validação via Playwright (chromium empacotado) contra dados reais.

## Global Constraints

- **Sem ES modules**: escopo global compartilhado; ordem dos `<script>` no `index.html` não muda.
- **Somente a carga de PENDENTES é dividida.** As outras 8 queries e o histórico (`REALIZADA/ADIADA`, 732 linhas) permanecem na leva 1, sem alteração.
- **Leva 1** = `data_prevista=lte.<hoje+3meses>` — **sem limite inferior**, para que TODOS os vencidos entrem (seção Atrasadas íntegra).
- **Leva 2** = `data_prevista=gt.<hoje+3meses>` — silenciosa: ao concluir mescla e re-renderiza; ao falhar apenas `console.warn`, **sem feedback visual**.
- **Guarda de concorrência obrigatória**: contador de geração em módulo; leva 2 de uma carga antiga NÃO pode sobrescrever estado de uma carga mais nova.
- **Backfill roda SOMENTE após a leva 2**, com a agenda completa. Rodá-lo com dados parciais faria fornecedores com pendência além de +3 meses parecerem "sem ocorrência" → **criaria duplicatas**.
- **Mesclagem com dedup por `id`** (defensivo; as levas não se sobrepõem por construção).
- **Não alterar** o `catch` de `loadPortalData` (comportamento da v72: preserva estado, nunca mostra dados de demonstração).
- **Bump do Service Worker** `frontend/sw.js` `agenda-compras-v72 → v73` + entrada `v73` byte-idêntica em `frontend/script_state.js` e `backend/app/data/versoes.py`.

### Ambiente de verificação
- Não há framework de testes automatizados. Verificação = scripts Playwright throwaway (não commitados) contra **dados reais**, no padrão já usado no projeto.
- Servidor local: `cd frontend && python3 -m http.server 8123`
- Chromium: `import { chromium } from '/Users/avj/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.mjs'`
- Scratchpad: `/private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/3abbe7af-0209-4f76-a0ca-2fdb15c0c77b/scratchpad`
- Tenant de teste (dados reais, somente leitura): **CONVIVA VIANA** `7075df8c-3b8b-49cb-9876-836c11f51eff` — 3.975 pendentes, 21 vencidos, 1.167 nos próximos 3 meses.
- Chave anon pública (o frontend já a usa; RLS é `USING(true)`): `sb_publishable_ZvbYTFdj6maOJiJACFR5Zw_9xJrBuUB`

---

## File Structure

- **Modify** `frontend/script_data.js` — helpers da carga progressiva, leva 1 no `Promise.all`, leva 2 em segundo plano, backfill realocado.
- **Modify** `frontend/sw.js`, `frontend/script_state.js`, `backend/app/data/versoes.py` — bump v73 + changelog.

Nenhum arquivo novo: a mudança é coesa e pertence ao módulo que já faz a carga.

---

## Task 1: Carga em duas levas

**Files:**
- Modify: `frontend/script_data.js` (helpers antes de `loadPortalData` ~linha 38; query de pendentes linha 61; bloco do backfill linhas 69-76; atribuição de `state.agenda` linha 108; feedback linhas 124-128)

**Interfaces:**
- Consumes: `fetchSupabaseAll(path)`, `fetchSupabase(path)`, `backfillMissingPendingOccurrences(supplierRows, agendaRows)`, `_naoFatal(nome, fn)`, `renderTables()`, `refreshCalendar()`, `setFeedback(msg, tipo)`, `state`, `getSettings()`.
- Produces:
  - `SELECT_PENDENTES` — string com a lista de colunas dos pendentes.
  - `_limiteLeva1() -> "YYYY-MM-DD"` (hoje + 3 meses, data local).
  - `_pathPendentes(tenantId, filtroData) -> string`
  - `_mesclarPorId(atuais, novas) -> array`
  - `_carregarRestanteEmSegundoPlano(settings, limite, geracao, supplierRows, opts) -> Promise<void>`
  - `_cargaGeracao` (contador em módulo)

- [ ] **Step 1: Escrever o script de verificação (antes de implementar).**

Criar `<scratchpad>/carga_progressiva.mjs`:

```js
import { chromium } from '/Users/avj/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.mjs';

const T = '7075df8c-3b8b-49cb-9876-836c11f51eff'; // CONVIVA VIANA
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);

const r = await page.evaluate(async (T) => {
  localStorage.setItem('agenda_cliente_tenant_id', T);
  const out = {};

  // helpers precisam existir
  out.temHelpers = typeof _limiteLeva1 === 'function'
    && typeof _pathPendentes === 'function'
    && typeof _mesclarPorId === 'function';
  if (!out.temHelpers) return out;

  const limite = _limiteLeva1();
  out.limite = limite;

  const leva1 = await fetchSupabaseAll(_pathPendentes(T, `&data_prevista=lte.${limite}`));
  const leva2 = await fetchSupabaseAll(_pathPendentes(T, `&data_prevista=gt.${limite}`));
  const tudo  = await fetchSupabaseAll(_pathPendentes(T, ''));

  out.leva1 = leva1.length;
  out.leva2 = leva2.length;
  out.total = tudo.length;

  // 1) leva1 + leva2 == total, sem sobreposição
  const ids1 = new Set(leva1.map((o) => o.id));
  out.semSobreposicao = leva2.every((o) => !ids1.has(o.id));
  out.somaBate = leva1.length + leva2.length === tudo.length;

  // 2) TODOS os vencidos estão na leva 1
  const hoje = todayLocalIso();
  const vencidosTotal = tudo.filter((o) => o.data_prevista && o.data_prevista < hoje).length;
  const vencidosLeva1 = leva1.filter((o) => o.data_prevista && o.data_prevista < hoje).length;
  out.vencidosTotal = vencidosTotal;
  out.vencidosNaLeva1 = vencidosLeva1 === vencidosTotal;

  // 3) mesclagem não duplica
  const mesclado = _mesclarPorId(leva1, leva2);
  out.mescladoLen = mesclado.length;
  out.mescladoUnico = new Set(mesclado.map((o) => o.id)).size === mesclado.length;
  out.mescladoIgualTotal = mesclado.length === tudo.length;

  // 4) mesclar duas vezes é idempotente (defensivo)
  out.idempotente = _mesclarPorId(mesclado, leva2).length === tudo.length;

  return out;
}, T);

console.log(JSON.stringify({ pageErrors, ...r }, null, 2));
const ok = pageErrors.length === 0 && r.temHelpers && r.somaBate && r.semSobreposicao
  && r.vencidosNaLeva1 && r.mescladoUnico && r.mescladoIgualTotal && r.idempotente
  && r.leva1 > 0 && r.leva1 < r.total;
console.log('RESULT:', ok ? 'PASS' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Rodar e confirmar que FALHA (helpers ainda não existem).**

```bash
cd frontend && (python3 -m http.server 8123 &) && sleep 1
cd <scratchpad> && node carga_progressiva.mjs
```
Expected: `"temHelpers": false` e `RESULT: FAIL`. (Encerrar o servidor depois: `pkill -f "http.server 8123"`.)

- [ ] **Step 3: Adicionar os helpers em `frontend/script_data.js`, logo ANTES de `async function loadPortalData`.**

```js
// ── Carga progressiva da agenda ──────────────────────────────────────────────
// A carga de PENDENTES é a mais pesada (Conviva Viana: 3.975 linhas, ~2,5s) e é
// majoritariamente futura. Dividimos em duas levas: a leva 1 (vencidos +
// próximos 3 meses) destrava a tela; a leva 2 (resto do futuro) chega em segundo
// plano. Reduz a janela em que uma oscilação de rede derruba a carga inteira.
const SELECT_PENDENTES =
  "id,fornecedor_id,comprador_id,data_prevista,status,titulo,hora_inicio,hora_fim,categoria_id,nota,serie_id";

// loadPortalData é chamado de 10+ lugares. Sem este contador, a leva 2 de uma
// carga antiga poderia sobrescrever o estado de uma carga mais nova.
let _cargaGeracao = 0;

// Fronteira entre as levas: hoje + 3 meses, em data LOCAL (formato ISO).
function _limiteLeva1() {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + 3, hoje.getDate());
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// filtroData: "" (tudo), "&data_prevista=lte.X" (leva 1) ou "&data_prevista=gt.X" (leva 2).
function _pathPendentes(tenantId, filtroData) {
  return `/rest/v1/agenda_ocorrencias?select=${SELECT_PENDENTES}&tenant_id=eq.${tenantId}&status=eq.PENDENTE${filtroData}&order=data_prevista.asc`;
}

// Mescla sem duplicar. As levas não se sobrepõem por construção (lte/gt no mesmo
// limite), mas o dedup protege contra qualquer sobreposição de fronteira.
function _mesclarPorId(atuais, novas) {
  const vistos = new Set((atuais ?? []).map((o) => o.id));
  return (atuais ?? []).concat((novas ?? []).filter((o) => !vistos.has(o.id)));
}

// Leva 2 — segundo plano. Silenciosa: se falhar, o portal segue funcional com o
// essencial e a próxima sincronização tenta de novo.
async function _carregarRestanteEmSegundoPlano(settings, limite, geracao, supplierRows, { silent, preserveFeedback }) {
  try {
    const restante = await fetchSupabaseAll(_pathPendentes(settings.tenantId, `&data_prevista=gt.${limite}`));
    if (geracao !== _cargaGeracao) return; // carga obsoleta — descarta
    if (restante.length) {
      state.agenda = _mesclarPorId(state.agenda, restante);
    }

    // Backfill SÓ aqui: precisa da agenda COMPLETA. Com dados parciais, um
    // fornecedor cuja única pendência esteja além de +3 meses pareceria "sem
    // ocorrência" e o sistema criaria uma DUPLICATA.
    const createdSeeds = (await _naoFatal("backfill", () => backfillMissingPendingOccurrences(supplierRows, state.agenda))) ?? 0;
    if (geracao !== _cargaGeracao) return;

    if (createdSeeds > 0) {
      state.agenda = await fetchSupabaseAll(_pathPendentes(settings.tenantId, ""));
      if (geracao !== _cargaGeracao) return;
      if (!silent && !preserveFeedback) {
        setFeedback(`${createdSeeds} agenda(s) pendente(s) foram geradas automaticamente.`, "success");
      }
    }

    if (restante.length || createdSeeds > 0) {
      renderTables();
      refreshCalendar();
    }
  } catch (error) {
    console.warn("[loadPortalData] leva 2 (agenda futura) falhou; portal segue com o essencial:", error);
  }
}
```

- [ ] **Step 4: Rodar o script e confirmar que PASSA.**

```bash
cd frontend && (python3 -m http.server 8123 &) && sleep 1
cd <scratchpad> && node carga_progressiva.mjs
```
Expected: `RESULT: PASS`, com `leva1` ≈ 1.190, `leva2` ≈ 2.785, `total` 3.975, `somaBate: true`, `vencidosNaLeva1: true`, `mescladoUnico: true`.

- [ ] **Step 5: Ligar a leva 1 no `Promise.all`.**

Em `loadPortalData`, capturar geração e limite logo após a guarda de tenant (antes do `try`):

```js
  const geracao = ++_cargaGeracao;
  const limite = _limiteLeva1();
  try {
```

E trocar a query de pendentes (atual linha 61) por:

```js
      fetchSupabaseAll(_pathPendentes(settings.tenantId, `&data_prevista=lte.${limite}`)),
```

- [ ] **Step 6: Remover o backfill do caminho bloqueante.**

Substituir o bloco atual (linhas ~69-76):

```js
    let agendaRows = agendaRowsRaw;
    const createdSeeds = (await _naoFatal("backfill", () => backfillMissingPendingOccurrences(supplierRows, agendaRowsRaw))) ?? 0;
    if (createdSeeds > 0) {
      agendaRows = await fetchSupabaseAll(`/rest/v1/agenda_ocorrencias?select=id,fornecedor_id,comprador_id,data_prevista,status,titulo,hora_inicio,hora_fim,categoria_id,nota,serie_id&tenant_id=eq.${settings.tenantId}&status=eq.PENDENTE&order=data_prevista.asc`);
      if (!silent && !preserveFeedback) {
        setFeedback(`Portal do cliente carregado com sucesso. ${createdSeeds} agenda(s) pendente(s) foram geradas automaticamente.`, "success");
      }
    }
```

por (o backfill agora roda na leva 2):

```js
    const agendaRows = agendaRowsRaw; // leva 1: vencidos + próximos 3 meses
```

- [ ] **Step 7: Ajustar o feedback de sucesso (não conhece mais `createdSeeds`).**

Substituir (linhas ~124-128):

```js
    if (!silent && createdSeeds === 0) {
      setFeedback("Portal do cliente carregado com sucesso.", "success");
    } else if (!preserveFeedback) {
      clearFeedback();
    }
```

por:

```js
    if (!silent) {
      setFeedback("Portal do cliente carregado com sucesso.", "success");
    } else if (!preserveFeedback) {
      clearFeedback();
    }
```

- [ ] **Step 8: Disparar a leva 2 no fim do `try`, logo após o bloco de feedback e ANTES do `} catch`.**

```js
    // Leva 2 em segundo plano — sem await, para não travar a tela.
    _carregarRestanteEmSegundoPlano(settings, limite, geracao, supplierRows, { silent, preserveFeedback });
```

- [ ] **Step 9: Verificar sintaxe.**

Run: `node --check frontend/script_data.js`
Expected: sem saída (OK).

- [ ] **Step 10: Escrever e rodar o teste de integração end-to-end da carga.**

Criar `<scratchpad>/carga_e2e.mjs`:

```js
import { chromium } from '/Users/avj/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.mjs';

const T = '7075df8c-3b8b-49cb-9876-836c11f51eff';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);

const r = await page.evaluate(async (T) => {
  localStorage.setItem('agenda_cliente_tenant_id', T);
  const out = {};

  // A) leva 1 destrava rápido
  const t0 = performance.now();
  await loadPortalData({ silent: true });
  out.msLeva1 = Math.round(performance.now() - t0);
  out.agendaAposLeva1 = state.agenda.length;

  // B) leva 2 completa o estado em segundo plano
  const alvo = 3975;
  const limite = Date.now() + 20000;
  while (state.agenda.length < alvo && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 250));
  }
  out.agendaFinal = state.agenda.length;
  out.semDuplicatas = new Set(state.agenda.map((o) => o.id)).size === state.agenda.length;

  // C) concorrência: leva 2 obsoleta não sobrescreve
  const antes = state.agenda.length;
  await loadPortalData({ silent: true });   // nova geração
  await loadPortalData({ silent: true });   // outra geração (invalida a anterior)
  await new Promise((r) => setTimeout(r, 6000));
  out.agendaAposDuasCargas = state.agenda.length;
  out.concorrenciaOk = state.agenda.length === antes;

  return out;
}, T);

console.log(JSON.stringify({ pageErrors, ...r }, null, 2));
const ok = pageErrors.length === 0
  && r.agendaAposLeva1 > 0 && r.agendaAposLeva1 < 3975   // leva 1 é parcial
  && r.agendaFinal === 3975                              // leva 2 completou
  && r.semDuplicatas && r.concorrenciaOk;
console.log('RESULT:', ok ? 'PASS' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
```

Run:
```bash
cd frontend && (python3 -m http.server 8123 &) && sleep 1
cd <scratchpad> && node carga_e2e.mjs
```
Expected: `RESULT: PASS`. `agendaAposLeva1` ≈ 1.190 e `msLeva1` sensivelmente menor que a carga completa anterior; `agendaFinal` 3.975; sem duplicatas; concorrência OK.

- [ ] **Step 11: Testar falha da leva 2 (deve ser silenciosa).**

Criar `<scratchpad>/leva2_falha.mjs`:

```js
import { chromium } from '/Users/avj/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.mjs';

const T = '7075df8c-3b8b-49cb-9876-836c11f51eff';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await page.goto('http://localhost:8123/index.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);

const r = await page.evaluate(async (T) => {
  localStorage.setItem('agenda_cliente_tenant_id', T);
  // Faz APENAS a leva 2 falhar: quebra o path de "gt." em tempo de execução.
  const orig = window.fetchSupabaseAll;
  window.fetchSupabaseAll = (p, o) => (String(p).includes('data_prevista=gt.')
    ? Promise.reject(new Error('falha simulada da leva 2'))
    : orig(p, o));
  await loadPortalData({ silent: true });
  await new Promise((r) => setTimeout(r, 2500));
  const res = {
    agenda: state.agenda.length,
    compradores: state.buyers.length,
    aviso: (document.querySelector('#feedback, .msg')?.textContent || '').slice(0, 90),
  };
  window.fetchSupabaseAll = orig;
  return res;
}, T);

console.log(JSON.stringify(r, null, 2));
const semAlarme = !/não foi possível|erro/i.test(r.aviso);
const ok = r.agenda > 0 && r.compradores === 4 && semAlarme;
console.log('RESULT:', ok ? 'PASS (portal funcional, sem alarme)' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
```

Run igual aos anteriores.
Expected: `RESULT: PASS` — agenda com os dados da leva 1, 4 compradores, e **nenhuma** mensagem de erro na tela.

- [ ] **Step 12: Commit.**

```bash
git add frontend/script_data.js
git commit -m "feat(carga): carga progressiva da agenda (leva 1 + leva 2 em segundo plano)

Leva 1 (vencidos + proximos 3 meses) destrava a tela; leva 2 (resto do
futuro) chega em segundo plano, mescla por id e re-renderiza em silencio.
Contador de geracao descarta levas obsoletas. Backfill migrou para depois
da leva 2 - com dados parciais criaria ocorrencias duplicadas.

Conviva Viana: leva 1 ~1.190 de 3.975 linhas (-70% da janela critica).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Bump do Service Worker + Versões v73

**Files:**
- Modify: `frontend/sw.js` (linha 1)
- Modify: `frontend/script_state.js` (topo do array `VERSOES`)
- Modify: `backend/app/data/versoes.py` (topo da lista `VERSOES`)

**Interfaces:** nenhuma (conteúdo de changelog + cache).

- [ ] **Step 1: Bump do cache.**

Em `frontend/sw.js`, trocar `const CACHE = 'agenda-compras-v72';` por:

```js
const CACHE = 'agenda-compras-v73';
```

- [ ] **Step 2: Entrada `v73` como PRIMEIRO elemento de `VERSOES` em `frontend/script_state.js` (antes da `v72`).**

```js
  {
    versao: "v73",
    dataHora: "21/07/2026 — tarde",
    notas: [
      "O portal agora abre mais rápido: primeiro carrega o essencial (compromissos vencidos e dos próximos 3 meses) e o restante da agenda chega logo em seguida, sozinho.",
      "Isso reduz bastante o tempo em que uma oscilação de internet pode atrapalhar o carregamento — o principal motivo de a tela falhar em clientes com muitos compromissos agendados.",
      "Nada muda no que você vê: todos os compromissos continuam aparecendo normalmente no calendário e nas listas.",
    ],
  },
```

- [ ] **Step 3: MESMA entrada (notas byte-idênticas) no topo de `VERSOES` em `backend/app/data/versoes.py` (antes da `"v72"`).**

```python
    {
        "versao": "v73",
        "dataHora": "21/07/2026 — tarde",
        "notas": [
            "O portal agora abre mais rápido: primeiro carrega o essencial (compromissos vencidos e dos próximos 3 meses) e o restante da agenda chega logo em seguida, sozinho.",
            "Isso reduz bastante o tempo em que uma oscilação de internet pode atrapalhar o carregamento — o principal motivo de a tela falhar em clientes com muitos compromissos agendados.",
            "Nada muda no que você vê: todos os compromissos continuam aparecendo normalmente no calendário e nas listas.",
        ],
    },
```

- [ ] **Step 4: Verificar bump, parse e identidade das notas.**

```bash
grep -m1 "agenda-compras-v" frontend/sw.js
node --check frontend/script_state.js
python3 -c "import ast; ast.parse(open('backend/app/data/versoes.py').read()); print('PY ok')"
python3 -c "
import re
def v(p):
    t=open(p,encoding='utf-8').read(); i=t.find('v73'); j=t.find('v72',i)
    m=re.search(r'notas.*?\[(.*?)\]', t[i:j], re.S)
    return re.findall(r'\"((?:[^\"\\\\]|\\\\.)*)\"', m.group(1))
a=v('frontend/script_state.js'); b=v('backend/app/data/versoes.py')
print('notas v73 js/py:', len(a), len(b), 'IDENTICAS:', a==b)"
```
Expected: SW `v73`; `node --check` sem erro; `PY ok`; `IDENTICAS: True` com 3 linhas em cada.

- [ ] **Step 5: Commit.**

```bash
git add frontend/sw.js frontend/script_state.js backend/app/data/versoes.py
git commit -m "chore(carga): SW v73 + entrada Versoes (carga progressiva)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Regressão das análises e publicação (controlador)

**Files:** nenhum (validação; correções pontuais viram commits próprios).

**Interfaces:** exercita o portal completo com dados reais.

- [ ] **Step 1: Confirmar que as análises mantêm os MESMOS números de antes.**

Criar `<scratchpad>/regressao_analises.mjs` que carrega o portal (com a carga progressiva), **espera a leva 2 concluir** e compara as análises contra a carga completa feita manualmente:

```js
import { chromium } from '/Users/avj/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.mjs';

const T = '7075df8c-3b8b-49cb-9876-836c11f51eff';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);

const r = await page.evaluate(async (T) => {
  localStorage.setItem('agenda_cliente_tenant_id', T);
  await loadPortalData({ silent: true });
  const limite = Date.now() + 20000;
  while (state.agenda.length < 3975 && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 250));
  }
  document.getElementById('atPeriodPreset').value = '90dias';
  const atividades = computeAtividades(getAtividadesRange()).kpis;
  document.getElementById('efPeriodPreset').value = '90dias';
  const ef = computeEficiencia(getEficienciaRange()).kpis;
  const renders = [];
  for (const [n, f] of [['renderTables', renderTables], ['refreshCalendar', refreshCalendar],
                        ['renderCompromissos', renderCompromissos], ['renderAuditDashboard', renderAuditDashboard]]) {
    try { f(); renders.push([n, 'ok']); } catch (e) { renders.push([n, e.message]); }
  }
  return { agenda: state.agenda.length, atividades, efNFornecedores: ef.nFornecedores, renders };
}, T);

console.log(JSON.stringify({ pageErrors, ...r }, null, 2));
const ok = pageErrors.length === 0 && r.agenda === 3975 && r.renders.every(([, s]) => s === 'ok');
console.log('RESULT:', ok ? 'PASS' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
```

Expected: `RESULT: PASS`; `agenda: 3975`; todas as renderizações `ok`; KPIs de Outras Atividades e Eficiência coerentes com os valores observados antes da mudança.

- [ ] **Step 2: Conferir um tenant pequeno (leva 2 vazia, caminho idêntico ao atual).**

Repetir o `carga_e2e.mjs` trocando o tenant para **Service Farma** `c2f65634-b7e0-47f0-8937-94446540701a`.
Expected: carrega normalmente, sem erros; `agendaFinal` igual ao total do tenant; leva 2 volta vazia (nenhuma re-renderização extra).

- [ ] **Step 3: Publicar.**

```bash
git push origin main
git checkout staging && git merge main --no-edit && git push origin staging && git checkout main
```
Depois confirmar que a produção serve a v73:
```bash
curl -s "https://agenda-compras-cliente.vercel.app/sw.js?nocache=$(date +%s)" | grep -m1 "const CACHE"
```
Expected: `agenda-compras-v73`.

- [ ] **Step 4: Nenhum commit adicional se a validação passar.** Correções, se necessárias, viram commits próprios.
