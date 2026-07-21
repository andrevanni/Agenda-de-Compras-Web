# Carga progressiva da agenda — Design

**Data:** 2026-07-21
**Status:** Aprovado para implementação
**Escopo:** Frontend (`frontend/script_data.js` + helper em `script_render.js`). Sem backend, sem migration.

## Contexto

O relato da **Conviva Viana** ("do nada some a nossa agenda e aparece essa outra desse pessoal") foi diagnosticado em 21/jul/2026 e corrigido na **v72**: a causa do sintoma era o fallback para dados de demonstração quando `loadPortalData` falhava. Os mocks foram removidos, o estado passou a ser preservado e o `fetchSupabase` ganhou retry em GET.

O **gatilho** da falha foi identificado por eliminação, com testes contra os dados reais:

- 11 queries individuais: todas 200, sem anomalias.
- Carga completa repetida 8×: 0 falhas.
- Renderização com dados reais (3.975 pendentes, 732 realizadas): 0 falhas.
- Rede lenta (4 Mbps → 400 kbps): 0 falhas (pior caso 8s).
- **Queda momentânea de conexão durante a carga: é o gatilho.**

A v72 tornou a falha **inofensiva** (recupera sozinha em blips; preserva dados reais em quedas longas). Este spec ataca a **probabilidade**: quanto menor a janela de carga, menor a chance de uma oscilação cair dentro dela.

### Medições que motivam a mudança (Conviva Viana, `7075df8c-3b8b-49cb-9876-836c11f51eff`)

| Item | Valor |
|---|---|
| Pendentes | **3.975** (4 páginas) — 25 de fornecedor + 3.950 genéricos |
| Realizadas/Adiadas | 732 (1 página) |
| Tempo só da carga de pendentes | **~2,5 s** |
| Carga completa (9 queries + paginadas) | ~3,2 s (média de 8 execuções) |

Os 3.950 genéricos são **39 séries** — ~11 rotinas diárias de um comprador, indo até 01/06/2027. Uso legítimo; não serão apagados.

## Reenquadramento que viabiliza a solução

Os pendentes **distantes no futuro não são usados por nenhuma análise**:

- Auditoria, Eficiência e Outras Atividades oferecem períodos de até **180 dias para trás** (+ "entre datas"), e desde a v70 contam pendentes apenas por `data_prevista` **dentro da janela analisada**, que termina em `hoje`.
- Logo, pendentes com data futura distante servem só a: **calendário navegado para frente**, lista de **Compromissos** e **Próximas Agendas**.

Isso permite adiar essa fatia sem prejudicar nenhuma análise.

## Decisões (aprovadas)

1. **Estratégia**: carga progressiva (não janela fixa, não busca sob demanda) — preserva todo o comportamento atual.
2. **Janela essencial (leva 1)**: todos os vencidos + **próximos 3 meses**.
3. **Leva 2**: silenciosa — atualiza sozinha ao concluir; sem aviso visual em caso de falha.

## Arquitetura

Apenas a carga de **pendentes** (`state.agenda`) é dividida. As demais 8 queries são pequenas; o histórico (`REALIZADA/ADIADA`) permanece na leva 1 porque várias telas dependem dele e custa ~700 ms.

### Leva 1 — bloqueante (mantém o fluxo atual)

Query de pendentes ganha o filtro superior:

```
&data_prevista=lte.<hoje+3meses>
```

Sem limite inferior: **todos os vencidos entram** (seção Atrasadas íntegra). Continua usando `fetchSupabaseAll` (paginação) e `order=data_prevista.asc`.

Terminada a leva 1, `state.agenda` recebe esses dados e o portal renderiza exatamente como hoje — sem mudança visual.

### Leva 2 — segundo plano

Disparada **sem `await`** após a renderização:

```
&data_prevista=gt.<hoje+3meses>
```

Ao concluir com sucesso:
1. Mescla em `state.agenda` com **dedup por `id`** (defensivo contra sobreposição de fronteira).
2. Chama `renderTables()` e `refreshCalendar()`.
3. Executa o **backfill** (ver seção crítica abaixo).

