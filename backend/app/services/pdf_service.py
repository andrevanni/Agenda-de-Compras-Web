"""
Geração de PDF de relatório diário — padrão visual SFI (ReportLab).
Retorna bytes prontos para serem enviados como anexo de e-mail.

Estrutura do PDF:
  1. Cabeçalho (hero band)
  2. ⚠️  Itens em Atraso  (destaque vermelho)
  3. 📅  Agenda do Próximo Dia Útil
         A) Agenda de Compras
         B) Outros Compromissos
  4. 📋  Tratamentos do Dia Anterior (detalhado)
  5. 📊  KPIs — Mês Corrente
  6. 📊  KPIs — Mês Anterior
"""
from __future__ import annotations

import json
from datetime import date
from io import BytesIO
from typing import Optional

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    CondPageBreak,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.core.config import settings

# ── Paleta ───────────────────────────────────────────────────────────────────
C_NAVY    = colors.HexColor("#0f172a")
C_TEAL    = colors.HexColor("#0f766e")
C_BLUE    = colors.HexColor("#1d4ed8")
C_SLATE   = colors.HexColor("#475569")
C_MUTED   = colors.HexColor("#64748b")
C_BORDER  = colors.HexColor("#e2e8f0")
C_BG_CARD = colors.HexColor("#f8fafc")
C_BG_ALT  = colors.HexColor("#f1f5f9")
C_WHITE   = colors.white
C_GREEN   = colors.HexColor("#059669")
C_RED     = colors.HexColor("#dc2626")
C_ORANGE  = colors.HexColor("#d97706")
C_RED_BG  = colors.HexColor("#fee2e2")
C_RED_HDR = colors.HexColor("#991b1b")

DIAS_PT  = {0: "Segunda", 1: "Terça", 2: "Quarta", 3: "Quinta",
            4: "Sexta", 5: "Sábado", 6: "Domingo"}
MESES_PT = {1: "jan", 2: "fev", 3: "mar", 4: "abr", 5: "mai", 6: "jun",
            7: "jul", 8: "ago", 9: "set", 10: "out", 11: "nov", 12: "dez"}


def _fmt(d: date) -> str:
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def _fmt_dia(d: date) -> str:
    return f"{DIAS_PT[d.weekday()]}, {_fmt(d)}"


def _resumo_obs(obs: Optional[str], max_len: int = 80) -> str:
    if not obs:
        return ""
    try:
        data = json.loads(obs)
        return str(data.get("note") or data.get("summary") or "")[:max_len]
    except Exception:
        return str(obs)[:max_len]


def _justificativa_obs(obs: Optional[str]) -> str:
    if not obs:
        return ""
    try:
        data = json.loads(obs)
        return str(data.get("justificativa") or "")
    except Exception:
        return ""


def _fetch_sf_logo() -> Optional[bytes]:
    try:
        import httpx
        r = httpx.get(settings.frontend_url + "/assets/logo_alta.jpg", timeout=5.0)
        if r.status_code == 200:
            return r.content
    except Exception:
        pass
    return None


# ── Helpers de estilo ─────────────────────────────────────────────────────────

def _s(name: str, **kw) -> ParagraphStyle:
    return ParagraphStyle(name, **kw)


def _empty_msg(text_str: str, width: int) -> Table:
    st = _s("em", fontName="Helvetica", fontSize=9, leading=12, textColor=C_MUTED)
    tbl = Table([[Paragraph(text_str, st)]], colWidths=[width])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_BG_ALT),
        ("BOX",           (0, 0), (-1, -1), 0.6, C_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 14),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return tbl


# ── Componentes ───────────────────────────────────────────────────────────────

