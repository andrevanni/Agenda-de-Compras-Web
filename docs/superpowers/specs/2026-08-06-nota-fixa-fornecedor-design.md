# Nota fixa do fornecedor — Design

**Data:** 2026-08-06
**Status:** Aprovado para implementação
**Escopo:** Frontend (`frontend/index.html`, `frontend/script_render.js`, `frontend/script_utils.js`, `frontend/styles.css`) + entrada de versão nos dois arquivos sincronizados + PDF-guia de comunicação. **Sem backend, sem migration.**

## Contexto

Relato da compradora da **Total Socorro** (06/ago/2026, por áudio):

> "Tem opção lá de fixar as notas, né? Então a gente tava colocando observações pra próximos pedidos, coisas que a gente precisa considerar toda vez que a gente for fazer compra de um fornecedor, enfim, várias observações que a gente tava fixando lá em cada fornecedor. Porém quando a gente faz o pedido e trata agenda, essa nota ela some, ela não fica fixada no pedido pros próximos que a gente vai fazer. Será que teria como fazer alguma configuração pra que essa nota não saísse quando a gente tratasse a agenda?"

## Diagnóstico

O sistema tem **três** tipos de nota que se parecem demais na tela. A funcionalidade pedida **já existe** — é a terceira — mas é quase invisível.

| # | Onde grava | Vinculada a | Aparece no Painel? | Sobrevive ao tratamento? |
|---|---|---|---|---|
| 1 | `notas_painel` (post-it livre) | Comprador | Sim, com 📌 Post-it | Sim |
| 2 | `agenda_ocorrencias.nota` | Uma ocorrência (fornecedor + data) | Sim, com nome do fornecedor + data | A ocorrência tratada guarda a nota; **a próxima nasce vazia** |
| 3 | `fornecedores.notas_relacionamento` | O fornecedor, permanente | **Não** | Sim — é o que ela quer |

### Por que ela escolheu o campo errado

