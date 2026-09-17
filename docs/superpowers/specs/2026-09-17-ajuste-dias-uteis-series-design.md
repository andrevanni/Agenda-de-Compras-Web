# Séries em dias úteis — criação e correção de séries existentes

**Data:** 17/09/2026 · **Versão alvo:** v79 (SW `agenda-compras-v78` → `v79`)
**Origem:** sugestão de comprador (Drogaria SV), com prints do calendário.

## Problema

1. **Séries diárias antigas têm sábado e domingo gravados.** A v77 (31/jul) passou a permitir escolher os dias da semana na recorrência Diária, mas só para séries **novas**. Para as antigas a orientação era "exclua a série inteira e recrie" — o retrabalho que o comprador pediu para evitar. O modal de edição só oferece Só esta / Esta e as próximas / Toda a série; nenhuma remove dias específicos.
2. **Séries mensais caem em fim de semana e feriado.** E há uma causa por trás: a recorrência "Mensal" **soma 30 dias** (`buildRecorrenciaDates`, `mensal: 30`), então a data recua ~1 dia por mês e o dia da semana muda sempre. Série real: `28/07 → 27/08 → 26/09 (sáb) → … → 25/12 (Natal) → 24/01 (dom) → … → 23/07`.

### Levantamento no banco (17/09/2026, só leitura)

- **Todos os tenants:** ~1.780 pendências de fim de semana em 27 séries diárias; ~130 em ~39 séries mensais. Um tenant tem 106 pendências de fim de semana já vencidas.
- **Drogaria SV:** 430 pendências de fim de semana em 11 séries, **nenhuma vencida** e **158 concluídas** — a equipe vinha "concluindo" sábados e domingos à mão para limpar a tela (retrabalho que também infla a taxa de conclusão de Outras Atividades).
- As 50 do comprador que reportou foram removidas por SQL em 17/09/2026, com autorização explícita (backup JSON antes, transação com contagem). As demais ficam para o próprio comprador resolver pela UI (preferência: consertar o sistema para o usuário agir pela UI, sem mutação direta).

## Decisões

| # | Decisão |
|---|---|
| D1 | Data que cai em **sábado, domingo ou feriado cadastrado do tenant** (tabela `feriados`, a mesma do calendário) vai para o **próximo dia útil**. |
| D2 | **Mensal = mesmo dia do mês** nas séries novas. Dia inexistente no mês (31 em fevereiro) = último dia do mês. |
| D3 | A regra vale **na criação** (séries novas já nascem certas) **e** numa **ação de correção** para séries existentes. |
| D4 | Séries mensais antigas **não** têm o dia do mês reescrito — só recebem o ajuste de dia útil. |
| D5 | Semanal e quinzenal seguem a regra da mensal (movem). |
| D6 | Diária **remove** (mover criaria duplicata no dia seguinte, que já tem a sua). |
| D7 | Só `status = PENDENTE` é tocado. Concluídas são histórico. |

## 1. Criação (modal Novo Evento)

### Função `proximoDiaUtil(iso)`

Em [script_main.js](../../../frontend/script_main.js), ao lado de `isFeriado`. Avança dia a dia (`addDaysLocalIso`) enquanto a data for sábado, domingo ou `isFeriado`. Guarda de 60 iterações (nunca laço infinito com cadastro de feriados absurdo). Dia da semana calculado por componentes locais — **nunca** `toISOString()` (ver o bug de fuso de `nextCalendarDate` registrado na v77).

### Geração de datas

| Recorrência | Hoje | Passa a ser |
|---|---|---|
| Mensal | `base + 30·n` | ideal = mesmo dia do mês de `base` no mês `n` (clamp ao último dia) → `proximoDiaUtil` |
| Semanal | `base + 7·n` | ideal = `base + 7·n` → `proximoDiaUtil` |
| Quinzenal | `base + 14·n` | ideal = `base + 14·n` → `proximoDiaUtil` |
| Diária | `buildDiariaDates` (dias + pular feriados) | inalterada; o checkbox **"Pular feriados" passa a vir marcado** |

- **O ajuste parte sempre da data ideal**, nunca da data já ajustada — não acumula.
- **A 1ª data também é ajustada** (inclui `n = 0`): série criada num sábado começa na segunda.
- **Limite de período:** a iteração para quando a **data ideal** passa de `fim` (ou `base + 365` sem fim). A data ajustada pode ultrapassar `fim` em poucos dias — é a ocorrência daquele período e é criada.
- **Deduplicação defensiva:** se duas ideais ajustadas colidirem na mesma data (não ocorre com passo ≥ 7 e feriados realistas), mantém uma.
- Teto de 500 ocorrências mantido.
- Nova função pura `buildRecorrenciaDatesUteis(baseDate, tipo, fimStr)` substitui `[data, ...buildRecorrenciaDates(...)]` em `saveNewEvent`. `buildRecorrenciaDates` fica sem uso e é removida.
- O JSON da coluna `recorrencia` ganha `ajuste: "proximo_dia_util"` e, na mensal, `dia_mes` — informativo, ninguém lê de volta hoje.

### Prévia

`updateNewEventPreview` passa a funcionar para todas as recorrências:
`📅 12 data(s) · 28/09/2026 → 30/08/2027 · 3 ajustada(s) para o próximo dia útil`.
Na diária mantém o texto atual de feriados pulados.

