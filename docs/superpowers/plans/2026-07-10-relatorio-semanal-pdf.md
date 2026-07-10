# Relatório Semanal por PDF para Gestores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um relatório SEMANAL por e-mail/PDF para gestores (segunda 07:00 BRT, consolidando a semana útil anterior), com Agenda de Compras + Outras Atividades, reaproveitando a infraestrutura do relatório diário.

**Architecture:** Backend Python. Novo endpoint `/api/v1/cron/relatorio-semanal` (cron `0 10 * * 1`) chama `enviar_relatorio_semanal_tenant` em `relatorio_service.py`, que reusa `_kpis_query`, a seleção de destinatários e a arquitetura de 3 fases (montar em série → enviar em paralelo → logar em série) do diário. O PDF sai de um novo `build_relatorio_semanal_pdf` em `pdf_service.py`, reusando os helpers existentes + 2 gráficos ReportLab. Novas queries agregam as Outras Atividades (compromissos genéricos).

**Tech Stack:** FastAPI, SQLAlchemy (raw SQL via `text()`), ReportLab (PDF + graphics.charts), Resend/SMTP via `email_service.send_html`, PostgreSQL (Supabase pooler).

## Global Constraints

- **Reusar, não recriar**: `_kpis_query(db, tenant_id, inicio, fim, comprador_id=None)`, `_get_feriados`, `_fmt`, `DIAS_PT`/`MESES_PT`, `_log_envio`, `send_html(to, subject, html, attachments=[(filename, bytes)])`, e os helpers do PDF (`_s`, `_empty_msg`, `_section_banner`, `_kpi_cards`, `_fetch_sf_logo`, `_draw_footer`, paleta `C_*`).
- **Session SQLAlchemy NÃO é thread-safe**: TODAS as queries acontecem na Fase 1 (série). Fase 2 só chama `send_html`. Fase 3 só chama `_log_envio`.
- **Discriminador de compromisso genérico** (Outras Atividades): `fornecedor_id IS NULL AND cat.nome IS DISTINCT FROM 'Agenda de Compras'` (o `IS DISTINCT FROM` trata categoria NULL corretamente).
- **Janela semanal**: consolida seg–sex. Função `_semana_util(d)` devolve `(segunda, sexta)` da semana que contém `d`. No cron (sem `semana_ref`), usar `hoje − 7 dias` como `d` → semana passada.
- **Novos `tipo` do `relatorio_log`**: `'semanal_gestor'` (gestor), `'semanal_auditoria'` (não-gestor), `'semanal_admin_copia'` (admin). Exigem a migration `schema_v19` aplicada ANTES do primeiro envio (senão o INSERT viola o CHECK).
- **Retrocompatibilidade do diário**: `_hero_band` ganha parâmetros opcionais com default que mantém o texto "RELATÓRIO DIÁRIO" — o `build_relatorio_pdf` existente NÃO pode mudar de comportamento.
- **Gráficos degradam com segurança**: cada gráfico ReportLab dentro de `try/except` → se falhar, cai numa tabela/mensagem; um gráfico nunca derruba o PDF inteiro.
- **Versões + SW**: entrada `v69` byte-idêntica em `frontend/script_state.js` e `backend/app/data/versoes.py`; bump `frontend/sw.js` `v68 → v69`.
- **NÃO** migrar `backend/vercel.json` para o formato `functions` (já quebrou o build — ver CLAUDE.md). Só adicionar entrada no array `crons`.

### Ambiente de execução (backend)
- venv: `backend/.venv/bin/python`. Rodar comandos a partir de `backend/` para que `app.*` resolva e o `.env` seja lido pelo Pydantic Settings.
- Não há framework de testes automatizados no projeto. Verificação por: `python -c "import ..."` (sintaxe/import), scripts throwaway (lógica pura + geração de PDF), e validação E2E manual pós-deploy (disparo `admin_only=true`). Scripts throwaway ficam no scratchpad e NÃO são commitados.
- Scratchpad: `/private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/3abbe7af-0209-4f76-a0ca-2fdb15c0c77b/scratchpad`

---

## File Structure

- **Create** `backend/db/schema_v19_relatorio_semanal_log.sql` — atualiza o CHECK de `relatorio_log.tipo`.
- **Modify** `backend/app/services/pdf_service.py` — `_hero_band` parametrizado; helpers de gráfico; `_kpi_cards_atividades`; `build_relatorio_semanal_pdf`.
- **Modify** `backend/app/services/relatorio_service.py` — `_semana_util`; queries e agregação de Outras Atividades; `_kpis_por_comprador_semana`; `_build_html_email_semanal`; `enviar_relatorio_semanal_tenant`; `enviar_relatorio_semanal_todos_tenants`.
- **Modify** `backend/app/api/v1/cron.py` — importar funções semanais; `_executar_semanal`; GET/POST `/relatorio-semanal`.
- **Modify** `backend/vercel.json` — nova entrada no array `crons`.
- **Modify** `frontend/script_state.js`, `backend/app/data/versoes.py`, `frontend/sw.js` — Versões v69 + bump SW.

---

## Task 1: Migration — novos `tipo` no `relatorio_log`

**Files:**
- Create: `backend/db/schema_v19_relatorio_semanal_log.sql`

**Interfaces:**
- Produces: constraint `relatorio_log_tipo_check` aceitando os 3 novos valores semanais.

- [ ] **Step 1: Criar o arquivo de migration.**

```sql
-- schema_v19_relatorio_semanal_log.sql
-- Adiciona os tipos do relatório SEMANAL ao CHECK de relatorio_log.tipo.
-- Alteração aditiva e segura (superset dos valores atuais) — tabela existente,
-- não requer GRANT/RLS novos.

ALTER TABLE relatorio_log DROP CONSTRAINT IF EXISTS relatorio_log_tipo_check;
ALTER TABLE relatorio_log ADD CONSTRAINT relatorio_log_tipo_check
  CHECK (tipo IN (
    'auditoria', 'agenda_proximo', 'consolidado_gestor', 'convite', 'admin_copia',
    'semanal_gestor', 'semanal_auditoria', 'semanal_admin_copia'
  ));
```

- [ ] **Step 2: Verificar a sintaxe do SQL (dry parse) sem aplicar.**

Run: `grep -c "semanal_" backend/db/schema_v19_relatorio_semanal_log.sql`
Expected: `3` (os três novos tipos presentes).

