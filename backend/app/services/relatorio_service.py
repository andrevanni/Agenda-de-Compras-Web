import json
from calendar import monthrange
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# Quantos envios de email simultâneos. Resend free tem rate limit ~10 req/s;
# 5 workers ficam folgados e ainda assim cortam o tempo do cron em ~5x.
EMAIL_PARALLEL_WORKERS = 5

from app.core.config import settings
from app.db.supabase_client import get_supabase
from app.services.email_service import send_html
from app.services.pdf_service import build_relatorio_pdf

DIAS_PT = {0: "Segunda", 1: "Terça", 2: "Quarta", 3: "Quinta", 4: "Sexta", 5: "Sábado", 6: "Domingo"}
MESES_PT = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
}


def _fmt(d: date) -> str:
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def _proximo_dia_util(data: date, feriados: set[str]) -> date:
    proximo = data + timedelta(days=1)
    while proximo.weekday() >= 5 or proximo.isoformat() in feriados:
        proximo += timedelta(days=1)
    return proximo


def _mes_anterior(data_ref: date) -> tuple[date, date]:
    primeiro_atual = date(data_ref.year, data_ref.month, 1)
    ultimo_anterior = primeiro_atual - timedelta(days=1)
    primeiro_anterior = date(ultimo_anterior.year, ultimo_anterior.month, 1)
    return primeiro_anterior, ultimo_anterior


def _get_feriados(db: Session, tenant_id: str, ano: int) -> set[str]:
    rows = db.execute(
        text("SELECT data::text FROM feriados WHERE tenant_id = cast(:tid as uuid) AND EXTRACT(YEAR FROM data) = :ano"),
        {"tid": tenant_id, "ano": ano},
    ).fetchall()
    return {r[0] for r in rows}


def _kpis_query(db: Session, tenant_id: str, inicio: date, fim: date, comprador_id: Optional[str] = None) -> dict:
    filtro = "AND comprador_id = cast(:cid as uuid)" if comprador_id else ""
    params: dict = {"tid": tenant_id, "inicio": inicio, "fim": fim}
    if comprador_id:
        params["cid"] = comprador_id
    row = db.execute(
        text(f"""
            SELECT
                COUNT(*) FILTER (WHERE status IN ('REALIZADA','PENDENTE','ADIADA')) AS total,
                COUNT(*) FILTER (WHERE status = 'REALIZADA') AS realizadas,
                COUNT(*) FILTER (WHERE status = 'ADIADA') AS adiadas,
                COUNT(*) FILTER (WHERE status = 'PENDENTE' AND data_prevista < :fim) AS atrasadas,
                COUNT(*) FILTER (WHERE status = 'PENDENTE' AND data_prevista >= :fim) AS pendentes,
                COUNT(*) FILTER (
                    WHERE status = 'REALIZADA'
                      AND observacao IS NOT NULL
                      AND observacao::jsonb ? 'ajuste_proxima_data_dias'
                      AND (observacao::jsonb->>'ajuste_proxima_data_dias')::int > 0
                ) AS postergadas,
                COUNT(*) FILTER (
                    WHERE status = 'REALIZADA'
                      AND observacao IS NOT NULL
                      AND observacao::jsonb ? 'ajuste_proxima_data_dias'
                      AND (observacao::jsonb->>'ajuste_proxima_data_dias')::int < 0
                ) AS antecipadas,
                COUNT(*) FILTER (
                    WHERE status = 'REALIZADA'
                      AND observacao IS NOT NULL
                      AND observacao::jsonb ? 'incremento_parametro_dias'
                      AND (observacao::jsonb->>'incremento_parametro_dias')::int > 0
                ) AS param_aumentados,
                COUNT(*) FILTER (
                    WHERE status = 'REALIZADA'
                      AND observacao IS NOT NULL
                      AND observacao::jsonb ? 'incremento_parametro_dias'
                      AND (observacao::jsonb->>'incremento_parametro_dias')::int < 0
                ) AS param_reduzidos,
                COUNT(*) FILTER (
                    WHERE status = 'REALIZADA'
                      AND observacao IS NOT NULL
                      AND observacao::jsonb ? 'executado_fora_da_carteira'
                      AND (observacao::jsonb->>'executado_fora_da_carteira')::boolean = true
                ) AS fora_carteira,
                COUNT(*) FILTER (WHERE pedido_realizado = TRUE) AS pedidos_sim,
                COUNT(*) FILTER (WHERE pedido_realizado = FALSE) AS pedidos_nao,
                COALESCE(SUM(pedido_valor) FILTER (WHERE pedido_realizado = TRUE), 0) AS valor_total_pedidos
            FROM agenda_ocorrencias
            WHERE tenant_id = cast(:tid as uuid)
              AND data_prevista BETWEEN :inicio AND :fim
              AND fornecedor_id IS NOT NULL
              {filtro}
        """),
        params,
    ).mappings().first()
    empty = {"total": 0, "realizadas": 0, "adiadas": 0, "atrasadas": 0, "pendentes": 0,
             "postergadas": 0, "antecipadas": 0, "param_aumentados": 0, "param_reduzidos": 0,
             "fora_carteira": 0, "pedidos_sim": 0, "pedidos_nao": 0, "valor_total_pedidos": 0}
    result = dict(row) if row else empty
    # taxa_pedido = sim / (sim + nao) — calculada após query
    respondidos = (result.get("pedidos_sim") or 0) + (result.get("pedidos_nao") or 0)
    result["taxa_pedido"] = round((result.get("pedidos_sim", 0) / respondidos) * 100) if respondidos > 0 else None
    return result