No modal de tratar agenda, o campo grande e óbvio no meio da tela é o tipo 2, rotulado **"Nota (fixada no Painel)"** ([index.html:1071](../../../frontend/index.html#L1071)). A palavra "fixada" é a armadilha — ela leu como "fixada no fornecedor".

O tipo 3 aparece só como um botão pequeno no canto do painel lateral ([index.html:1096](../../../frontend/index.html#L1096)), que muda o rótulo para "Notas salvas" quando existe conteúdo. **O texto da nota nunca é exibido.**

Pior: `refreshAgendaSupplierNotesState()` ([script_render.js:672](../../../frontend/script_render.js#L672)) tenta preencher um elemento `agendaSupplierNotesPreview` que **não existe no HTML**. É código morto — a preview foi projetada e nunca chegou à tela.

### Evidência no banco (consulta read-only, 06/ago/2026)

Total Socorro é a **maior usuária de notas de toda a base**:

| Tipo | Total Socorro |
|---|---|
| Notas de ocorrência (tipo 2) | **55** (11 em pendentes, 44 em tratadas) |
| Notas de fornecedor (tipo 3) | 5 |
| Post-its livres (tipo 1) | 0 |

O conteúdo confirma a intenção — a maioria é regra permanente, não recado do dia:

- "COLOCAR NO PEDIDO DA PERFUMARIA PARA DAR MÍNIMO DE FATURAMENTO"
- "FAZER TODA TERÇA-FEIRA PARA DAR TEMPO DE IR A TRANSFERÊNCIA"
- "GERAR NA TERÇA PARA O CESAR ENVIAR O PEDIDO NA QUARTA E FATURAR"
- "QUANDO TIVER PROMOÇÃO DE 10,99 - GERALMENTE QUINTA OU SEXTA"

### Duas correções ao relato

Ambas mudam o desenho da solução:

1. **A nota não some de fato.** Ela continua no Painel, grudada na ocorrência já tratada, com a data velha — `renderPainel` inclui `state.auditOccurrences` ([script_main.js:91](../../../frontend/script_main.js#L91)) e o SELECT de REALIZADAs traz `nota` ([script_data.js:153](../../../frontend/script_data.js#L153)). O que acontece é que a **próxima** ocorrência nasce sem nota. Efeito colateral: o Painel dela acumula 44 cards antigos.

2. **Nem toda nota dela é permanente.** Cerca de um terço é claramente pontual: "ABATIMENTO DE 40,00 DEVIDO AVARIA", "SELENIO 500MG", "ENX BUCAL VEIO AVARIADO". Um "sempre repetir a nota" cego arrastaria essas para todo pedido futuro — e geraria a reclamação inversa. Por isso a promoção é **explícita, por clique**, nunca automática.

## Decisões (aprovadas)

1. **A nota permanente é a do fornecedor** (tipo 3, `notas_relacionamento`). Sem tabela nova, sem migration, sem carregamento automático de nota entre ciclos.
2. **Os dois tipos convivem**, com nome e lugar próprios: faixa fixa em destaque no topo para a permanente, campo do ciclo embaixo, renomeado.
3. **O acervo de 55 notas se resolve pela UI**, com botão de promoção e sugestão da última nota do fornecedor. **Nenhuma mutação direta no banco.**
4. **Promoção acrescenta, não substitui.** Se o fornecedor já tem nota fixa, o texto entra numa linha nova. Ninguém perde texto por engano.
5. **Depois de fixar, o campo do ciclo é limpo.** Senão o mesmo texto fica em dois lugares na mesma tela e o card duplicado continua no Painel.

### Fora de escopo (registrado, não implementado)

- Os **44 cards de agendas já tratadas** no Painel de Notas. Depois que ela fixar as regras permanentes, boa parte perde a razão de existir e pode ser removida pelo X do card. Se continuar incomodando, vira segunda leva com o retorno dela.
- **Post-it livre** (tipo 1) — não é tocado.
- **Migração automática** das notas antigas no banco.
- **Compromissos genéricos** — não têm fornecedor, a faixa não se aplica. Só o rótulo do campo muda lá.

## Implementação

### A. Faixa "📌 Nota fixa deste fornecedor"

Bloco novo no `agendaDetailModal`, entre o `agendaDetailGrid` (dados do fornecedor) e o campo Observação.

- **Com nota:** título "📌 NOTA FIXA DESTE FORNECEDOR" + botão `Editar`, e o texto integral num box destacado, com quebras de linha preservadas (`white-space: pre-wrap`).
- **Sem nota:** linha discreta "Sem nota fixa neste fornecedor" + botão `Adicionar`.
- **Editar/Adicionar** troca o box por um `<textarea>` inline com `Salvar` / `Cancelar` — sem abrir outro modal.
- **Salvar** chama `persistSupplierNote()` ([script_utils.js:754](../../../frontend/script_utils.js#L754)), que já cobre os dois caminhos (coluna real e o fallback legado em `clientes.observacoes`). **Não** chamar `loadPortalData()` — atualização local do `state.suppliers` + re-render da faixa, no padrão do `saveAgendaNota`.
- `refreshAgendaSupplierNotesState()` passa a encontrar o `agendaSupplierNotesPreview` de verdade: o código morto vira código vivo.
- O botão "Notas" do painel lateral **continua existindo** — a tela de Fornecedores usa o mesmo `supplierNotesModal`.

⚠️ O modal é `<form method="dialog">`. Todo botão novo precisa de `type="button"`, senão fecha o modal ao clicar.

### B. Rótulos

| Onde | De | Para |
|---|---|---|
| [index.html:1071](../../../frontend/index.html#L1071) (tratar agenda) | "Nota (fixada no Painel)" | "Lembrete só deste pedido" + hint *"aparece no Painel de Notas e não passa para os próximos pedidos"* |
| [index.html:1578](../../../frontend/index.html#L1578) (Novo Evento) | "Nota (fixada no Painel)" | "Lembrete só deste compromisso" + mesmo hint |

### C. Botão 📌 "Fixar neste fornecedor"

Ao lado do "💾 Salvar lembrete", habilitado só quando há texto no campo do ciclo.

Fluxo ao clicar:

0. **Confirmação** mostrando o texto que vai virar permanente — proteção contra promover por engano um recado pontual ("abatimento de 40,00 por avaria").
1. Se o fornecedor já tem nota fixa, o texto é **acrescentado** ao final, separado por linha em branco.
2. `persistSupplierNote()` grava.
3. PATCH `nota = null` na ocorrência atual + atualização local (`state.agenda` / `state.auditOccurrences`) + `renderPainel()`.
4. Faixa re-renderiza com o texto novo; campo do ciclo fica vazio.
5. Feedback: *"Nota fixada no fornecedor. Ela vai aparecer em todos os próximos pedidos."*

### D. Sugestão da última nota

Só quando o fornecedor **não** tem nota fixa **e** existe nota em ocorrência anterior dele. Dentro da faixa:

> *Última nota registrada neste fornecedor em 03/08/2026:* "FAZER TODA TERÇA-FEIRA…" **[📌 Fixar]**

- **Fonte:** `[...state.agenda, ...state.auditOccurrences]`, filtrando `fornecedor_id`, `nota` preenchida, excluindo a ocorrência atual; ordena por `data_prevista` desc e pega a primeira.
- `state.auditOccurrences` é carregado **inteiro e paginado na leva 1** ([script_data.js:153](../../../frontend/script_data.js#L153)) — a invariante de carga parcial não prejudica a sugestão, porque as notas antigas relevantes estão em ocorrências já REALIZADAS.
- Clicar passa pela **mesma confirmação** do item C e **não** altera a ocorrência antiga: ela é o histórico de um pedido que já aconteceu.

### E. Versão e Service Worker

- Entrada nova **v78** no topo de `VERSOES` em [script_state.js](../../../frontend/script_state.js) **e** [versoes.py](../../../backend/app/data/versoes.py) — os dois sincronizados.
- Bump `frontend/sw.js`: `agenda-compras-v77` → **`v78`**.
- Texto das notas sem citar nome de cliente, fornecedor ou pessoa, e sem jargão técnico.

## PDF-guia para a compradora

Documento de comunicação, **não versionado no repo** — mesmo precedente do guia de Outras Atividades (jul/2026). Gerado com ReportLab reusando o padrão visual de [pdf_service.py](../../../backend/app/services/pdf_service.py), salvo em `~/Desktop/`.

Conteúdo, nesta ordem:

1. **O que você reportou** — o relato dela, em uma frase.
2. **O que encontramos** — as três notas explicadas em linguagem de operação, sem nome de tabela nem termo técnico; por que o campo que ela usava parecia ser o certo; e a correção honesta de que a nota não sumia, ficava presa ao pedido antigo.
3. **O que mudamos** — a faixa nova, o rótulo novo, o botão de fixar, a sugestão da última nota. Com captura de tela de cada um.
4. **Passo a passo: criar uma nota fixa** — numerado, do login até o resultado.
5. **Passo a passo: aproveitar as notas que você já escreveu** — o caminho de um clique, que evita redigitar as 55.
6. **Quando usar cada tipo** — tabela curta: regra que vale sempre → nota fixa; recado de um pedido só → lembrete; anotação solta → post-it.
7. **O que não mudou** — o que ela já escreveu continua lá; nada foi apagado.

Escrito na linguagem dela, endereçado a ela pelo nome. Nomes de fornecedores só nas capturas de tela, que são do próprio ambiente dela.

## Validação

- **Playwright no Chromium empacotado e no Google Chrome real** (memória [[validar-no-chrome-real]]): faixa com e sem nota, edição inline, promoção com e sem nota preexistente, sugestão da última nota, campo do ciclo preservando o comportamento atual, e zero `pageerror` no boot.
- **Temas claro e escuro** conferidos por screenshot. Usar `--panel-soft`, `--line`, `--panel`, `--text`, `--muted` — `--surface-alt`, `--border` e `--card-bg` não existem no `styles.css`.
- **Escrita só no tenant Service Farma** (`c2f65634-b7e0-47f0-8937-94446540701a`). **Total Socorro permanece read-only** durante todo o desenvolvimento.
- `node --check` nos arquivos JS alterados.
- **WebKit/Safari não será testado** — a mudança não toca em Service Worker além do bump, mas a lacuna será declarada na entrega.

## Riscos

| Risco | Mitigação |
|---|---|
| Promoção sobrescrever nota fixa existente | Acrescenta em linha nova, nunca substitui |
| Botão novo dentro de `<form method="dialog">` fechar o modal | `type="button"` obrigatório em todos |
| Regra global `input, select, textarea { width: 100% }` deformar controles novos | Já existe override para checkbox/radio (v76); conferir por screenshot |
| Usuário promover por engano uma nota pontual | Confirmação antes de fixar, mostrando o texto que vai virar permanente |
| Nota fixa longa esticar o modal | Box com `max-height` e rolagem própria |