Nota: a APLICAÇÃO no Supabase é um passo de deploy (Task 7 / controlador) — não aplicar agora dentro da task de implementação. O código só grava os novos tipos quando o cron semanal roda, então há tempo até a primeira segunda.

- [ ] **Step 3: Commit.**

```bash
git add backend/db/schema_v19_relatorio_semanal_log.sql
git commit -m "feat(relatorio): migration schema_v19 - tipos do relatorio semanal no relatorio_log

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PDF — hero parametrizado, gráficos e builder semanal

**Files:**
- Modify: `backend/app/services/pdf_service.py`

**Interfaces:**
- Consumes: helpers existentes (`_s`, `_empty_msg`, `_section_banner`, `_kpi_cards`, `_fetch_sf_logo`, paleta, `_fmt`, `_fmt_dia`, `DIAS_PT`, `MESES_PT`).
- Produces:
  - `_hero_band(width, tenant_name, data_label, nome_comprador, is_gestor, titulo_faixa="RELATÓRIO DIÁRIO", rodape_faixa="AGENDA DE COMPRAS")` — retrocompatível.
  - `_bar_chart(labels: list[str], values: list[float], width: int, height=160, color="#1d4ed8") -> Drawing|Table`
  - `_kpi_cards_atividades(kpis: dict, width: int) -> Table`
  - `build_relatorio_semanal_pdf(nome_destinatario, is_gestor, inicio, fim, kpis_semana, kpis_por_comprador, atividades, tenant_name) -> bytes` onde `atividades = {"kpis": {...}, "por_categoria": [...], "por_comprador": [...]}`.

- [ ] **Step 1: Parametrizar `_hero_band` (retrocompatível).**

Substituir a assinatura e as duas strings hardcoded em `pdf_service.py` (linhas ~121-144). Trocar:

```python
def _hero_band(width: int, tenant_name: str, data_label: str, nome_comprador: str, is_gestor: bool) -> Drawing:
```
por:
```python
def _hero_band(width: int, tenant_name: str, data_label: str, nome_comprador: str, is_gestor: bool,
               titulo_faixa: str = "RELATÓRIO DIÁRIO", rodape_faixa: str = "AGENDA DE COMPRAS") -> Drawing:
```

Dentro da função, trocar a linha `saudacao = f"RELATÓRIO DIÁRIO — {nome_comprador.upper()}"` por:
```python
    saudacao = f"{titulo_faixa} — {nome_comprador.upper()}"
```
E trocar a linha do rodapé da faixa `d.add(String(width / 2, h - 78, f"AGENDA DE COMPRAS  ·  {data_label.upper()}", ...))` para usar `rodape_faixa`:
```python
    d.add(String(width / 2, h - 78, f"{rodape_faixa}  ·  {data_label.upper()}",
                 fontName="Helvetica", fontSize=9,
                 fillColor=colors.HexColor("#94a3b8"), textAnchor="middle"))
```

O `build_relatorio_pdf` existente chama `_hero_band(W, tenant_name, dia_ref_label, nome_comprador, is_gestor)` sem os novos args → mantém "RELATÓRIO DIÁRIO" / "AGENDA DE COMPRAS". Sem mudança de comportamento.

- [ ] **Step 2: Adicionar o import do VerticalBarChart no topo do arquivo.**

Após a linha `from reportlab.graphics.shapes import Drawing, Line, Rect, String` (linha ~22), adicionar:
```python
from reportlab.graphics.charts.barcharts import VerticalBarChart
```

- [ ] **Step 3: Adicionar o helper de gráfico de barras (com degradação segura).**

Adicionar após `_empty_msg` (linha ~116):

```python
def _bar_chart(labels: list, values: list, width: int, height: int = 160, color: str = "#1d4ed8"):
    """Gráfico de barras vertical simples. Degrada para mensagem se não houver dados."""
    labels = [str(x) for x in (labels or [])]
    values = [float(x or 0) for x in (values or [])]
    if not labels or not any(values):
        return _empty_msg("Sem dados para exibir no gráfico.", width)
    try:
        d = Drawing(width, height)
        bc = VerticalBarChart()
        bc.x = 32
        bc.y = 28
        bc.width = width - 64
        bc.height = height - 48
        bc.data = [values]
        bc.categoryAxis.categoryNames = [(s[:14] + "…") if len(s) > 15 else s for s in labels]
        bc.categoryAxis.labels.fontName = "Helvetica"
        bc.categoryAxis.labels.fontSize = 7
        bc.categoryAxis.labels.angle = 20
        bc.categoryAxis.labels.dy = -7
        bc.categoryAxis.labels.boxAnchor = "ne"
        bc.valueAxis.valueMin = 0
        bc.valueAxis.labels.fontName = "Helvetica"
        bc.valueAxis.labels.fontSize = 7
        bc.bars[0].fillColor = colors.HexColor(color)
        bc.barWidth = 8
        bc.groupSpacing = 6
        d.add(bc)
        return d
    except Exception:
        return _empty_msg("Gráfico indisponível.", width)
```

- [ ] **Step 4: Adicionar os KPI cards das Outras Atividades.**

Adicionar após `_kpi_cards` (linha ~233):

```python
def _kpi_cards_atividades(kpis: dict, width: int) -> Table:
    taxa = kpis.get("taxa_conclusao")
    cards_def = [
        ("Total",          kpis.get("total", 0),      "#1e293b"),
        ("Concluídas",     kpis.get("concluidas", 0),  "#059669"),
        ("Pendentes",      kpis.get("pendentes", 0),   "#2563eb"),
        ("Atrasadas",      kpis.get("atrasadas", 0),   "#dc2626"),
        ("Taxa concl.",    f"{taxa}%" if taxa is not None else "—", "#0ea5e9"),
        ("Categorias",     kpis.get("n_categorias", 0), "#7c3aed"),
    ]
    n = len(cards_def)
    card_w = (width - (n - 1) * 5) / n

    def card(label: str, value, accent: str) -> Table:
        t_s = _s(f"at_{label}", fontName="Helvetica", fontSize=7.5, leading=10, textColor=C_SLATE)
        v_s = _s(f"av_{label}", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=C_NAVY)
        tbl = Table([[Paragraph(label, t_s)], [Paragraph(str(value), v_s)]], colWidths=[card_w])
        tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), C_BG_CARD),
            ("BOX",           (0, 0), (-1, -1), 0.7, C_BORDER),
            ("LINEABOVE",     (0, 0), (-1, 0), 3, colors.HexColor(accent)),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        return tbl

    cards = [card(l, v, a) for l, v, a in cards_def]
    g = Table([cards], colWidths=[card_w] * n)
    g.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    wrapper = Table([[g]], colWidths=[width])
    wrapper.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return wrapper