Ao falhar: apenas `console.warn`. Nenhum feedback visual — o portal está funcional com o essencial e a próxima sincronização tenta de novo.

### Guarda de concorrência (obrigatória)

`loadPortalData` é chamado de **10+ lugares** (após tratar agenda, salvar fornecedor/comprador, sincronizar…). Sem proteção, uma leva 2 antiga poderia sobrescrever dados recém-carregados por uma carga mais nova.

Solução: um contador de geração em módulo (`_cargaGeracao`). Cada `loadPortalData` incrementa e captura o valor; ao concluir, a leva 2 só aplica o resultado se sua geração ainda for a corrente. Caso contrário, descarta silenciosamente.

## ⚠️ Backfill precisa de dados completos

`backfillMissingPendingOccurrences(supplierRows, agendaRows)` decide **quais fornecedores estão sem ocorrência pendente** a partir da lista recebida. Se rodasse apenas com a leva 1, um fornecedor cuja única pendência esteja além de +3 meses pareceria "faltando" e o sistema **criaria uma ocorrência duplicada**.

**Regra:** o backfill roda **somente após a leva 2**, com a agenda completa. Se a leva 2 falhar, o backfill não roda naquele ciclo e roda na próxima carga — degradação segura.

Consequência: o feedback "N agenda(s) pendente(s) foram geradas automaticamente" passa a aparecer **depois** da renderização inicial (quando houver criação). Aceitável.

## Tratamento de erro

| Situação | Comportamento |
|---|---|
| Leva 1 falha | Comportamento da v72: preserva o último estado bom + mensagem clara. Nunca dados de demonstração |
| Leva 2 falha | `console.warn`, sem aviso visual; backfill não roda no ciclo |
| Leva 2 obsoleta | Descartada pelo contador de geração |
| Leva 2 concluída | Mescla com dedup + re-render silencioso + backfill |

## Impacto esperado

| | Antes | Depois (leva 1) |
|---|---|---|
| Linhas (Conviva Viana) | 3.975 (4 páginas) | **~1.190 (2 páginas)** |
| Tempo da parte de pendentes | ~2,5 s | **~1 s** |

Janela crítica reduzida em ~70% para o maior cliente. Clientes pequenos ficam essencialmente iguais (uma página só, leva 2 vazia).

## Riscos e mitigações

- **Dados incompletos por alguns segundos**: navegar o calendário para +4 meses imediatamente após o login pode não mostrar tudo até a leva 2 chegar (~1–3 s), e então a tela se atualiza sozinha. Aceito na decisão de produto.
- **Leva obsoleta sobrescrevendo dados novos** → contador de geração.
- **Backfill duplicando ocorrências** → roda só com dados completos (seção acima).
- **Fronteira entre as levas** (uma linha aparecer nas duas) → dedup por `id` na mesclagem.
- **Regressão em clientes pequenos** → leva 2 volta vazia; caminho idêntico ao atual.

## Testes (Playwright, dados reais da Conviva Viana)

1. **Tempo**: leva 1 mede ~1 s e ~1.190 linhas; total após leva 2 = **3.975**.
2. **Integridade**: `state.agenda` final tem exatamente os mesmos ids da carga completa atual, **sem duplicatas**.
3. **Vencidos**: todos os pendentes com `data_prevista < hoje` estão na leva 1.
4. **Concorrência**: disparar duas cargas em sequência; a leva 2 da primeira é descartada (não sobrescreve).
5. **Falha da leva 2**: simular offline após a leva 1 → portal funcional, sem aviso de erro, backfill não executado.
6. **Clientes pequenos**: tenant com poucos pendentes carrega igual, leva 2 vazia.
7. **Regressão**: renderizações e análises (Auditoria, Eficiência, Outras Atividades) com os mesmos números de hoje.

## Fora de escopo

- Apagar/reduzir as séries recorrentes do cliente (decidido: não mexer nos dados).
- Busca sob demanda ao navegar o calendário.
- Paginação/janela nas demais queries (todas pequenas).
- Mudanças no backend ou no relatório.