O aviso atual "⚠️ DD/MM é feriado" sobre a 1ª data continua valendo só para evento **avulso** (sem recorrência) — nas séries, a data já foi ajustada.

## 2. Correção — "Ajustar dias desta série"

### Onde

Botão **"🗓️ Ajustar dias desta série"** dentro do bloco `newEventEditScopeWrap` do modal de edição (só aparece com `serie_id`). Abre um `<dialog>` próprio, `serieAjusteModal`, sobreposto ao modal de edição — separado do Salvar e do Excluir. Ao concluir, fecha os dois modais.

### Tipo da série

1. Lê `recorrencia` da ocorrência (a coluna guarda JSON **duplamente codificado** — string JSON dentro de JSONB; parse tolerante a ambos os formatos).
2. Se ausente/ilegível: busca as datas da série e usa a **mediana do intervalo** entre datas consecutivas distintas — `≤ 1` dia → diária; senão → periódica.

### Leitura (sempre do servidor)

`fetchSupabaseAll` de `agenda_ocorrencias?select=id,data_prevista,nota&serie_id=eq.X&tenant_id=eq.T&status=eq.PENDENTE&order=data_prevista.asc,id.asc`. Nunca `state.agenda` (pode estar parcial — invariante da carga progressiva).

### Modo diária — remove

- Checkboxes Seg–Dom, **marcado = manter**, Seg–Sex marcados por padrão; checkbox **"Também remover feriados cadastrados"** marcado.
- Alvo: pendentes em dia desmarcado **ou** (checkbox ativo e `isFeriado`), **inclusive vencidas**.
- **Ocorrências com `nota` são preservadas** e contadas à parte.
- Prévia: `Serão removidas 44 ocorrência(s) · 19/09/2026 → 14/02/2027` + `2 mantida(s) por terem lembrete` quando houver. Recalcula ao mudar checkboxes. Nenhum dia marcado → bloqueia com mensagem.

### Modo periódica — move

- Sem opções. Alvo: pendentes com `data_prevista >= hoje` em que `proximoDiaUtil(data) !== data`.
- Prévia lista as mudanças: `Serão movidas 3: 26/09 → 28/09 · 25/12 → 28/12 · …` (até 8 linhas + "e mais N").
- Nada a fazer → mensagem "Nenhuma ocorrência desta série cai em fim de semana ou feriado." e botão desabilitado.

### Gravação

- `confirm()` com a mesma contagem da prévia; botão desabilitado durante a gravação.
- **Diária:** `DELETE agenda_ocorrencias?id=in.(…)&tenant_id=eq.T&status=eq.PENDENTE` em lotes de 100 ids (os filtros extras são segunda trava).
- **Periódica:** `PATCH ?id=eq.X&tenant_id=eq.T&status=eq.PENDENTE` com `data_prevista` nova, uma por ocorrência, em série.
- **Falha parcial:** para no primeiro erro e informa `N de M concluídas; tente de novo`. Rodar de novo é seguro — a prévia é recalculada e só pega o que restou.
- **Depois:** fecha os modais, `loadPortalData({ silent: true })` + `refreshCalendar()`, feedback de sucesso.
- Guarda de geração no padrão de `_serieLabelToken`: resposta tardia de uma série A não escreve na prévia de uma série B aberta depois.

## Fora de escopo

- Reescrever o dia do mês de mensais antigas (D4).
- Ocorrências concluídas; Agenda de Compras (fornecedor); backend; banco (sem migration).
- Ação em massa "todas as séries do comprador" — a correção é por série.
- Gravar os dias escolhidos no JSON `recorrencia` de séries antigas.

## Entrega

- Branch `feat/dias-uteis-series` a partir de `staging`.
- SW `v78 → v79`; entrada `v79` em `VERSOES` em [script_state.js](../../../frontend/script_state.js) e [versoes.py](../../../backend/app/data/versoes.py). As notas avisam a **mudança de comportamento**: mensal no mesmo dia do mês e feriados pulados por padrão.
- Ajuda do portal: itens de Compromissos/Calendário cobrindo o ajuste e a ação nova.
- `CLAUDE.md`: seção "Modal Novo Evento / Edição" atualizada.

## Validação

- **Oráculo independente em Python** para a geração de datas: mensal com base 29/30/31, fevereiro bissexto, virada de ano, feriado emendado em fim de semana (sex feriado + sáb + dom → seg), semanal/quinzenal com base em sábado, limite de período.
- **Playwright** com estado stubado, no **Chromium e no Google Chrome real**: prévia da criação, ação de correção nos dois modos (contagens, preservação de lembrete, lotes, falha parcial com `fetchSupabase` stubado), guarda de geração, zero `pageerror`.
- **E2E real só na Service Farma** (`c2f65634-…`): cria série de teste, corrige, relê o Supabase, apaga a série de teste. Aborta **antes de qualquer escrita** se a leitura inicial falhar (espera ativa, nunca `sleep` fixo).
- Temas claro e escuro por screenshot.
- **Lacuna declarada:** WebKit/Safari não testado.
- Revisão: 1 revisor ao final; achados conferidos no código.