```

- [ ] **Step 5: Adicionar duas tabelas simples e o builder semanal ao fim do arquivo.**

Adicionar ao FIM de `pdf_service.py`:

```python
# ── Tabelas do relatório semanal ──────────────────────────────────────────────

def _tabela_generica(headers: list, rows: list, colw: list, width: int, empty_txt: str):
    if not rows:
        return [_empty_msg(empty_txt, width)]
    h_s = _s("thh", fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=C_WHITE)
    c_s = _s("tcc", fontName="Helvetica", fontSize=8, leading=11, textColor=C_SLATE)
    data = [[Paragraph(str(h), h_s) for h in headers]]
    for r in rows:
        data.append([Paragraph(str(v), c_s) for v in r])
    tbl = Table(data, colWidths=[width * f for f in colw])
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), C_TEAL),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, C_BORDER),
        ("BOX", (0, 0), (-1, -1), 0.6, C_BORDER),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), C_BG_CARD))
    tbl.setStyle(TableStyle(style))
    return [tbl]


def build_relatorio_semanal_pdf(
    nome_destinatario: str,
    is_gestor: bool,
    inicio: date,
    fim: date,
    kpis_semana: dict,
    kpis_por_comprador: list,
    atividades: dict,
    tenant_name: str,
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=28, rightMargin=28, topMargin=22, bottomMargin=58)
    W = int(doc.width)
    periodo_label = f"{_fmt(inicio)} a {_fmt(fim)}"
    content: list = []

    # Hero
    content.append(_hero_band(W, tenant_name, periodo_label, nome_destinatario, is_gestor,
                              titulo_faixa="RELATÓRIO SEMANAL", rodape_faixa="PANORAMA DA SEMANA"))
    content.append(Spacer(1, 12))

    # ── PARTE A — Agenda de Compras
    content.append(_section_banner("📦  Agenda de Compras — Semana",
                                   f"Desempenho na compra de fornecedores de {periodo_label}.", W, "#0f766e"))
    content.append(Spacer(1, 6))
    content.append(_kpi_cards(kpis_semana, W))
    content.append(Spacer(1, 8))
    # Gráfico A: realizadas por comprador
    labels_a = [c["comprador"] for c in kpis_por_comprador]
    valores_a = [c.get("realizadas", 0) for c in kpis_por_comprador]
    content.append(_bar_chart(labels_a, valores_a, W, color="#0f766e"))
    content.append(Spacer(1, 8))
    # Tabela por comprador
    linhas_a = [[c["comprador"], c.get("realizadas", 0), c.get("atrasadas", 0),
                 c.get("pedidos_sim", 0), (f"{c.get('taxa_pedido')}%" if c.get("taxa_pedido") is not None else "—")]
                for c in kpis_por_comprador]
    content.extend(_tabela_generica(
        ["Comprador", "Realizadas", "Atrasadas", "Pedidos", "Taxa pedido"],
        linhas_a, [0.36, 0.16, 0.16, 0.16, 0.16], W, "Sem dados de Agenda de Compras na semana."))
    content.append(Spacer(1, 16))

    # ── PARTE B — Outras Atividades
    at_kpis = atividades.get("kpis", {})
    por_cat = atividades.get("por_categoria", [])
    por_comp = atividades.get("por_comprador", [])
    content.append(CondPageBreak(220))
    content.append(_section_banner("🗒️  Outras Atividades — Semana",
                                   "Tarefas gerais da operação (fora de fornecedores). Concluídas na semana; pendentes/atrasadas em aberto agora.",
                                   W, "#1d4ed8"))
    content.append(Spacer(1, 6))
    content.append(_kpi_cards_atividades(at_kpis, W))
    content.append(Spacer(1, 8))
    # Gráfico B: total por categoria
    labels_b = [c["categoria"] for c in por_cat]
    valores_b = [c.get("total", 0) for c in por_cat]
    content.append(_bar_chart(labels_b, valores_b, W, color="#1d4ed8"))
    content.append(Spacer(1, 8))
    # Tabela por categoria
    linhas_cat = [[c["categoria"], c.get("total", 0), c.get("concluida", 0), c.get("pendente", 0), c.get("atrasada", 0)]
                  for c in por_cat]
    content.extend(_tabela_generica(
        ["Categoria", "Total", "Concluídas", "Pendentes", "Atrasadas"],
        linhas_cat, [0.36, 0.16, 0.16, 0.16, 0.16], W, "Sem outras atividades na semana."))
    content.append(Spacer(1, 8))
    # Tabela por comprador
    linhas_comp = [[c["comprador"], c.get("total", 0), c.get("concluida", 0), c.get("pendente", 0), c.get("atrasada", 0)]
                   for c in por_comp]
    content.extend(_tabela_generica(
        ["Comprador", "Total", "Concluídas", "Pendentes", "Atrasadas"],
        linhas_comp, [0.36, 0.16, 0.16, 0.16, 0.16], W, "Sem outras atividades por comprador."))

    # Rodapé (reusa a mesma lógica do diário)
    sf_logo_bytes = _fetch_sf_logo()
    sf_logo_reader = None
    if sf_logo_bytes:
        try:
            sf_logo_reader = ImageReader(BytesIO(sf_logo_bytes))
        except Exception:
            sf_logo_reader = None

    def _draw_footer(canvas, doc_obj) -> None:
        canvas.saveState()
        pw = A4[0]
        if sf_logo_reader is not None:
            canvas.drawImage(sf_logo_reader, (pw - 88) / 2, 20, width=88, height=22,
                             preserveAspectRatio=True, mask="auto")
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#94a3b8"))
        canvas.drawCentredString(pw / 2, 10, "Powered By Service Farma — Agenda de Compras — Direitos Reservados")
        canvas.restoreState()

    doc.build(content, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    return buffer.getvalue()
```

- [ ] **Step 6: Verificar import + geração do PDF (diário retrocompatível E semanal) com script throwaway.**

Criar no scratchpad `t_pdf.py`:

```python
from datetime import date
from app.services.pdf_service import build_relatorio_pdf, build_relatorio_semanal_pdf

empty_kpi = {"total": 0, "realizadas": 0, "adiadas": 0, "atrasadas": 0, "pendentes": 0,
             "postergadas": 0, "antecipadas": 0, "param_aumentados": 0, "param_reduzidos": 0,
             "fora_carteira": 0, "pedidos_sim": 0, "pedidos_nao": 0, "valor_total_pedidos": 0, "taxa_pedido": None}

# diário ainda funciona (retrocompat do _hero_band)
d = build_relatorio_pdf("Fulano", True, date(2026,7,10), date(2026,7,13),
                        empty_kpi, empty_kpi, [], [], [], [], "Tenant Teste")
assert d[:4] == b"%PDF" and len(d) > 1000, "diario falhou"

# semanal
kpis_semana = dict(empty_kpi, total=12, realizadas=8, atrasadas=2, pedidos_sim=6, pedidos_nao=2, taxa_pedido=75, valor_total_pedidos=15000.5)
kpis_por_comprador = [
    {"comprador": "Ana", "realizadas": 5, "atrasadas": 1, "pedidos_sim": 4, "taxa_pedido": 80},
    {"comprador": "Bruno", "realizadas": 3, "atrasadas": 1, "pedidos_sim": 2, "taxa_pedido": 66},
]
atividades = {"kpis": {"total": 9, "concluidas": 5, "pendentes": 2, "atrasadas": 2, "taxa_conclusao": 56, "n_categorias": 3},
              "por_categoria": [{"categoria": "Financeiro", "cor": "#2563eb", "total": 4, "concluida": 3, "pendente": 1, "atrasada": 0},
                                {"categoria": "RH", "cor": "#16a34a", "total": 3, "concluida": 1, "pendente": 1, "atrasada": 1}],
              "por_comprador": [{"comprador": "Ana", "total": 5, "concluida": 3, "pendente": 1, "atrasada": 1}]}
s = build_relatorio_semanal_pdf("Ana", True, date(2026,7,6), date(2026,7,10),
                                kpis_semana, kpis_por_comprador, atividades, "Tenant Teste")
assert s[:4] == b"%PDF" and len(s) > 2000, "semanal falhou"
open("/private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/3abbe7af-0209-4f76-a0ca-2fdb15c0c77b/scratchpad/semanal_sample.pdf","wb").write(s)
print("OK diario", len(d), "semanal", len(s))
```

Run (a partir de `backend/`): `cd backend && .venv/bin/python /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/3abbe7af-0209-4f76-a0ca-2fdb15c0c77b/scratchpad/t_pdf.py`
Expected: `OK diario <n> semanal <m>` sem exceção; ambos `%PDF`. (O `_fetch_sf_logo` retorna None sem rede — rodapé sem logo, PDF ainda gera.)

- [ ] **Step 7: Commit.**

```bash
git add backend/app/services/pdf_service.py
git commit -m "feat(relatorio): PDF semanal - hero parametrizado, graficos e builder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Serviço — janela semanal, queries e agregação de Outras Atividades

**Files:**
- Modify: `backend/app/services/relatorio_service.py`

**Interfaces:**
- Consumes: `_kpis_query`, `text`, `Session`.
- Produces:
  - `_semana_util(d: date) -> tuple[date, date]` — (segunda, sexta) da semana de `d`.
  - `_get_atividades_concluidas_semana(db, tenant_id, inicio, fim, comprador_id=None) -> list[dict]`
  - `_get_atividades_abertas(db, tenant_id, hoje, comprador_id=None) -> list[dict]`
  - `_agregar_atividades(concluidas: list[dict], abertas: list[dict]) -> dict` — puro; devolve `{"kpis": {...}, "por_categoria": [...], "por_comprador": [...]}`.
  - `_atividades_semana(db, tenant_id, inicio, fim, hoje, comprador_id=None) -> dict` — combina query + agregação.
  - `_kpis_por_comprador_semana(db, tenant_id, inicio, fim, comprador_id=None) -> list[dict]`

- [ ] **Step 1: Adicionar os helpers ao `relatorio_service.py` (após `_mes_anterior`, ~linha 43).**

```python
def _semana_util(d: date) -> tuple[date, date]:
    """(segunda, sexta) da semana ISO que contém d."""
    monday = d - timedelta(days=d.weekday())  # weekday(): 0=segunda
    return monday, monday + timedelta(days=4)


def _get_atividades_concluidas_semana(
    db: Session, tenant_id: str, inicio: date, fim: date, comprador_id: Optional[str] = None
) -> list[dict]:
    filtro = "AND ao.comprador_id = cast(:cid as uuid)" if comprador_id else ""
    params: dict = {"tid": tenant_id, "inicio": inicio, "fim": fim}
    if comprador_id:
        params["cid"] = comprador_id
    rows = db.execute(
        text(f"""
            SELECT
                COALESCE(c.nome_comprador, 'Sem comprador') AS nome_comprador,
                COALESCE(cat.nome, 'Sem categoria') AS categoria,
                COALESCE(cat.cor, '#94a3b8') AS cor,
                COALESCE(ao.titulo, 'Compromisso') AS titulo,
                ao.data_realizacao::text AS data_realizacao
            FROM agenda_ocorrencias ao
            LEFT JOIN compradores c ON c.id = ao.comprador_id AND c.tenant_id = ao.tenant_id
            LEFT JOIN categorias_agenda cat ON cat.id = ao.categoria_id
            WHERE ao.tenant_id = cast(:tid as uuid)
              AND ao.status = 'REALIZADA'
              AND ao.fornecedor_id IS NULL
              AND (cat.nome IS DISTINCT FROM 'Agenda de Compras')
              AND ao.data_realizacao BETWEEN :inicio AND :fim
              {filtro}
        """),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


def _get_atividades_abertas(
    db: Session, tenant_id: str, hoje: date, comprador_id: Optional[str] = None
) -> list[dict]:
    filtro = "AND ao.comprador_id = cast(:cid as uuid)" if comprador_id else ""
    params: dict = {"tid": tenant_id, "hoje": hoje}
    if comprador_id:
        params["cid"] = comprador_id
    rows = db.execute(
        text(f"""
            SELECT
                COALESCE(c.nome_comprador, 'Sem comprador') AS nome_comprador,
                COALESCE(cat.nome, 'Sem categoria') AS categoria,
                COALESCE(cat.cor, '#94a3b8') AS cor,
                COALESCE(ao.titulo, 'Compromisso') AS titulo,
                ao.data_prevista::text AS data_prevista,
                (ao.data_prevista IS NOT NULL AND ao.data_prevista < :hoje) AS atrasada
            FROM agenda_ocorrencias ao
            LEFT JOIN compradores c ON c.id = ao.comprador_id AND c.tenant_id = ao.tenant_id
            LEFT JOIN categorias_agenda cat ON cat.id = ao.categoria_id
            WHERE ao.tenant_id = cast(:tid as uuid)
              AND ao.status = 'PENDENTE'
              AND ao.fornecedor_id IS NULL
              AND (cat.nome IS DISTINCT FROM 'Agenda de Compras')
              {filtro}
        """),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


def _agregar_atividades(concluidas: list[dict], abertas: list[dict]) -> dict:
    """Puro: agrega concluídas + abertas em KPIs, por categoria e por comprador."""
    pendentes = [r for r in abertas if not r.get("atrasada")]
    atrasadas = [r for r in abertas if r.get("atrasada")]
    total = len(concluidas) + len(pendentes) + len(atrasadas)

    cats: dict = {}
    buyers: dict = {}

    def bump_cat(r, key):
        nome = r.get("categoria") or "Sem categoria"
        g = cats.setdefault(nome, {"categoria": nome, "cor": r.get("cor") or "#94a3b8",
                                   "total": 0, "concluida": 0, "pendente": 0, "atrasada": 0})
        g[key] += 1
        g["total"] += 1

    def bump_buyer(r, key):
        nome = r.get("nome_comprador") or "Sem comprador"
        g = buyers.setdefault(nome, {"comprador": nome, "total": 0, "concluida": 0, "pendente": 0, "atrasada": 0})
        g[key] += 1
        g["total"] += 1

    for r in concluidas:
        bump_cat(r, "concluida"); bump_buyer(r, "concluida")
    for r in pendentes:
        bump_cat(r, "pendente"); bump_buyer(r, "pendente")
    for r in atrasadas:
        bump_cat(r, "atrasada"); bump_buyer(r, "atrasada")

    kpis = {
        "total": total,
        "concluidas": len(concluidas),
        "pendentes": len(pendentes),
        "atrasadas": len(atrasadas),
        "taxa_conclusao": round(len(concluidas) / total * 100) if total else None,
        "n_categorias": len(cats),
    }
    return {
        "kpis": kpis,
        "por_categoria": sorted(cats.values(), key=lambda x: -x["total"]),
        "por_comprador": sorted(buyers.values(), key=lambda x: -x["total"]),
    }


def _atividades_semana(
    db: Session, tenant_id: str, inicio: date, fim: date, hoje: date, comprador_id: Optional[str] = None
) -> dict:
    concluidas = _get_atividades_concluidas_semana(db, tenant_id, inicio, fim, comprador_id)
    abertas = _get_atividades_abertas(db, tenant_id, hoje, comprador_id)
    return _agregar_atividades(concluidas, abertas)


def _kpis_por_comprador_semana(
    db: Session, tenant_id: str, inicio: date, fim: date, comprador_id: Optional[str] = None
) -> list[dict]:
    filtro = "AND id = cast(:cid as uuid)" if comprador_id else ""
    params: dict = {"tid": tenant_id}
    if comprador_id:
        params["cid"] = comprador_id
    compradores = db.execute(
        text(f"""
            SELECT id::text AS id, nome_comprador
            FROM compradores
            WHERE tenant_id = cast(:tid as uuid)
              {filtro}
            ORDER BY nome_comprador
        """),
        params,
    ).mappings().all()
    out: list[dict] = []
    for c in compradores:
        k = _kpis_query(db, tenant_id, inicio, fim, c["id"])
        out.append({"comprador": c["nome_comprador"], **k})
    return out
```

- [ ] **Step 2: Verificar import + lógica pura (janela + agregação) com script throwaway.**

Criar no scratchpad `t_service_logic.py`:

```python
from datetime import date
from app.services.relatorio_service import _semana_util, _agregar_atividades

# janela: 13/07/2026 é segunda; a semana dela é 13-17. Para "semana passada" o
# orquestrador passa hoje-7 = 06/07, cuja semana é 06-10.
assert _semana_util(date(2026,7,13)) == (date(2026,7,13), date(2026,7,17)), "semana atual"
assert _semana_util(date(2026,7,6))  == (date(2026,7,6),  date(2026,7,10)), "semana passada"
assert _semana_util(date(2026,7,9))  == (date(2026,7,6),  date(2026,7,10)), "quarta cai na mesma semana"

concl = [{"categoria":"Financeiro","cor":"#2563eb","nome_comprador":"Ana"},
         {"categoria":"Financeiro","cor":"#2563eb","nome_comprador":"Ana"},
         {"categoria":"RH","cor":"#16a34a","nome_comprador":"Bruno"}]
abertas = [{"categoria":"Financeiro","cor":"#2563eb","nome_comprador":"Ana","atrasada":True},
           {"categoria":"RH","cor":"#16a34a","nome_comprador":"Bruno","atrasada":False}]
agg = _agregar_atividades(concl, abertas)
k = agg["kpis"]
assert k["total"] == 5 and k["concluidas"] == 3 and k["pendentes"] == 1 and k["atrasadas"] == 1, k
assert k["taxa_conclusao"] == 60 and k["n_categorias"] == 2, k
fin = next(c for c in agg["por_categoria"] if c["categoria"] == "Financeiro")
assert fin["total"] == 3 and fin["concluida"] == 2 and fin["atrasada"] == 1, fin
print("OK logica semanal")
```

Run (de `backend/`): `.venv/bin/python /private/tmp/claude-501/-Users-avj-Developer-Sistemas-Python-Agenda-de-Compras-Web/3abbe7af-0209-4f76-a0ca-2fdb15c0c77b/scratchpad/t_service_logic.py`
Expected: `OK logica semanal` sem AssertionError.

- [ ] **Step 3: Commit.**

```bash
git add backend/app/services/relatorio_service.py
git commit -m "feat(relatorio): janela semanal, queries e agregacao de Outras Atividades

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Serviço — orquestração do envio semanal

**Files:**
- Modify: `backend/app/services/relatorio_service.py`

**Interfaces:**
- Consumes: os helpers da Task 3, `_kpis_query`, `_log_envio`, `build_relatorio_semanal_pdf`, `send_html`, `get_supabase`, `EMAIL_PARALLEL_WORKERS`, `ThreadPoolExecutor`.
- Produces:
  - `_build_html_email_semanal(nome_destinatario, is_gestor, inicio, fim, kpis_semana, atividades_kpis, tenant_name) -> str`
  - `enviar_relatorio_semanal_tenant(db, tenant_id, semana_ref=None, admin_only=False, comprador_id=None) -> dict`
  - `enviar_relatorio_semanal_todos_tenants(db, semana_ref=None) -> dict`

- [ ] **Step 1: Importar o builder semanal.**

Na linha `from app.services.pdf_service import build_relatorio_pdf` (linha ~17), trocar por:
```python
from app.services.pdf_service import build_relatorio_pdf, build_relatorio_semanal_pdf
```

- [ ] **Step 2: Adicionar o HTML do e-mail semanal + as funções de orquestração ao FIM de `relatorio_service.py`.**

```python
def _build_html_email_semanal(
    nome_destinatario: str, is_gestor: bool, inicio: date, fim: date,
    kpis_semana: dict, atividades_kpis: dict, tenant_name: str,
) -> str:
    periodo = f"{_fmt(inicio)} a {_fmt(fim)}"
    escopo = "consolidado de todos os compradores" if is_gestor else "sua carteira"
    valor = kpis_semana.get("valor_total_pedidos") or 0
    valor_fmt = "R$ " + f"{float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    taxa_p = kpis_semana.get("taxa_pedido")
    taxa_c = atividades_kpis.get("taxa_conclusao")
    return f"""\
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
  <div style="background:#0f172a;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
    <div style="font-size:12px;letter-spacing:1px;color:#94a3b8">RELATÓRIO SEMANAL · {tenant_name}</div>
    <div style="font-size:20px;font-weight:bold;margin-top:4px">Panorama da semana — {periodo}</div>
    <div style="font-size:13px;color:#cbd5e1;margin-top:6px">Olá, {nome_destinatario} — {escopo}.</div>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px">
    <h3 style="color:#0f766e;margin:0 0 8px">Agenda de Compras</h3>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">
      Realizadas: <b>{kpis_semana.get('realizadas', 0)}</b> ·
      Atrasadas: <b>{kpis_semana.get('atrasadas', 0)}</b> ·
      Pedidos: <b>{kpis_semana.get('pedidos_sim', 0)}</b> ·
      Taxa de pedido: <b>{f'{taxa_p}%' if taxa_p is not None else '—'}</b> ·
      Valor total: <b>{valor_fmt}</b>
    </p>
    <h3 style="color:#1d4ed8;margin:0 0 8px">Outras Atividades</h3>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">
      Total: <b>{atividades_kpis.get('total', 0)}</b> ·
      Concluídas: <b>{atividades_kpis.get('concluidas', 0)}</b> ·
      Pendentes: <b>{atividades_kpis.get('pendentes', 0)}</b> ·
      Atrasadas: <b>{atividades_kpis.get('atrasadas', 0)}</b> ·
      Taxa de conclusão: <b>{f'{taxa_c}%' if taxa_c is not None else '—'}</b>
    </p>
    <p style="font-size:13px;color:#64748b;margin:0">O PDF em anexo traz o detalhamento completo por comprador e por categoria, com gráficos.</p>
  </div>
</div>"""


def enviar_relatorio_semanal_tenant(
    db: Session,
    tenant_id: str,
    semana_ref: Optional[date] = None,
    admin_only: bool = False,
    comprador_id: Optional[str] = None,
) -> dict:
    from datetime import datetime
    if semana_ref is None:
        semana_ref = datetime.now().date() - timedelta(days=7)  # alguma data da semana passada
    inicio, fim = _semana_util(semana_ref)
    hoje = datetime.now().date()

    tenant_row = db.execute(
        text("SELECT nome FROM tenants WHERE id = cast(:tid as uuid)"),
        {"tid": tenant_id},
    ).mappings().first()
    tenant_name = tenant_row["nome"] if tenant_row else "Agenda de Compras"

    filtro_comprador = "AND id = cast(:cid as uuid)" if comprador_id else ""
    params_compradores: dict = {"tid": tenant_id}
    if comprador_id:
        params_compradores["cid"] = comprador_id
    compradores = db.execute(
        text(f"""
            SELECT id::text AS id, nome_comprador, email, is_gestor,
                   receber_auditoria, receber_agenda_proximo
            FROM compradores
            WHERE tenant_id = cast(:tid as uuid)
              AND email IS NOT NULL
              AND (receber_auditoria = true OR receber_agenda_proximo = true)
              {filtro_comprador}
            ORDER BY nome_comprador
        """),
        params_compradores,
    ).mappings().all()

    # Dados gerais (gestor/admin) — carregados uma vez
    kpis_semana_geral = _kpis_query(db, tenant_id, inicio, fim)
    kpis_por_comprador_geral = _kpis_por_comprador_semana(db, tenant_id, inicio, fim)
    atividades_geral = _atividades_semana(db, tenant_id, inicio, fim, hoje)

    subject = f"Agenda de Compras — Relatório Semanal {_fmt(inicio)} a {_fmt(fim)}"
    pdf_filename = f"relatorio_semanal_{inicio.isoformat()}_{fim.isoformat()}.pdf"
    payloads: list[dict] = []

    def _monta_payload(nome, email, is_gestor, kpis_semana, kpis_por_comp, atividades, tipo, cid):
        html = _build_html_email_semanal(nome, is_gestor, inicio, fim, kpis_semana, atividades["kpis"], tenant_name)
        pdf_bytes: Optional[bytes] = None
        try:
            pdf_bytes = build_relatorio_semanal_pdf(
                nome_destinatario=nome, is_gestor=is_gestor, inicio=inicio, fim=fim,
                kpis_semana=kpis_semana, kpis_por_comprador=kpis_por_comp,
                atividades=atividades, tenant_name=tenant_name,
            )
        except Exception:
            pdf_bytes = None
        payloads.append({
            "email": email, "html": html,
            "attachments": [(pdf_filename, pdf_bytes)] if pdf_bytes else None,
            "comprador_id": cid, "tipo": tipo,
        })

    for c in ([] if admin_only else compradores):
        is_gestor = bool(c["is_gestor"])
        if is_gestor:
            _monta_payload(c["nome_comprador"], c["email"], True,
                           kpis_semana_geral, kpis_por_comprador_geral, atividades_geral,
                           "semanal_gestor", c["id"])
        else:
            cid = c["id"]
            kpis_c = _kpis_query(db, tenant_id, inicio, fim, cid)
            kpis_pc = _kpis_por_comprador_semana(db, tenant_id, inicio, fim, cid)
            ativ_c = _atividades_semana(db, tenant_id, inicio, fim, hoje, cid)
            _monta_payload(c["nome_comprador"], c["email"], False,
                           kpis_c, kpis_pc, ativ_c, "semanal_auditoria", cid)

    # Admins inscritos (consolidado). Pulado em envio pontual (comprador_id).
    try:
        if comprador_id:
            admin_emails = []
        else:
            sb = get_supabase()
            resp = sb.table("admin_report_subscriptions").select("admin_email").eq("tenant_id", tenant_id).execute()
            admin_emails = [r["admin_email"] for r in (resp.data or [])]
    except Exception:
        admin_emails = []

    for admin_email in admin_emails:
        _monta_payload("Administrador", admin_email, True,
                       kpis_semana_geral, kpis_por_comprador_geral, atividades_geral,
                       "semanal_admin_copia", None)

    # FASE 2 — envio paralelo
    def _send_one(p: dict) -> tuple[str, Optional[str]]:
        try:
            send_html([p["email"]], subject, p["html"], attachments=p["attachments"])
            return ("enviado", None)
        except Exception as exc:
            return ("erro", str(exc)[:500])

    results: list[tuple[str, Optional[str]]] = []
    if payloads:
        with ThreadPoolExecutor(max_workers=EMAIL_PARALLEL_WORKERS) as pool:
            results = list(pool.map(_send_one, payloads))

    # FASE 3 — log em série
    sent = 0
    errors = 0
    for payload, (status, erro) in zip(payloads, results):
        _log_envio(db, tenant_id, payload["comprador_id"], payload["tipo"], inicio, payload["email"], status, erro)
        if status == "enviado":
            sent += 1
        else:
            errors += 1

    return {
        "tenant_id": tenant_id,
        "semana_inicio": str(inicio),
        "semana_fim": str(fim),
        "sent": sent,
        "errors": errors,
    }


def enviar_relatorio_semanal_todos_tenants(
    db: Session,
    semana_ref: Optional[date] = None,
) -> dict:
    tenants = db.execute(
        text("SELECT id::text AS id FROM tenants WHERE envio_relatorio_ativo = true ORDER BY nome")
    ).mappings().all()
    total_sent = 0
    total_errors = 0
    results = []
    for t in tenants:
        r = enviar_relatorio_semanal_tenant(db, t["id"], semana_ref)
        total_sent += r["sent"]
        total_errors += r["errors"]
        if r["sent"] or r["errors"]:
            results.append(r)
    return {"total_sent": total_sent, "total_errors": total_errors, "tenants": results}
```

- [ ] **Step 3: Verificar import do módulo (sem rodar envio).**

Run (de `backend/`): `.venv/bin/python -c "import app.services.relatorio_service as m; print([n for n in ('enviar_relatorio_semanal_tenant','enviar_relatorio_semanal_todos_tenants','_build_html_email_semanal') if hasattr(m,n)])"`
Expected: `['enviar_relatorio_semanal_tenant', 'enviar_relatorio_semanal_todos_tenants', '_build_html_email_semanal']` (import limpo, sem erro).

- [ ] **Step 4: Commit.**

```bash
git add backend/app/services/relatorio_service.py
git commit -m "feat(relatorio): orquestracao do envio semanal (gestor/nao-gestor/admin)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Endpoint de cron + agendamento

**Files:**
- Modify: `backend/app/api/v1/cron.py`
- Modify: `backend/vercel.json`

**Interfaces:**
- Consumes: `enviar_relatorio_semanal_tenant`, `enviar_relatorio_semanal_todos_tenants`.
- Produces: rotas `GET`/`POST /api/v1/cron/relatorio-semanal`; cron `0 10 * * 1`.

- [ ] **Step 1: Atualizar os imports em `cron.py`.**

Trocar o bloco de import (linhas 9-12) por:
```python
from app.services.relatorio_service import (
    enviar_relatorios_tenant,
    enviar_relatorios_todos_tenants,
    enviar_relatorio_semanal_tenant,
    enviar_relatorio_semanal_todos_tenants,
)
```

- [ ] **Step 2: Adicionar o executor semanal e as rotas ao FIM de `cron.py`.**

```python
def _executar_semanal(
    db: Session,
    tenant_id: Optional[str],
    semana_ref: Optional[date],
    admin_only: bool = False,
    comprador_id: Optional[str] = None,
) -> dict:
    if tenant_id:
        return enviar_relatorio_semanal_tenant(
            db, tenant_id, semana_ref, admin_only=admin_only, comprador_id=comprador_id
        )
    return enviar_relatorio_semanal_todos_tenants(db, semana_ref)


@router.get("/relatorio-semanal")
def cron_relatorio_semanal_get(
    semana_ref: Optional[date] = Query(default=None),
    tenant_id: Optional[str] = Query(default=None),
    _: None = Depends(_verificar_auth),
    db: Session = Depends(get_db_session),
) -> dict:
    """Chamado pelo Vercel Cron Job (GET). Segunda 10:00 UTC = 07:00 BRT. Consolida a semana útil anterior."""
    return _executar_semanal(db, tenant_id, semana_ref)


@router.post("/relatorio-semanal")
def cron_relatorio_semanal_post(
    semana_ref: Optional[date] = Query(default=None),
    tenant_id: Optional[str] = Query(default=None),
    admin_only: bool = Query(default=False),
    comprador_id: Optional[str] = Query(default=None),
    _: None = Depends(_verificar_auth),
    db: Session = Depends(get_db_session),
) -> dict:
    """Disparo manual (POST + X-Cron-Secret). semana_ref = qualquer data da semana-alvo (default: semana passada).
    admin_only=true envia só para admins inscritos; comprador_id=<uuid> envia só para aquele comprador."""
    return _executar_semanal(db, tenant_id, semana_ref, admin_only=admin_only, comprador_id=comprador_id)
```

- [ ] **Step 3: Adicionar o cron semanal em `backend/vercel.json`.**

Trocar o array `crons` (linhas 2-7) para incluir o novo agendamento (mantendo o diário):
```json
  "crons": [
    {
      "path": "/api/v1/cron/relatorio-diario",
      "schedule": "0 0 * * 2-6"
    },
    {
      "path": "/api/v1/cron/relatorio-semanal",
      "schedule": "0 10 * * 1"
    }
  ],
```

- [ ] **Step 4: Verificar import do router + validade do JSON.**

Run (de `backend/`):
```
.venv/bin/python -c "from app.api.v1 import cron; print([r.path for r in cron.router.routes])"
.venv/bin/python -c "import json; c=json.load(open('vercel.json')); print([x['schedule'] for x in c['crons']])"
```
Expected: as rotas incluem `/cron/relatorio-semanal`; os schedules incluem `0 10 * * 1` e `0 0 * * 2-6`.

- [ ] **Step 5: Commit.**

```bash
git add backend/app/api/v1/cron.py backend/vercel.json
git commit -m "feat(relatorio): endpoint /cron/relatorio-semanal + cron de segunda 07h BRT

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Versões v69 + bump do Service Worker

**Files:**
- Modify: `frontend/script_state.js`
- Modify: `backend/app/data/versoes.py`
- Modify: `frontend/sw.js`

**Interfaces:** nenhuma (conteúdo de changelog + cache).

- [ ] **Step 1: Adicionar a entrada `v69` no topo de `VERSOES` em `frontend/script_state.js` (antes da entrada `v68`).**

```js
  {
    versao: "v69",
    dataHora: "10/07/2026 — tarde",
    notas: [
      "Novo relatório semanal por e-mail para gestores, toda segunda de manhã.",
      "Ele consolida a semana útil anterior (segunda a sexta) num PDF com dois panoramas: a Agenda de Compras (realizadas, atrasadas, pedidos, valor e taxa de pedido) e as Outras Atividades (tarefas gerais: concluídas, pendentes, atrasadas e taxa de conclusão).",
      "Traz tabelas por comprador e por categoria, além de gráficos, para acompanhar o desempenho da equipe na semana.",
      "Vai para os mesmos destinatários do relatório diário; gestores recebem o consolidado de todos os compradores.",
    ],
  },
```

- [ ] **Step 2: Adicionar a MESMA entrada (notas byte-idênticas) no topo de `VERSOES` em `backend/app/data/versoes.py` (antes da entrada `"v68"`).**

```python
    {
        "versao": "v69",
        "dataHora": "10/07/2026 — tarde",
        "notas": [
            "Novo relatório semanal por e-mail para gestores, toda segunda de manhã.",
            "Ele consolida a semana útil anterior (segunda a sexta) num PDF com dois panoramas: a Agenda de Compras (realizadas, atrasadas, pedidos, valor e taxa de pedido) e as Outras Atividades (tarefas gerais: concluídas, pendentes, atrasadas e taxa de conclusão).",
            "Traz tabelas por comprador e por categoria, além de gráficos, para acompanhar o desempenho da equipe na semana.",
            "Vai para os mesmos destinatários do relatório diário; gestores recebem o consolidado de todos os compradores.",
        ],
    },
```

- [ ] **Step 3: Bump do SW em `frontend/sw.js`.**

Trocar `const CACHE = 'agenda-compras-v68';` por:
```js
const CACHE = 'agenda-compras-v69';
```

- [ ] **Step 4: Verificar sincronia, parse e identidade das notas.**

Run:
```
grep -m1 "agenda-compras-v" frontend/sw.js
node --check frontend/script_state.js && echo "JS ok"
python3 -c "import ast; ast.parse(open('backend/app/data/versoes.py').read()); print('PY ok')"
```
Expected: SW `v69`; JS ok; PY ok. Conferir (lendo os dois blocos v69) que as 4 linhas de `notas` são idênticas char-a-char entre os arquivos.

- [ ] **Step 5: Commit.**

```bash
git add frontend/script_state.js backend/app/data/versoes.py frontend/sw.js
git commit -m "chore(relatorio): Versoes v69 (relatorio semanal) + bump SW v69

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Aplicar migration + validação E2E (controlador/pós-deploy)

**Files:** nenhum (deploy + validação; correções pontuais viram commits próprios).

**Interfaces:** exercita o fluxo real com DB + e-mail.

- [ ] **Step 1: Aplicar a migration `schema_v19` no Supabase.**

Usar o `DATABASE_URL` do `backend/.env` (pooler). Executar o SQL de `backend/db/schema_v19_relatorio_semanal_log.sql`. Verificar depois:
```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'relatorio_log_tipo_check';
```
Esperado: a definição do CHECK inclui `semanal_gestor`, `semanal_auditoria`, `semanal_admin_copia`. **Sem isso, o INSERT de log do semanal falha.**

- [ ] **Step 2: Disparo manual admin-only (não afeta compradores) após o deploy do backend.**

```
POST https://agenda-de-compras-api.vercel.app/api/v1/cron/relatorio-semanal?tenant_id=c2f65634-b7e0-47f0-8937-94446540701a&admin_only=true
Header: X-Cron-Secret: agenda-cron-2026-sfx
```
Esperado: JSON `{sent, errors, semana_inicio, semana_fim}` com `errors: 0`. Conferir a chegada do e-mail em `andre@servicefarma.far.br` com o PDF anexo.

- [ ] **Step 3: Conferir o PDF e a janela.**

Abrir o PDF recebido: hero "RELATÓRIO SEMANAL — DD/MM a DD/MM" com o período da semana útil anterior correto; Parte A (Agenda de Compras) com KPIs, gráfico e tabela por comprador; Parte B (Outras Atividades) com cards, gráfico por categoria e tabelas. Se quiser fixar uma semana conhecida: repetir com `&semana_ref=AAAA-MM-DD`.

- [ ] **Step 4: Conferir o log.**

No painel admin (Log de E-mails) ou via SQL em `relatorio_log`: os envios semanais aparecem com `tipo` em `('semanal_gestor','semanal_auditoria','semanal_admin_copia')` e `status='enviado'`.

- [ ] **Step 5: Nenhum commit adicional se a validação passar.** Correções, se necessárias, viram commits próprios. Pronto para merge `staging → main`.
