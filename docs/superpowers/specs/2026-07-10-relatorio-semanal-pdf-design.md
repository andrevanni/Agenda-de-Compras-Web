# Relatório Semanal por PDF para Gestores — Design

**Data:** 2026-07-10
**Status:** Aprovado para implementação
**Escopo:** Backend (`backend/`) + 1 migration + entrada de Versões (frontend). Novo relatório semanal por e-mail/PDF, reaproveitando a infraestrutura do relatório diário.

## Contexto e objetivo

O relatório **diário** (cron 21h BRT seg–sex) é focado em Agenda de Compras (fornecedores). O usuário quer um relatório **semanal** para gestores, com um **panorama completo da semana útil anterior (seg–sex)**: desempenho na Agenda de Compras **e** as Outras Atividades (compromissos genéricos), reaproveitando o máximo da infra existente.

Este é o **Projeto B**, complementar à aba "Outras Atividades" (Projeto A, já entregue na v68). Reusa os conceitos de agregação do Projeto A, agora no backend em Python.

## Decisões de escopo (aprovadas)

1. **Conteúdo**: tudo — Agenda de Compras (semana) + Outras Atividades (semana).
2. **Destinatários**: mesmos do diário — compradores com `receber_auditoria` OU `receber_agenda_proximo` + admins inscritos (`admin_report_subscriptions`). Gestor recebe consolidado de todos; não-gestor, a própria carteira.
3. **Agendamento**: segunda de manhã ~07:00 BRT.
4. **Estilo do PDF**: cards de KPI + tabelas + **2 gráficos simples** (um por parte), desenhados no próprio PDF via ReportLab.
5. **Versões + SW**: incluir entrada nova no menu Versões (frontend) e bumpar o SW **v68 → v69**.

## Disparo e período

- **Cron novo** em `backend/vercel.json` (array `crons`): `{ "path": "/api/v1/cron/relatorio-semanal", "schedule": "0 10 * * 1" }` — segunda 10:00 UTC = **07:00 BRT**.
- Como roda na segunda, a semana consolidada é a **útil anterior**: `segunda_ref = data_execução` (uma segunda), `inicio = segunda_ref − 7 dias`, `fim = segunda_ref − 3 dias` (a sexta anterior). Ex.: roda 13/07 → janela 06/07 (seg) a 10/07 (sex).
- **Endpoint novo** `/api/v1/cron/relatorio-semanal` em `backend/app/api/v1/cron.py`:
  - `GET` — chamado pelo Vercel Cron (auth `Authorization: Bearer {CRON_SECRET}` ou `X-Cron-Secret`).
  - `POST` — disparo manual; params `tenant_id`, `semana_ref` (uma data qualquer da semana-alvo; default = semana anterior), `admin_only`, `comprador_id`.
  - Mesma função `_verificar_auth` já existente.

## Destinatários (reaproveita a lógica do diário)

Mesma query de seleção de compradores (`WHERE receber_auditoria = true OR receber_agenda_proximo = true`) e mesma distinção gestor/não-gestor de `enviar_relatorios_tenant`. Admins inscritos recebem cópia consolidada (nível gestor).

**Decisão de conteúdo por destinatário:** o semanal é um **panorama** — todos que recebem veem **as duas partes** (A e B). Diferente do diário (que inclui seções conforme cada flag), o semanal não fationa por flag: a flag define apenas **quem recebe**; o conteúdo é o panorama completo, escopado por gestor (todos os compradores) vs. não-gestor (própria carteira via `comprador_id`).

## Conteúdo do PDF (2 partes)

### Parte A — Agenda de Compras (semana)
- **KPIs da semana**: reusa `_kpis_query(db, tenant_id, inicio, fim, comprador_id=None)` com a janela seg–sex. Cards: total, realizadas, adiadas, atrasadas, pendentes, postergadas, antecipadas, aumentos/reduções de parâmetro, pedidos (sim/não), **valor total** e **taxa de pedido**.
- **Tabela por comprador** (no consolidado do gestor/admin): uma linha por comprador com seus KPIs principais — obtida chamando `_kpis_query` por `comprador_id` para cada comprador do tenant (loop; poucos compradores). Não-gestor: só a própria linha.
- **Gráfico A** (ReportLab): barras de **valor comprado por comprador** na semana (fallback: realizadas por comprador se sem valores).