def _hero_band(width: int, tenant_name: str, data_label: str, nome_comprador: str, is_gestor: bool) -> Drawing:
    h = 120
    d = Drawing(width, h)
    d.add(Rect(0, 0, width, h, fillColor=C_NAVY, strokeColor=None))
    d.add(Rect(0, 0, 7, h, fillColor=C_TEAL, strokeColor=None))
    d.add(Rect(10, 0, 3, h * 0.55, fillColor=C_BLUE, strokeColor=None))
    for di in range(4):
        for dj in range(3):
            d.add(Rect(width - 58 + di * 13, h - 16 - dj * 13, 5, 5,
                       fillColor=colors.HexColor("#1e3a5f"), strokeColor=None))
    saudacao = f"RELATÓRIO DIÁRIO — {nome_comprador.upper()}"
    if is_gestor:
        saudacao += "  [GESTOR]"
    d.add(String(width / 2, h - 34, saudacao,
                 fontName="Helvetica-Bold", fontSize=13,
                 fillColor=C_WHITE, textAnchor="middle"))
    d.add(String(width / 2, h - 54, tenant_name,
                 fontName="Helvetica-Bold", fontSize=20,
                 fillColor=C_WHITE, textAnchor="middle"))
    d.add(Line(width * 0.25, h - 64, width * 0.75, h - 64,
               strokeColor=C_TEAL, strokeWidth=1.2))
    d.add(String(width / 2, h - 78, f"AGENDA DE COMPRAS  ·  {data_label.upper()}",
                 fontName="Helvetica", fontSize=9,
                 fillColor=colors.HexColor("#94a3b8"), textAnchor="middle"))
    return d


def _section_banner(title: str, subtitle: str, width: int, accent: str = "#0f766e") -> Table:
    t_s = _s("bt", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=C_NAVY)
    s_s = _s("bs", fontName="Helvetica", fontSize=8.5, leading=11, textColor=C_SLATE)
    tbl = Table([[Paragraph(title, t_s)], [Paragraph(subtitle, s_s)]], colWidths=[width])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), colors.HexColor("#eef5fb")),
        ("LINEBEFORE",   (0, 0), (0, -1), 5, colors.HexColor(accent)),
        ("BOX",          (0, 0), (-1, -1), 0.6, C_BORDER),
        ("LEFTPADDING",  (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING",   (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 9),
    ]))
    return tbl


def _kpi_cards(kpis: dict, width: int) -> Table:
    row1 = [
        ("Total",      kpis.get("total", 0),      "#1e293b"),
        ("Realizadas", kpis.get("realizadas", 0),  "#059669"),
        ("Adiadas",    kpis.get("adiadas", 0),     "#7c3aed"),
        ("Atrasadas",  kpis.get("atrasadas", 0),   "#dc2626"),
        ("Pendentes",  kpis.get("pendentes", 0),   "#2563eb"),
    ]
    row2 = [
        ("Postergadas",   kpis.get("postergadas", 0),      "#ea580c"),
        ("Antecipadas",   kpis.get("antecipadas", 0),      "#0891b2"),
        ("Param. +",      kpis.get("param_aumentados", 0), "#d97706"),
        ("Param. -",      kpis.get("param_reduzidos", 0),  "#10b981"),
        ("Fora Carteira", kpis.get("fora_carteira", 0),    "#6b7280"),
    ]
    taxa = kpis.get("taxa_pedido")
    valor = kpis.get("valor_total_pedidos") or 0
    valor_fmt = "R$ " + f"{float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    row3 = [
        ("Pedidos Sim", kpis.get("pedidos_sim", 0),                "#16a34a"),
        ("Pedidos Não", kpis.get("pedidos_nao", 0),                "#ef4444"),
        ("Taxa Pedido", f"{taxa}%" if taxa is not None else "—",   "#0ea5e9"),
        ("Valor Total", valor_fmt,                                 "#7c3aed"),
    ]
    n = len(row1)
    card_w = (width - (n - 1) * 5) / n

    def card(label: str, value, accent: str, small: bool = False) -> Table:
        fs_val = 15 if small else 18
        t_s = _s(f"ct_{label}", fontName="Helvetica", fontSize=7.5, leading=10, textColor=C_SLATE)
        v_s = _s(f"cv_{label}", fontName="Helvetica-Bold", fontSize=fs_val, leading=fs_val + 4, textColor=C_NAVY)
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

    cards1 = [card(lbl, val, acc) for lbl, val, acc in row1]
    cards2 = [card(lbl, val, acc, small=True) for lbl, val, acc in row2]
    # Row 3 (pedidos): mesmo card_w para ficar alinhado; preencher 5ª coluna vazia
    cards3 = [card(lbl, val, acc, small=True) for lbl, val, acc in row3]
    while len(cards3) < n:
        cards3.append("")
    spacing = TableStyle([
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
    ])
    g1 = Table([cards1], colWidths=[card_w] * n)
    g1.setStyle(spacing)
    g2 = Table([cards2], colWidths=[card_w] * n)
    g2.setStyle(spacing)
    g3 = Table([cards3], colWidths=[card_w] * n)
    g3.setStyle(spacing)
    wrapper = Table([[g1], [g2], [g3]], colWidths=[width])
    wrapper.setStyle(TableStyle([
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
    ]))
    return wrapper


