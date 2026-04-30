"""
Geração de PDF de relatório diário — padrão visual SFI (ReportLab).
Retorna bytes prontos para serem enviados como anexo de e-mail.
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

# ── Paleta de cores (alinhada com SFI Inspetor IA) ──────────────────────────
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

DIAS_PT = {0: "Segunda", 1: "Terça", 2: "Quarta", 3: "Quinta",
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


def _fetch_sf_logo() -> Optional[bytes]:
    """Busca logo Service Farma no Vercel frontend. Retorna None se falhar."""
    try:
        import httpx
        r = httpx.get(settings.frontend_url + "/assets/logo_alta.jpg", timeout=5.0)
        if r.status_code == 200:
            return r.content
    except Exception:
        pass
    return None


# ── Componentes visuais ──────────────────────────────────────────────────────

def _style(name: str, **kw) -> ParagraphStyle:
    return ParagraphStyle(name, **kw)


def _hero_band(width: int, tenant_name: str, data_label: str, nome_comprador: str, is_gestor: bool) -> Drawing:
    h = 120
    d = Drawing(width, h)
    d.add(Rect(0, 0, width, h, fillColor=C_NAVY, strokeColor=None))
    d.add(Rect(0, 0, 7, h, fillColor=C_TEAL, strokeColor=None))
    d.add(Rect(10, 0, 3, h * 0.55, fillColor=C_BLUE, strokeColor=None))
    # decorative dots
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


def _kpi_cards(kpis: dict, width: int) -> Table:
    items = [
        ("Total", kpis.get("total", 0), "#1e293b"),
        ("Realizadas", kpis.get("realizadas", 0), "#059669"),
        ("Atrasadas", kpis.get("atrasadas", 0), "#dc2626"),
        ("Pendentes", kpis.get("pendentes", 0), "#2563eb"),
    ]
    card_w = (width - 18) / 4

    def card(label, value, accent):
        t_s = _style(f"ct_{label}", fontName="Helvetica", fontSize=8.5, leading=11,
                     textColor=colors.HexColor("#475569"))
        v_s = _style(f"cv_{label}", fontName="Helvetica-Bold", fontSize=18, leading=22,
                     textColor=colors.HexColor("#0f172a"))
        tbl = Table([[Paragraph(label, t_s)], [Paragraph(str(value), v_s)]],
                    colWidths=[card_w])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), C_BG_CARD),
            ("BOX",        (0, 0), (-1, -1), 0.7, C_BORDER),
            ("LINEABOVE",  (0, 0), (-1, 0), 3.5, colors.HexColor(accent)),
            ("LEFTPADDING",  (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING",   (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 8),
        ]))
        return tbl

    cards = [card(label, val, accent) for label, val, accent in items]
    grid = Table([cards], colWidths=[card_w] * 4)
    grid.setStyle(TableStyle([
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
    ]))
    return grid


def _section_banner(title: str, subtitle: str, width: int, accent: str = "#0f766e") -> Table:
    t_s = _style("ban_t", fontName="Helvetica-Bold", fontSize=12, leading=15,
                 textColor=colors.HexColor("#0f172a"))
    s_s = _style("ban_s", fontName="Helvetica", fontSize=9, leading=11.5,
                 textColor=C_SLATE)
    tbl = Table([[Paragraph(title, t_s)], [Paragraph(subtitle, s_s)]],
                colWidths=[width])
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


def _audit_table(rows: list[dict], dia_label: str, width: int) -> list:
    h_s = _style("ah", fontName="Helvetica-Bold", fontSize=8.5, leading=11,
                 textColor=C_WHITE)
    c_s = _style("ac", fontName="Helvetica", fontSize=8.5, leading=11,
                 textColor=colors.HexColor("#1e293b"))
    m_s = _style("am", fontName="Helvetica", fontSize=8, leading=10,
                 textColor=C_MUTED)

    if not rows:
        empty_s = _style("ae", fontName="Helvetica", fontSize=9, leading=12,
                         textColor=C_MUTED)
        tbl = Table([[Paragraph(f"Nenhum tratamento registrado em {dia_label}.", empty_s)]],
                    colWidths=[width])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), C_BG_ALT),
            ("BOX",        (0, 0), (-1, -1), 0.6, C_BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
            ("TOPPADDING",  (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 10),
        ]))
        return [tbl]

    col_w = [width * w for w in [0.20, 0.35, 0.15, 0.30]]
    header = [Paragraph(h, h_s) for h in ["Comprador", "Fornecedor", "Previsto", "Obs."]]
    data = [header]
    for r in rows:
        obs = _resumo_obs(r.get("observacao")) or r.get("obs", "")
        data.append([
            Paragraph(r.get("nome_comprador") or r.get("comprador", ""), c_s),
            Paragraph(f"{r.get('codigo_fornecedor', r.get('codigo',''))} — {r.get('nome_fornecedor', r.get('fornecedor',''))}", c_s),
            Paragraph(r.get("data_prevista") or "—", m_s),
            Paragraph(obs, m_s),
        ])

    style = TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), C_NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, C_BG_CARD]),
        ("GRID",         (0, 0), (-1, -1), 0.5, C_BORDER),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
    ])
    tbl = Table(data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(style)
    return [tbl]


def _agenda_table(rows: list[dict], dia_label: str, width: int) -> list:
    h_s = _style("gh", fontName="Helvetica-Bold", fontSize=8.5, leading=11,
                 textColor=C_WHITE)
    c_s = _style("gc", fontName="Helvetica", fontSize=8.5, leading=11,
                 textColor=colors.HexColor("#1e293b"))
    m_s = _style("gm", fontName="Helvetica", fontSize=8, leading=10,
                 textColor=C_MUTED)

    if not rows:
        empty_s = _style("ge", fontName="Helvetica", fontSize=9, leading=12,
                         textColor=C_MUTED)
        tbl = Table([[Paragraph(f"Nenhuma agenda pendente para {dia_label}.", empty_s)]],
                    colWidths=[width])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), C_BG_ALT),
            ("BOX",        (0, 0), (-1, -1), 0.6, C_BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
            ("TOPPADDING",  (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 10),
        ]))
        return [tbl]

    col_w = [width * w for w in [0.22, 0.55, 0.23]]
    header = [Paragraph(h, h_s) for h in ["Comprador", "Fornecedor", "Horário"]]
    data = [header]
    for r in rows:
        hi = r.get("hora_inicio") or "—"
        hf = r.get("hora_fim")
        horario = f"{hi} → {hf}" if hf else hi
        data.append([
            Paragraph(r.get("nome_comprador") or r.get("comprador", ""), c_s),
            Paragraph(f"{r.get('codigo_fornecedor', r.get('codigo',''))} — {r.get('nome_fornecedor', r.get('fornecedor',''))}", c_s),
            Paragraph(horario, m_s),
        ])

    style = TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), C_NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, C_BG_CARD]),
        ("GRID",         (0, 0), (-1, -1), 0.5, C_BORDER),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
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
    kpis: dict,
    auditoria_rows: list[dict],
    agenda_rows: list[dict],
    tenant_name: str,
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=28,
        rightMargin=28,
        topMargin=22,
        bottomMargin=58,
    )
    W = int(doc.width)
    mes_label = f"{MESES_PT[data_ref.month]}/{data_ref.year}".upper()
    dia_ref_label = _fmt_dia(data_ref)
    dia_prox_label = _fmt_dia(proximo_dia)

    content = []

    # — Hero band —
    content.append(_hero_band(W, tenant_name, dia_ref_label, nome_comprador, is_gestor))
    content.append(Spacer(1, 10))

    # — KPIs do mês —
    sec_s = _style("sec", fontName="Helvetica-Bold", fontSize=10, leading=13,
                   textColor=colors.HexColor("#0f172a"))
    sub_s = _style("sub", fontName="Helvetica", fontSize=8.5, leading=11,
                   textColor=C_MUTED)
    content.append(Paragraph(f"KPIs do mês — {mes_label}", sec_s))
    content.append(Spacer(1, 5))
    content.append(_kpi_cards(kpis, W))
    content.append(Spacer(1, 14))

    # — Auditoria do dia anterior —
    audit_block = [
        _section_banner(
            f"Tratamentos realizados — {dia_ref_label}",
            "Ocorrências com status REALIZADA no dia de referência.",
            W, "#c97841",
        ),
        Spacer(1, 6),
        *_audit_table(auditoria_rows, dia_ref_label, W),
    ]
    content.append(KeepTogether([audit_block[0], audit_block[1]]))
    content.extend(audit_block[2:])
    content.append(Spacer(1, 14))

    # — Agenda do próximo dia útil —
    agenda_block = [
        _section_banner(
            f"Agenda do próximo dia útil — {dia_prox_label}",
            "Ocorrências PENDENTE para o próximo dia útil (feriados considerados).",
            W, "#1d4ed8",
        ),
        Spacer(1, 6),
        *_agenda_table(agenda_rows, dia_prox_label, W),
    ]
    content.append(CondPageBreak(200))
    content.append(KeepTogether([agenda_block[0], agenda_block[1]]))
    content.extend(agenda_block[2:])

    # — Rodapé com logo Service Farma —
    sf_logo_bytes = _fetch_sf_logo()
    sf_logo_reader: Optional[ImageReader] = None
    if sf_logo_bytes:
        try:
            sf_logo_reader = ImageReader(BytesIO(sf_logo_bytes))
        except Exception:
            sf_logo_reader = None

    def _draw_footer(canvas, doc_obj) -> None:  # noqa: ANN001
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