def _get_itens_atrasados(
    db: Session, tenant_id: str, proximo_dia: date, comprador_id: Optional[str] = None
) -> list[dict]:
    filtro = "AND ao.comprador_id = cast(:cid as uuid)" if comprador_id else ""
    params: dict = {"tid": tenant_id, "proximo_dia": proximo_dia}
    if comprador_id:
        params["cid"] = comprador_id
    rows = db.execute(
        text(f"""
            SELECT
                f.codigo_fornecedor,
                f.nome_fornecedor,
                COALESCE(c.nome_comprador, 'Sem comprador') AS nome_comprador,
                ao.data_prevista::text AS data_prevista,
                (CURRENT_DATE - ao.data_prevista) AS dias_atraso
            FROM agenda_ocorrencias ao
            JOIN fornecedores f ON f.id = ao.fornecedor_id AND f.tenant_id = ao.tenant_id
            LEFT JOIN compradores c ON c.id = ao.comprador_id AND c.tenant_id = ao.tenant_id
            WHERE ao.tenant_id = cast(:tid as uuid)
              AND ao.status = 'PENDENTE'
              AND ao.data_prevista < :proximo_dia
              AND ao.fornecedor_id IS NOT NULL
              {filtro}
            ORDER BY ao.data_prevista ASC, c.nome_comprador, f.nome_fornecedor
        """),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


def _get_agenda_compras_dia(
    db: Session, tenant_id: str, data: date, comprador_id: Optional[str] = None
) -> list[dict]:
    filtro = "AND ao.comprador_id = cast(:cid as uuid)" if comprador_id else ""
    params: dict = {"tid": tenant_id, "data": data}
    if comprador_id:
        params["cid"] = comprador_id
    rows = db.execute(
        text(f"""
            SELECT
                f.codigo_fornecedor,
                f.nome_fornecedor,
                COALESCE(c.nome_comprador, 'Sem comprador') AS nome_comprador,
                COALESCE(ao.hora_inicio, f.hora_inicio) AS hora_inicio,
                COALESCE(ao.hora_fim, f.hora_fim) AS hora_fim
            FROM agenda_ocorrencias ao
            JOIN fornecedores f ON f.id = ao.fornecedor_id AND f.tenant_id = ao.tenant_id
            LEFT JOIN compradores c ON c.id = ao.comprador_id AND c.tenant_id = ao.tenant_id
            WHERE ao.tenant_id = cast(:tid as uuid)
              AND ao.status = 'PENDENTE'
              AND ao.data_prevista = :data
              AND ao.fornecedor_id IS NOT NULL
              {filtro}
            ORDER BY COALESCE(ao.hora_inicio, f.hora_inicio) NULLS LAST, c.nome_comprador, f.nome_fornecedor
        """),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


def _get_outros_compromissos_dia(
    db: Session, tenant_id: str, data: date, comprador_id: Optional[str] = None
) -> list[dict]:
    filtro = "AND ao.comprador_id = cast(:cid as uuid)" if comprador_id else ""
    params: dict = {"tid": tenant_id, "data": data}
    if comprador_id:
        params["cid"] = comprador_id
    rows = db.execute(
        text(f"""
            SELECT
                COALESCE(c.nome_comprador, 'Sem comprador') AS nome_comprador,
                COALESCE(ao.titulo, 'Compromisso') AS titulo,
                ao.hora_inicio,
                ao.hora_fim,
                COALESCE(cat.nome, 'Geral') AS categoria
            FROM agenda_ocorrencias ao
            LEFT JOIN compradores c ON c.id = ao.comprador_id AND c.tenant_id = ao.tenant_id
            LEFT JOIN categorias_agenda cat ON cat.id = ao.categoria_id
            WHERE ao.tenant_id = cast(:tid as uuid)
              AND ao.status = 'PENDENTE'
              AND ao.data_prevista = :data
              AND ao.fornecedor_id IS NULL
              {filtro}
            ORDER BY ao.hora_inicio NULLS LAST, c.nome_comprador
        """),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


def _get_auditoria_dia(
    db: Session, tenant_id: str, data_ref: date, comprador_id: Optional[str] = None
) -> list[dict]:
    filtro = "AND ao.comprador_id = cast(:cid as uuid)" if comprador_id else ""
    params: dict = {"tid": tenant_id, "data_ref": data_ref}
    if comprador_id:
        params["cid"] = comprador_id
    rows = db.execute(
        text(f"""
            SELECT
                f.codigo_fornecedor,
                f.nome_fornecedor,
                COALESCE(c.nome_comprador, 'Sem comprador') AS nome_comprador,
                ao.data_prevista::text AS data_prevista,
                ao.data_realizacao::text AS data_realizacao,
                ao.observacao
            FROM agenda_ocorrencias ao
            JOIN fornecedores f ON f.id = ao.fornecedor_id AND f.tenant_id = ao.tenant_id
            LEFT JOIN compradores c ON c.id = ao.comprador_id AND c.tenant_id = ao.tenant_id
            WHERE ao.tenant_id = cast(:tid as uuid)
              AND ao.status = 'REALIZADA'
              AND ao.data_realizacao = :data_ref
              AND ao.fornecedor_id IS NOT NULL
              {filtro}
            ORDER BY c.nome_comprador, f.nome_fornecedor
        """),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


def _resumo_obs(observacao: Optional[str], max_len: int = 90) -> str:
    if not observacao:
        return ""
    try:
        data = json.loads(observacao)
        note = data.get("note") or data.get("summary") or ""
        return str(note)[:max_len]
    except Exception:
        return str(observacao)[:max_len]


def _justificativa_obs(observacao: Optional[str]) -> str:
    if not observacao:
        return ""
    try:
        data = json.loads(observacao)
        return str(data.get("justificativa") or "")
    except Exception:
        return ""


def _build_html_email(
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
) -> str:
    dia_ref_label = f"{DIAS_PT[data_ref.weekday()]}, {_fmt(data_ref)}"
    dia_prox_label = f"{DIAS_PT[proximo_dia.weekday()]}, {_fmt(proximo_dia)}"
    mes_atual_label = f"{MESES_PT[data_ref.month]}/{data_ref.year}"
    inicio_ant, fim_ant = _mes_anterior(data_ref)
    mes_ant_label = f"{MESES_PT[inicio_ant.month]}/{inicio_ant.year}"
    gestor_badge = (
        '<span style="display:inline-block;background:#6366f1;color:#fff;padding:2px 8px;border-radius:4px;'
        'font-size:11px;vertical-align:middle;margin-left:6px;">GESTOR</span>'
        if is_gestor else ""
    )

    def kpi_row(kpis: dict, label: str) -> str:
        def cell(lbl: str, val: int, color: str) -> str:
            return (
                f'<td style="text-align:center;padding:8px 10px;background:#f8fafc;border-radius:8px;">'
                f'<div style="font-size:18px;font-weight:700;color:{color};">{val}</div>'
                f'<div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.3px;">{lbl}</div></td>'
            )
        row1 = "".join([
            cell("Total",      kpis.get("total", 0),      "#1e293b"),
            cell("Realizadas", kpis.get("realizadas", 0),  "#059669"),
            cell("Adiadas",    kpis.get("adiadas", 0),     "#7c3aed"),
            cell("Atrasadas",  kpis.get("atrasadas", 0),   "#dc2626"),
            cell("Pendentes",  kpis.get("pendentes", 0),   "#2563eb"),
        ])
        row2 = "".join([
            cell("Postergadas",   kpis.get("postergadas", 0),      "#ea580c"),
            cell("Antecipadas",   kpis.get("antecipadas", 0),      "#0891b2"),
            cell("Parâm. ↑", kpis.get("param_aumentados", 0), "#d97706"),
            cell("Parâm. ↓", kpis.get("param_reduzidos", 0),  "#10b981"),
            cell("Fora carteira", kpis.get("fora_carteira", 0),    "#6b7280"),
        ])
        taxa = kpis.get("taxa_pedido")
        valor = kpis.get("valor_total_pedidos") or 0
        valor_fmt = "R$ " + f"{float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        row3 = "".join([
            cell("Pedidos Sim", kpis.get("pedidos_sim", 0),                "#16a34a"),
            cell("Pedidos Não", kpis.get("pedidos_nao", 0),                "#ef4444"),
            cell("Taxa Pedido", f"{taxa}%" if taxa is not None else "—",   "#0ea5e9"),
            cell("Valor Total", valor_fmt,                                 "#7c3aed"),
        ])
        return (
            f'<p style="font-size:13px;font-weight:600;color:#1e293b;margin:20px 0 6px;">{label}</p>'
            f'<table style="width:100%;border-spacing:5px;border-collapse:separate;">'
            f'<tr>{row1}</tr><tr>{row2}</tr><tr>{row3}</tr></table>'
        )

    def atrasados_section() -> str:
        if not itens_atrasados:
            return ""
        linhas = "".join(
            f'<tr><td style="padding:7px 10px;font-size:12px;color:#dc2626;font-weight:600;">{r["nome_comprador"]}</td>'
            f'<td style="padding:7px 10px;font-size:12px;">{r["codigo_fornecedor"]} — {r["nome_fornecedor"]}</td>'
            f'<td style="padding:7px 10px;font-size:12px;color:#64748b;">{r["data_prevista"]}</td>'
            f'<td style="padding:7px 10px;font-size:12px;font-weight:700;color:#dc2626;">{r["dias_atraso"]}d</td></tr>'
            for r in itens_atrasados
        )
        return (
            '<h3 style="color:#dc2626;font-size:14px;font-weight:700;margin:24px 0 8px;border-left:4px solid #dc2626;padding-left:10px;">'
            f'⚠️ Itens em Atraso ({len(itens_atrasados)})</h3>'
            '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">'
            '<thead><tr style="background:#fee2e2;">'
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#991b1b;text-transform:uppercase;">Comprador</th>'
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#991b1b;text-transform:uppercase;">Fornecedor</th>'
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#991b1b;text-transform:uppercase;">Previsto</th>'
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#991b1b;text-transform:uppercase;">Atraso</th></tr></thead>'
            f'<tbody>{linhas}</tbody></table>'
        )

    def _fmt_hora(t) -> str:
        if t is None:
            return "—"
        return str(t)[:5]

    def _horario_cell(r: dict) -> str:
        hi = _fmt_hora(r.get("hora_inicio"))
        hf = r.get("hora_fim")
        return hi + (" → " + _fmt_hora(hf) if hf else "")

    def agenda_section() -> str:
        parts = []
        if agenda_compras_rows:
            linhas_ac = []
            for r in agenda_compras_rows:
                linhas_ac.append(
                    f'<tr>'
                    f'<td style="padding:7px 10px;font-size:12px;color:#374151;">{r["nome_comprador"]}</td>'
                    f'<td style="padding:7px 10px;font-size:12px;">{r["codigo_fornecedor"]} — {r["nome_fornecedor"]}</td>'
                    f'<td style="padding:7px 10px;font-size:12px;color:#64748b;">{_horario_cell(r)}</td>'
                    f'</tr>'
                )
            linhas = "".join(linhas_ac)
            parts.append(
                '<p style="font-size:12px;font-weight:600;color:#2563eb;margin:10px 0 4px;">Agenda de Compras</p>'
                '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;">'
                '<thead><tr style="background:#dbeafe;">'
                '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#1e40af;text-transform:uppercase;">Comprador</th>'
                '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#1e40af;text-transform:uppercase;">Fornecedor</th>'
                '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#1e40af;text-transform:uppercase;">Horário</th></tr></thead>'
                f'<tbody>{linhas}</tbody></table>'
            )
        if outros_compromissos_rows:
            linhas_oc = []
            for r in outros_compromissos_rows:
                linhas_oc.append(
                    f'<tr>'
                    f'<td style="padding:7px 10px;font-size:12px;color:#374151;">{r["nome_comprador"]}</td>'
                    f'<td style="padding:7px 10px;font-size:12px;">{r["titulo"]}</td>'
                    f'<td style="padding:7px 10px;font-size:11px;color:#6b7280;">{r.get("categoria", "")}</td>'
                    f'<td style="padding:7px 10px;font-size:12px;color:#64748b;">{_horario_cell(r)}</td>'
                    f'</tr>'
                )
            linhas = "".join(linhas_oc)
            parts.append(
                '<p style="font-size:12px;font-weight:600;color:#6b7280;margin:10px 0 4px;">Outros Compromissos</p>'
                '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;">'
                '<thead><tr style="background:#f1f5f9;">'
                '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;">Comprador</th>'
                '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;">Compromisso</th>'
                '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;">Categoria</th>'
                '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;">Horário</th></tr></thead>'
                f'<tbody>{linhas}</tbody></table>'
            )
        if not parts:
            return '<p style="font-size:13px;color:#64748b;padding:10px;">Nenhum item para o próximo dia útil.</p>'
        return "".join(parts)

    def auditoria_section() -> str:
        if not auditoria_rows:
            return '<p style="font-size:13px;color:#64748b;padding:10px;">Nenhum tratamento registrado.</p>'
        partes = []
        for r in auditoria_rows:
            just = _justificativa_obs(r.get("observacao"))
            just_html = '<br><em style="color:#6366f1">' + just + "</em>" if just else ""
            partes.append(
                f'<tr><td style="padding:7px 10px;font-size:12px;">{r["nome_comprador"]}</td>'
                f'<td style="padding:7px 10px;font-size:12px;">{r["codigo_fornecedor"]} — {r["nome_fornecedor"]}</td>'
                f'<td style="padding:7px 10px;font-size:11px;color:#64748b;">{r.get("data_prevista", "—")}</td>'
                f'<td style="padding:7px 10px;font-size:11px;color:#64748b;">{_resumo_obs(r.get("observacao"))}{just_html}</td>'
                f'</tr>'
            )
        linhas = "".join(partes)
        return (
            '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;">'
            '<thead><tr style="background:#f8fafc;">'
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Comprador</th>'
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Fornecedor</th>'
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Previsto</th>'
            '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Obs.</th></tr></thead>'
            f'<tbody>{linhas}</tbody></table>'
        )

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Relatório Diário — {tenant_name}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:680px;margin:32px auto;padding:0 16px 32px;">
  <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px 12px 0 0;padding:28px 32px;">
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Agenda de Compras</div>
    <div style="font-size:22px;font-weight:700;color:#fff;">{tenant_name}</div>
    <div style="font-size:13px;color:#cbd5e1;margin-top:6px;">Relatório diário — {dia_ref_label}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,.06);">
    <p style="margin:0 0 20px;font-size:15px;color:#374151;">
      Olá, <strong>{nome_comprador}</strong>{gestor_badge} 👋
    </p>

    {atrasados_section()}

    <h3 style="color:#1e293b;font-size:14px;font-weight:700;margin:24px 0 8px;border-left:4px solid #2563eb;padding-left:10px;">
      📅 Agenda do Próximo Dia Útil — {dia_prox_label}
    </h3>
    {agenda_section()}

    <h3 style="color:#1e293b;font-size:14px;font-weight:700;margin:24px 0 8px;border-left:4px solid #f59e0b;padding-left:10px;">
      📋 Tratamentos Realizados — {dia_ref_label}
    </h3>
    {auditoria_section()}

    {kpi_row(kpis_mes_atual, f"📊 KPIs — {mes_atual_label}")}
    {kpi_row(kpis_mes_anterior, f"📊 Mês Anterior — {mes_ant_label}")}

    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;">
      <a href="{settings.frontend_url}"
         style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;
                text-decoration:none;font-size:14px;font-weight:600;">
        Abrir portal →
      </a>
      <p style="color:#94a3b8;font-size:11px;margin:14px 0 0;">
        Para desativar estas notificações, edite as preferências no cadastro de compradores.
      </p>
    </div>
  </div>
</div>
</body></html>"""


def _log_envio(
    db: Session,
    tenant_id: str,
    comprador_id: Optional[str],
    tipo: str,
    data_referencia: date,
    email_destino: str,
    status: str,
    erro: Optional[str] = None,
) -> None:
    db.execute(
        text("""
            INSERT INTO relatorio_log
              (tenant_id, comprador_id, tipo, data_referencia, email_destino, status, erro_mensagem)
            VALUES (
              cast(:tid as uuid),
              cast(NULLIF(:cid, '') as uuid),
              :tipo, :data_ref, :email, :status, :erro
            )
        """),
        {
            "tid": tenant_id,
            "cid": comprador_id or "",
            "tipo": tipo,
            "data_ref": data_referencia,
            "email": email_destino,
            "status": status,
            "erro": erro,
        },
    )
    db.commit()


def enviar_relatorios_tenant(
    db: Session,
    tenant_id: str,
    data_ref: Optional[date] = None,
    admin_only: bool = False,
    comprador_id: Optional[str] = None,
) -> dict:
    from datetime import datetime
    if data_ref is None:
        data_ref = datetime.now().date() - timedelta(days=1)

    tenant_row = db.execute(
        text("SELECT nome FROM tenants WHERE id = cast(:tid as uuid)"),
        {"tid": tenant_id},
    ).mappings().first()
    tenant_name = tenant_row["nome"] if tenant_row else "Agenda de Compras"

    feriados = _get_feriados(db, tenant_id, data_ref.year)
    proximo_dia = _proximo_dia_util(data_ref, feriados)

    inicio_mes_atual = date(data_ref.year, data_ref.month, 1)
    inicio_mes_ant, fim_mes_ant = _mes_anterior(data_ref)

    # comprador_id: envio pontual para um único comprador (validação/teste manual).
    # Quando setado, ignora os demais compradores e as cópias de admin.
    filtro_comprador = "AND id = cast(:cid as uuid)" if comprador_id else ""
    params_compradores: dict = {"tid": tenant_id}
    if comprador_id:
        params_compradores["cid"] = comprador_id
    compradores = db.execute(
        text(f"""
            SELECT
                id::text AS id,
                nome_comprador,
                email,
                is_gestor,
                receber_auditoria,
                receber_agenda_proximo
            FROM compradores
            WHERE tenant_id = cast(:tid as uuid)
              AND email IS NOT NULL
              AND (receber_auditoria = true OR receber_agenda_proximo = true)
              {filtro_comprador}
            ORDER BY nome_comprador
        """),
        params_compradores,
    ).mappings().all()

    # Dados gerais para gestores (carregados uma vez)
    atrasados_geral = _get_itens_atrasados(db, tenant_id, proximo_dia)
    agenda_compras_geral = _get_agenda_compras_dia(db, tenant_id, proximo_dia)
    outros_compromissos_geral = _get_outros_compromissos_dia(db, tenant_id, proximo_dia)
    auditoria_geral = _get_auditoria_dia(db, tenant_id, data_ref)
    kpis_mes_atual_geral = _kpis_query(db, tenant_id, inicio_mes_atual, data_ref)
    kpis_mes_ant_geral = _kpis_query(db, tenant_id, inicio_mes_ant, fim_mes_ant)

    # FASE 1 — montar payloads em série (queries DB + HTML + PDF).
    # Queries só aqui pq SQLAlchemy Session não é thread-safe.
    subject = f"Agenda de Compras — Relatório {_fmt(data_ref)}"
    pdf_filename = f"relatorio_{_fmt(data_ref).replace('/', '-')}.pdf"
    payloads: list[dict] = []

    for c in ([] if admin_only else compradores):
        is_gestor = bool(c["is_gestor"])

        if is_gestor:
            atrasados = atrasados_geral if c["receber_agenda_proximo"] else []
            agenda_compras = agenda_compras_geral if c["receber_agenda_proximo"] else []
            outros = outros_compromissos_geral if c["receber_agenda_proximo"] else []
            auditoria = auditoria_geral if c["receber_auditoria"] else []
            kpis_atual = kpis_mes_atual_geral
            kpis_ant = kpis_mes_ant_geral
            tipo = "consolidado_gestor"
        else:
            cid = c["id"]
            atrasados = _get_itens_atrasados(db, tenant_id, proximo_dia, cid) if c["receber_agenda_proximo"] else []
            agenda_compras = _get_agenda_compras_dia(db, tenant_id, proximo_dia, cid) if c["receber_agenda_proximo"] else []
            outros = _get_outros_compromissos_dia(db, tenant_id, proximo_dia, cid) if c["receber_agenda_proximo"] else []
            auditoria = _get_auditoria_dia(db, tenant_id, data_ref, cid) if c["receber_auditoria"] else []
            kpis_atual = _kpis_query(db, tenant_id, inicio_mes_atual, data_ref, cid)
            kpis_ant = _kpis_query(db, tenant_id, inicio_mes_ant, fim_mes_ant, cid)
            tipo = "auditoria"

        html = _build_html_email(
            nome_comprador=c["nome_comprador"],
            is_gestor=is_gestor,
            data_ref=data_ref,
            proximo_dia=proximo_dia,
            kpis_mes_atual=kpis_atual,
            kpis_mes_anterior=kpis_ant,
            itens_atrasados=atrasados,
            agenda_compras_rows=agenda_compras,
            outros_compromissos_rows=outros,
            auditoria_rows=auditoria,
            tenant_name=tenant_name,
        )

        pdf_bytes: Optional[bytes] = None
        try:
            pdf_bytes = build_relatorio_pdf(
                nome_comprador=c["nome_comprador"],
                is_gestor=is_gestor,
                data_ref=data_ref,
                proximo_dia=proximo_dia,
                kpis_mes_atual=kpis_atual,
                kpis_mes_anterior=kpis_ant,
                itens_atrasados=atrasados,
                agenda_compras_rows=agenda_compras,
                outros_compromissos_rows=outros,
                auditoria_rows=auditoria,
                tenant_name=tenant_name,
            )
        except Exception:
            pdf_bytes = None

        payloads.append({
            "email": c["email"],
            "html": html,
            "attachments": [(pdf_filename, pdf_bytes)] if pdf_bytes else None,
            "comprador_id": c["id"],
            "tipo": tipo,
        })

    # Admins inscritos: mesmo HTML/PDF para todos (dados gerais), 1 payload por admin.
    # Pulado em envio pontual (comprador_id) — só queremos o comprador alvo.
    try:
        if comprador_id:
            admin_emails = []
        else:
            sb = get_supabase()
            resp = sb.table("admin_report_subscriptions").select("admin_email").eq("tenant_id", tenant_id).execute()
            admin_emails = [r["admin_email"] for r in (resp.data or [])]
    except Exception:
        admin_emails = []  # Nunca bloquear envio para compradores

    if admin_emails:
        html_admin = _build_html_email(
            nome_comprador="Administrador",
            is_gestor=True,
            data_ref=data_ref,
            proximo_dia=proximo_dia,
            kpis_mes_atual=kpis_mes_atual_geral,
            kpis_mes_anterior=kpis_mes_ant_geral,
            itens_atrasados=atrasados_geral,
            agenda_compras_rows=agenda_compras_geral,
            outros_compromissos_rows=outros_compromissos_geral,
            auditoria_rows=auditoria_geral,
            tenant_name=tenant_name,
        )
        pdf_admin: Optional[bytes] = None
        try:
            pdf_admin = build_relatorio_pdf(
                nome_comprador="Administrador",
                is_gestor=True,
                data_ref=data_ref,
                proximo_dia=proximo_dia,
                kpis_mes_atual=kpis_mes_atual_geral,
                kpis_mes_anterior=kpis_mes_ant_geral,
                itens_atrasados=atrasados_geral,
                agenda_compras_rows=agenda_compras_geral,
                outros_compromissos_rows=outros_compromissos_geral,
                auditoria_rows=auditoria_geral,
                tenant_name=tenant_name,
            )
        except Exception:
            pdf_admin = None
        attachments_admin = [(pdf_filename, pdf_admin)] if pdf_admin else None
        for admin_email in admin_emails:
            payloads.append({
                "email": admin_email,
                "html": html_admin,
                "attachments": attachments_admin,
                "comprador_id": None,
                "tipo": "admin_copia",
            })

    # FASE 2 — envia tudo em paralelo. Bloqueante; resultados na mesma ordem dos payloads.
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

    # FASE 3 — log em série (session DB não é thread-safe).
    sent = 0
    errors = 0
    for payload, (status, erro) in zip(payloads, results):
        _log_envio(db, tenant_id, payload["comprador_id"], payload["tipo"], data_ref, payload["email"], status, erro)
        if status == "enviado":
            sent += 1
        else:
            errors += 1

    return {
        "tenant_id": tenant_id,
        "data_ref": str(data_ref),
        "proximo_dia": str(proximo_dia),
        "sent": sent,
        "errors": errors,
    }


def enviar_relatorios_todos_tenants(
    db: Session,
    data_ref: Optional[date] = None,
) -> dict:
    tenants = db.execute(text("SELECT id::text AS id FROM tenants WHERE envio_relatorio_ativo = true ORDER BY nome")).mappings().all()
    total_sent = 0
    total_errors = 0
    results = []
    for t in tenants:
        r = enviar_relatorios_tenant(db, t["id"], data_ref)
        total_sent += r["sent"]
        total_errors += r["errors"]
        if r["sent"] or r["errors"]:
            results.append(r)
    return {"tenants_processados": len(tenants), "sent": total_sent, "errors": total_errors, "detalhe": results}