def _atrasados_table(rows: list[dict], width: int) -> list:
    if not rows:
        return [_empty_msg("Nenhum item em atraso.", width)]
    h_s = _s("ah", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=C_WHITE)
    c_s = _s("ac", fontName="Helvetica", fontSize=8.5, leading=11, textColor=C_RED)
    m_s = _s("am", fontName="Helvetica", fontSize=8, leading=10, textColor=C_MUTED)
    b_s = _s("ab", fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=C_RED)
    col_w = [width * w for w in [0.22, 0.38, 0.22, 0.18]]
    header = [Paragraph(h, h_s) for h in ["Comprador", "Fornecedor", "Previsto", "Atraso"]]
    data = [header]
    for r in rows:
        data.append([
            Paragraph(r.get("nome_comprador", ""), c_s),
            Paragraph(f"{r.get('codigo_fornecedor','')} — {r.get('nome_fornecedor','')}", m_s),
            Paragraph(r.get("data_prevista", "—"), m_s),
            Paragraph(f"{r.get('dias_atraso', 0)}d", b_s),
        ])
    style = TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), C_RED),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [C_WHITE, C_RED_BG]),
        ("GRID",          (0, 0), (-1, -1), 0.5, C_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ])
    tbl = Table(data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(style)
    return [tbl]


def _agenda_compras_table(rows: list[dict], dia_label: str, width: int) -> list:
    if not rows:
        return [_empty_msg(f"Nenhuma agenda de compras para {dia_label}.", width)]
    h_s = _s("gh", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=C_WHITE)
    c_s = _s("gc", fontName="Helvetica", fontSize=8.5, leading=11, textColor=C_NAVY)
    m_s = _s("gm", fontName="Helvetica", fontSize=8, leading=10, textColor=C_MUTED)
    col_w = [width * w for w in [0.22, 0.55, 0.23]]
    header = [Paragraph(h, h_s) for h in ["Comprador", "Fornecedor", "Horário"]]
    data = [header]
    for r in rows:
        hi = str(r.get("hora_inicio") or "")[:5] or "—"
        hf_raw = r.get("hora_fim")
        hf = str(hf_raw)[:5] if hf_raw else None
        horario = f"{hi} → {hf}" if hf else hi
        data.append([
            Paragraph(r.get("nome_comprador", ""), c_s),
            Paragraph(f"{r.get('codigo_fornecedor','')} — {r.get('nome_fornecedor','')}", c_s),
            Paragraph(horario, m_s),
        ])
    style = TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), C_BLUE),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [C_WHITE, C_BG_CARD]),
        ("GRID",          (0, 0), (-1, -1), 0.5, C_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ])
    tbl = Table(data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(style)
    return [tbl]


def _outros_compromissos_table(rows: list[dict], width: int) -> list:
    if not rows:
        return []
    h_s = _s("oh", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=C_WHITE)
    c_s = _s("oc", fontName="Helvetica", fontSize=8.5, leading=11, textColor=C_NAVY)
    m_s = _s("om", fontName="Helvetica", fontSize=8, leading=10, textColor=C_MUTED)
    col_w = [width * w for w in [0.20, 0.38, 0.22, 0.20]]
    header = [Paragraph(h, h_s) for h in ["Comprador", "Compromisso", "Categoria", "Horário"]]
    data = [header]
    for r in rows:
        hi = str(r.get("hora_inicio") or "")[:5] or "—"
        hf_raw = r.get("hora_fim")
        hf = str(hf_raw)[:5] if hf_raw else None
        horario = f"{hi} → {hf}" if hf else hi
        data.append([
            Paragraph(r.get("nome_comprador", ""), c_s),
            Paragraph(r.get("titulo", ""), c_s),
            Paragraph(r.get("categoria", ""), m_s),
            Paragraph(horario, m_s),
        ])
    style = TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), C_SLATE),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [C_WHITE, C_BG_CARD]),
        ("GRID",          (0, 0), (-1, -1), 0.5, C_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ])
    tbl = Table(data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(style)
    return [tbl]


def _audit_table(rows: list[dict], dia_label: str, width: int) -> list:
    if not rows:
        return [_empty_msg(f"Nenhum tratamento registrado em {dia_label}.", width)]
    h_s = _s("auh", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=C_WHITE)
    c_s = _s("auc", fontName="Helvetica", fontSize=8.5, leading=11, textColor=C_NAVY)
    m_s = _s("aum", fontName="Helvetica", fontSize=8, leading=10, textColor=C_MUTED)
    j_s = _s("auj", fontName="Helvetica-Oblique", fontSize=8, leading=10,
             textColor=colors.HexColor("#6366f1"))
    col_w = [width * w for w in [0.18, 0.32, 0.15, 0.35]]
    header = [Paragraph(h, h_s) for h in ["Comprador", "Fornecedor", "Previsto", "Obs. / Justificativa"]]
    data = [header]
    for r in rows:
        obs = _resumo_obs(r.get("observacao"))
        just = _justificativa_obs(r.get("observacao"))
        obs_cell: list = [Paragraph(obs, m_s)]
        if just:
            obs_cell.append(Paragraph(f"📝 {just}", j_s))
        data.append([
            Paragraph(r.get("nome_comprador", ""), c_s),
            Paragraph(f"{r.get('codigo_fornecedor','')} — {r.get('nome_fornecedor','')}", c_s),
            Paragraph(r.get("data_prevista") or "—", m_s),
            obs_cell,
        ])
    style = TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), C_NAVY),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [C_WHITE, C_BG_CARD]),
        ("GRID",          (0, 0), (-1, -1), 0.5, C_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ])
    tbl = Table(data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(style)
    return [tbl]


# ── Builder principal ─────────────────────────────────────────────────────────

def build_relatorio_pdf(
    nome_comprador: str,
    is_gestor: bool,
    data_ref: date,
    proximo_dia: date,
    kpis_mes_atual: dict,
    kpis_mes_anterior: dict,
    itens_atrasados: list[dict],
    agenda_compras_rows: list[dict],
    outros_compromissos_rows: list[dict],
    auditoria_rows: list[dict],
    tenant_name: str,
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=28, rightMargin=28, topMargin=22, bottomMargin=58,
    )
    W = int(doc.width)

    dia_ref_label  = _fmt_dia(data_ref)
    dia_prox_label = _fmt_dia(proximo_dia)
    mes_label      = f"{MESES_PT[data_ref.month]}/{data_ref.year}".upper()

    from datetime import date as date_cls
    from calendar import monthrange
    mes_ant_month = data_ref.month - 1 if data_ref.month > 1 else 12
    mes_ant_year  = data_ref.year if data_ref.month > 1 else data_ref.year - 1
    mes_ant_label = f"{MESES_PT[mes_ant_month]}/{mes_ant_year}".upper()

    sec_s = _s("sec", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=C_NAVY)

    content: list = []

    # 1. Hero
    content.append(_hero_band(W, tenant_name, dia_ref_label, nome_comprador, is_gestor))
    content.append(Spacer(1, 12))

    # 2. Itens em atraso
    if itens_atrasados:
        atraso_block = [
            _section_banner(
                f"⚠️  Itens em Atraso ({len(itens_atrasados)})",
                "Ocorrências PENDENTE com data anterior ao próximo dia útil. Atenção imediata recomendada.",
                W, "#dc2626",
            ),
            Spacer(1, 6),
            *_atrasados_table(itens_atrasados, W),
        ]
        content.append(KeepTogether([atraso_block[0], atraso_block[1]]))
        content.extend(atraso_block[2:])
        content.append(Spacer(1, 14))

    # 3. Agenda do próximo dia útil
    agenda_block: list = [
        _section_banner(
            f"📅  Agenda do Próximo Dia Útil — {dia_prox_label}",
            "Agenda de Compras e demais compromissos agendados para o próximo dia útil.",
            W, "#1d4ed8",
        ),
        Spacer(1, 6),
    ]
    sub_s = _s("sub2", fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=C_BLUE)
    agenda_block.append(Paragraph("Agenda de Compras", sub_s))
    agenda_block.append(Spacer(1, 4))
    agenda_block.extend(_agenda_compras_table(agenda_compras_rows, dia_prox_label, W))
    if outros_compromissos_rows:
        agenda_block.append(Spacer(1, 8))
        sub_o = _s("subo", fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=C_SLATE)
        agenda_block.append(Paragraph("Outros Compromissos", sub_o))
        agenda_block.append(Spacer(1, 4))
        agenda_block.extend(_outros_compromissos_table(outros_compromissos_rows, W))

    content.append(CondPageBreak(200))
    content.append(KeepTogether([agenda_block[0], agenda_block[1]]))
    content.extend(agenda_block[2:])
    content.append(Spacer(1, 14))

    # 4. Tratamentos do dia anterior
    audit_block = [
        _section_banner(
            f"📋  Tratamentos Realizados — {dia_ref_label}",
            "Ocorrências com status REALIZADA no dia de referência. Justificativas em itálico roxo.",
            W, "#c97841",
        ),
        Spacer(1, 6),
        *_audit_table(auditoria_rows, dia_ref_label, W),
    ]
    content.append(CondPageBreak(160))
    content.append(KeepTogether([audit_block[0], audit_block[1]]))
    content.extend(audit_block[2:])
    content.append(Spacer(1, 14))

    # 5. KPIs mês corrente
    content.append(CondPageBreak(120))
    content.append(_section_banner(f"📊  KPIs — {mes_label}", "Métricas acumuladas do mês corrente.", W, "#059669"))
    content.append(Spacer(1, 6))
    content.append(_kpi_cards(kpis_mes_atual, W))
    content.append(Spacer(1, 14))

    # 6. KPIs mês anterior
    content.append(_section_banner(f"📊  KPIs — {mes_ant_label}", "Métricas do mês anterior (comparativo).", W, "#6366f1"))
    content.append(Spacer(1, 6))
    content.append(_kpi_cards(kpis_mes_anterior, W))

    # Rodapé com logo Service Farma
    sf_logo_bytes = _fetch_sf_logo()
    sf_logo_reader: Optional[ImageReader] = None
    if sf_logo_bytes:
        try:
            sf_logo_reader = ImageReader(BytesIO(sf_logo_bytes))
        except Exception:
            sf_logo_reader = None

    def _draw_footer(canvas, doc_obj) -> None:
        canvas.saveState()
        pw = A4[0]
        if sf_logo_reader is not None:
            iw, ih = 88, 22
            canvas.drawImage(
                sf_logo_reader,
                (pw - iw) / 2, 20,
                width=iw, height=ih,
                preserveAspectRatio=True,
                mask="auto",
            )
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#94a3b8"))
        canvas.drawCentredString(pw / 2, 10, "Powered By Service Farma — Agenda de Compras — Direitos Reservados")
        canvas.restoreState()

    doc.build(content, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    return buffer.getvalue()