### Parte B — Outras Atividades (semana)
Queries novas em Python (espelhando `computeAtividades` do Projeto A). Genérico = `fornecedor_id IS NULL AND categoria_id != (categoria "Agenda de Compras" do tenant)`.
- **Concluídas**: `status='REALIZADA'` + genérico + `data_realizacao BETWEEN inicio AND fim`.
- **Pendentes/atrasadas**: `status='PENDENTE'` + genérico — **retrato atual** (na data de execução), atrasada = `data_prevista < hoje`, pendente = caso contrário.
- **Cards**: total, concluídas, pendentes, atrasadas, taxa de conclusão (%), nº de categorias ativas.
- **Tabela por comprador** e **tabela por categoria** (total / concluídas / pendentes / atrasadas).
- **Gráfico B** (ReportLab): tarefas **por categoria** (barras horizontais ou rosca), usando as cores das categorias quando disponíveis.
- Escopo: gestor/admin = todos os compradores; não-gestor = filtra por `comprador_id`.

## PDF — novo builder (reaproveitando helpers)

Nova função em `backend/app/services/pdf_service.py`:

```
build_relatorio_semanal_pdf(
    nome_destinatario, is_gestor, inicio, fim,
    kpis_semana, kpis_por_comprador,            # Parte A
    atividades_kpis, atividades_por_categoria, atividades_por_comprador,  # Parte B
    tenant_name
) -> bytes
```

Reaproveita: `_s`, `_empty_msg`, `_section_banner`, `_kpi_cards`, tabelas genéricas, `_fetch_sf_logo`, `_draw_footer`, e a paleta `C_*`.
- **`_hero_band` parametrizado**: hoje tem "RELATÓRIO DIÁRIO" fixo (pdf_service.py:131). Adicionar parâmetro de subtítulo/tipo (ex.: `titulo_faixa="RELATÓRIO SEMANAL"`, `data_label="DD/MM a DD/MM"`) sem quebrar o uso do diário (default mantém "RELATÓRIO DIÁRIO").
- **Gráficos**: `reportlab.graphics.charts` (`VerticalBarChart`/`HorizontalBarChart`/`Doughnut`) dentro de um `Drawing`. Manter 2 gráficos simples (um por parte). Funções auxiliares novas `_bar_chart(...)` / `_cat_chart(...)` no pdf_service.

### Estrutura visual do PDF
1. **Hero band**: "RELATÓRIO SEMANAL — DD/MM a DD/MM", tenant, destinatário.
2. **Parte A — Agenda de Compras**: banner + cards de KPI da semana + gráfico A + tabela por comprador.
3. **Parte B — Outras Atividades**: banner + cards + gráfico B + tabela por categoria + tabela por comprador.
4. **Rodapé**: logo Service Farma (reusa `_draw_footer`).

## `relatorio_service.py` — novas funções

Espelham a arquitetura de 3 fases do diário (Session SQLAlchemy não é thread-safe):

```
enviar_relatorio_semanal_tenant(db, tenant_id, semana_ref=None, admin_only=False, comprador_id=None) -> dict
enviar_relatorio_semanal_todos_tenants(db, semana_ref=None) -> dict   # itera tenants com envio_relatorio_ativo
```

- **Fase 1 (série)**: calcula janela seg–sex; carrega dados gerais uma vez (KPIs semana + por comprador + Outras Atividades gerais); monta payloads por destinatário (gestor usa gerais; não-gestor re-executa por `comprador_id`); gera HTML + PDF.
- **Fase 2 (paralela)**: `ThreadPoolExecutor(max_workers=EMAIL_PARALLEL_WORKERS)` → `send_html(...)` com anexo `[(pdf_filename, pdf_bytes)]`.
- **Fase 3 (série)**: `_log_envio(...)` com o `tipo` semanal.
- **HTML do e-mail**: novo `_build_html_email_semanal(...)` (corpo inline-CSS resumido; o PDF carrega o detalhe). Assunto: `f"Agenda de Compras — Relatório Semanal {DD/MM} a {DD/MM}"`. `pdf_filename`: `f"relatorio_semanal_{inicio}_{fim}.pdf"`.
- Reusa `_kpis_query`, `_get_feriados`, `_fmt`, `DIAS_PT`/`MESES_PT`. Novas queries: `_kpis_por_comprador_semana(...)`, `_atividades_semana(...)` (concluídas + pendentes/atrasadas + agregações por categoria e comprador).

## Migration — `backend/db/schema_v19_relatorio_semanal_log.sql`

Só altera o CHECK de `relatorio_log.tipo` (tabela existente — **não** é tabela nova, então não requer GRANT/RLS novos):

```sql
ALTER TABLE relatorio_log DROP CONSTRAINT IF EXISTS relatorio_log_tipo_check;
ALTER TABLE relatorio_log ADD CONSTRAINT relatorio_log_tipo_check
  CHECK (tipo IN ('auditoria','agenda_proximo','consolidado_gestor','convite','admin_copia',
                  'semanal_gestor','semanal_auditoria','semanal_admin_copia'));
```

- `semanal_gestor` — comprador gestor (consolidado).
- `semanal_auditoria` — comprador não-gestor (própria carteira).
- `semanal_admin_copia` — cópia para admin inscrito.

## Versões + Service Worker

- Nova entrada `v69` no topo de `VERSOES` em **frontend/script_state.js** e **backend/app/data/versoes.py** (byte-idênticas), anunciando o relatório semanal para gestores em linguagem de usuário final, sem nomes reais.
- Bump `frontend/sw.js`: `agenda-compras-v68 → v69`.

## Testes

- **Disparo manual admin-only** (não afeta compradores): `POST /api/v1/cron/relatorio-semanal?tenant_id=c2f65634-b7e0-47f0-8937-94446540701a&admin_only=true` com `X-Cron-Secret: agenda-cron-2026-sfx` → confere `sent/errors` e a entrega a `andre@servicefarma.far.br`.
- **Disparo pontual a 1 comprador**: `...&comprador_id=Y&semana_ref=AAAA-MM-DD`.
- Abrir o PDF: hero "RELATÓRIO SEMANAL — período" correto; KPIs da semana batendo; Outras Atividades (concluídas/pendentes/atrasadas por categoria e comprador) coerentes; os 2 gráficos renderizando sem erro.
- Validar cálculo da janela seg–sex (rodar com `semana_ref` de uma semana conhecida).
- Conferir `relatorio_log` gravando os novos `tipo`s.

## Riscos e mitigações

- **maxDuration Vercel (default 60s)**: PDF semanal é maior; manter a paralelização por tenant. Se estourar, reduzir conteúdo/lote — **não** migrar `vercel.json` para o formato `functions` (já quebrou o build antes; ver CLAUDE.md).
- **Gráficos ReportLab**: manter 2 simples; validar renderização antes de considerar pronto. Se um gráfico falhar, degradar para tabela (try/except no builder) — nunca quebrar o PDF inteiro por causa de um gráfico.
- **`_hero_band` compartilhado com o diário**: parametrizar com default retrocompatível; conferir que o diário continua idêntico.
- **Escopo genérico (Outras Atividades)**: usar o mesmo discriminador do Projeto A (categoria "Agenda de Compras" excluída), garantindo consistência entre dashboard e relatório.

## Fora de escopo

- Novo controle de opt-in separado para o semanal (decidiu-se reusar os destinatários do diário).
- Mudança no relatório diário (além de parametrizar `_hero_band` de forma retrocompatível).
- Gráficos no relatório diário.
- Nova UI no painel admin (o semanal reusa `admin_report_subscriptions` e os flags existentes).
