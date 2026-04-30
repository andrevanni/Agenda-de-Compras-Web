import json
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.email_service import send_html

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


def _get_feriados(db: Session, tenant_id: str, ano: int) -> set[str]:
    rows = db.execute(
        text("SELECT data::text FROM feriados WHERE tenant_id = cast(:tid as uuid) AND EXTRACT(YEAR FROM data) = :ano"),
        {"tid": tenant_id, "ano": ano},
    ).fetchall()
    return {r[0] for r in rows}


def _get_kpis_mes(db: Session, tenant_id: str, data_ref: date) -> dict:
    inicio_mes = date(data_ref.year, data_ref.month, 1)
    row = db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE status IN ('REALIZADA','PENDENTE','ADIADA')) AS total,
                COUNT(*) FILTER (WHERE status = 'REALIZADA') AS realizadas,
                COUNT(*) FILTER (WHERE status = 'PENDENTE' AND data_prevista < :data_ref) AS atrasadas,
                COUNT(*) FILTER (WHERE status = 'PENDENTE' AND data_prevista >= :data_ref) AS pendentes
            FROM agenda_ocorrencias
            WHERE tenant_id = cast(:tid as uuid)
              AND data_prevista BETWEEN :inicio AND :data_ref
              AND fornecedor_id IS NOT NULL
        """),
        {"tid": tenant_id, "data_ref": data_ref, "inicio": inicio_mes},
    ).mappings().first()
    return dict(row) if row else {"total": 0, "realizadas": 0, "atrasadas": 0, "pendentes": 0}


def _get_kpis_mes_por_comprador(db: Session, tenant_id: str, data_ref: date, comprador_id: str) -> dict:
    inicio_mes = date(data_ref.year, data_ref.month, 1)
    row = db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE status IN ('REALIZADA','PENDENTE','ADIADA')) AS total,
                COUNT(*) FILTER (WHERE status = 'REALIZADA') AS realizadas,
                COUNT(*) FILTER (WHERE status = 'PENDENTE' AND data_prevista < :data_ref) AS atrasadas,
                COUNT(*) FILTER (WHERE status = 'PENDENTE' AND data_prevista >= :data_ref) AS pendentes
            FROM agenda_ocorrencias
            WHERE tenant_id = cast(:tid as uuid)
              AND comprador_id = cast(:cid as uuid)
              AND data_prevista BETWEEN :inicio AND :data_ref
              AND fornecedor_id IS NOT NULL
        """),
        {"tid": tenant_id, "cid": comprador_id, "data_ref": data_ref, "inicio": inicio_mes},
    ).mappings().first()
    return dict(row) if row else {"total": 0, "realizadas": 0, "atrasadas": 0, "pendentes": 0}


def _get_auditoria_dia(
    db: Session,
    tenant_id: str,
    data_ref: date,
    comprador_id: Optional[str] = None,
) -> list[dict]:
    params: dict = {"tid": tenant_id, "data_ref": data_ref}
    filtro_comprador = ""
    if comprador_id:
        filtro_comprador = "AND ao.comprador_id = cast(:cid as uuid)"
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
              {filtro_comprador}
            ORDER BY c.nome_comprador, f.nome_fornecedor
        """),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


def _get_agenda_dia(
    db: Session,
    tenant_id: str,
    data: date,
    comprador_id: Optional[str] = None,
) -> list[dict]:
    params: dict = {"tid": tenant_id, "data": data}
    filtro_comprador = ""
    if comprador_id:
        filtro_comprador = "AND ao.comprador_id = cast(:cid as uuid)"
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
              {filtro_comprador}
            ORDER BY COALESCE(ao.hora_inicio, f.hora_inicio) NULLS LAST, c.nome_comprador, f.nome_fornecedor
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


def _build_kpi_row(kpis: dict) -> str:
    items = [
        ("Total", kpis.get("total", 0), "#1e293b"),
        ("Realizadas", kpis.get("realizadas", 0), "#059669"),
        ("Atrasadas", kpis.get("atrasadas", 0), "#dc2626"),
        ("Pendentes", kpis.get("pendentes", 0), "#2563eb"),
    ]
    cells = "".join(
        f"""<td style="text-align:center;padding:14px 18px;background:#f8fafc;border-radius:8px;">
            <div style="font-size:24px;font-weight:700;color:{color};">{val}</div>
            <div style="font-size:11px;color:#64748b;margin-top:3px;text-transform:uppercase;letter-spacing:.5px;">{label}</div>
        </td>"""
        for label, val, color in items
    )
    return f'<table style="width:100%;border-spacing:8px;border-collapse:separate;"><tr>{cells}</tr></table>'


def _build_audit_table(rows: list[dict], dia_label: str) -> str:
    if not rows:
        return f'<div style="padding:14px 16px;background:#f8fafc;border-radius:8px;color:#64748b;font-size:13px;">Nenhum tratamento registrado em {dia_label}.</div>'

    linhas = "".join(
        f"""<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:9px 12px;font-size:13px;color:#374151;">{r["nome_comprador"]}</td>
            <td style="padding:9px 12px;font-size:13px;">{r["codigo_fornecedor"]} — {r["nome_fornecedor"]}</td>
            <td style="padding:9px 12px;font-size:12px;color:#6b7280;">{r.get("data_prevista") or "—"}</td>
            <td style="padding:9px 12px;font-size:12px;color:#6b7280;">{_resumo_obs(r.get("observacao"))}</td>
        </tr>"""
        for r in rows
    )
    return f"""<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.07);">
        <thead>
            <tr style="background:#f8fafc;">
                <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Comprador</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Fornecedor</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Previsto</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Obs.</th>
            </tr>
        </thead>
        <tbody>{linhas}</tbody>
    </table>"""


def _build_agenda_table(rows: list[dict], dia_label: str) -> str:
    if not rows:
        return f'<div style="padding:14px 16px;background:#f8fafc;border-radius:8px;color:#64748b;font-size:13px;">Nenhuma agenda pendente para {dia_label}.</div>'

    linhas = "".join(
        f"""<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:9px 12px;font-size:13px;color:#374151;">{r["nome_comprador"]}</td>
            <td style="padding:9px 12px;font-size:13px;">{r["codigo_fornecedor"]} — {r["nome_fornecedor"]}</td>
            <td style="padding:9px 12px;font-size:12px;color:#6b7280;">
                {r.get("hora_inicio") or "—"}{(" → " + r["hora_fim"]) if r.get("hora_fim") else ""}
            </td>
        </tr>"""
        for r in rows
    )
    return f"""<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.07);">
        <thead>
            <tr style="background:#f8fafc;">
                <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Comprador</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Fornecedor</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Horário</th>
            </tr>
        </thead>
        <tbody>{linhas}</tbody>
    </table>"""


def _build_html_email(
    nome_comprador: str,
    is_gestor: bool,
    data_ref: date,
    proximo_dia: date,
    kpis: dict,
    auditoria_rows: list[dict],
    agenda_rows: list[dict],
    tenant_name: str,
) -> str:
    dia_ref_label = f"{DIAS_PT[data_ref.weekday()]}, {_fmt(data_ref)}"
    dia_prox_label = f"{DIAS_PT[proximo_dia.weekday()]}, {_fmt(proximo_dia)}"
    mes_label = f"{MESES_PT[data_ref.month]}/{data_ref.year}"
    gestor_badge = (
        '<span style="display:inline-block;background:#6366f1;color:#fff;padding:2px 8px;border-radius:4px;'
        'font-size:11px;vertical-align:middle;margin-left:6px;">GESTOR</span>'
        if is_gestor else ""
    )
    kpi_html = _build_kpi_row(kpis)
    audit_html = _build_audit_table(auditoria_rows, dia_ref_label)
    agenda_html = _build_agenda_table(agenda_rows, dia_prox_label)

    audit_section = f"""
        <h3 style="color:#1e293b;font-size:15px;font-weight:600;margin:28px 0 10px;border-left:3px solid #f59e0b;padding-left:10px;">
            Tratamentos realizados — {dia_ref_label}
        </h3>
        {audit_html}""" if auditoria_rows is not None else ""

    agenda_section = f"""
        <h3 style="color:#1e293b;font-size:15px;font-weight:600;margin:28px 0 10px;border-left:3px solid #3b82f6;padding-left:10px;">
            Agenda do próximo dia útil — {dia_prox_label}
        </h3>
        {agenda_html}""" if agenda_rows is not None else ""

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Relatório Diário — {tenant_name}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:640px;margin:32px auto;padding:0 16px 32px;">

    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px 12px 0 0;padding:28px 32px;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Agenda de Compras</div>
      <div style="font-size:22px;font-weight:700;color:#fff;">{tenant_name}</div>
      <div style="font-size:13px;color:#cbd5e1;margin-top:6px;">Relatório diário — {dia_ref_label}</div>
    </div>

    <div style="background:#fff;border-radius:0 0 12px 12px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,.06);">

      <p style="margin:0 0 24px;color:#374151;font-size:15px;">
        Olá, <strong>{nome_comprador}</strong>{gestor_badge} 👋<br>
        <span style="color:#6b7280;font-size:13px;">
          Aqui está o resumo da operação de {dia_ref_label} e a previsão para {dia_prox_label}.
        </span>
      </p>

      <h3 style="color:#1e293b;font-size:15px;font-weight:600;margin:0 0 10px;border-left:3px solid #10b981;padding-left:10px;">
        KPIs do mês — {mes_label}
      </h3>
      {kpi_html}

      {audit_section}
      {agenda_section}

      <div style="margin-top:36px;padding-top:24px;border-top:1px solid #f1f5f9;text-align:center;">
        <a href="{settings.frontend_url}"
           style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;
                  text-decoration:none;font-size:14px;font-weight:600;letter-spacing:.3px;">
          Abrir portal →
        </a>
        <p style="color:#94a3b8;font-size:11px;margin:16px 0 0;">
          Você recebe este e-mail porque tem notificações habilitadas no Agenda de Compras.<br>
          Para desativar, acesse o portal e edite suas preferências no cadastro de compradores.
        </p>
      </div>

    </div>
  </div>
</body>
</html>"""


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
) -> dict:
    """Envia relatórios diários para todos os compradores com notificações habilitadas."""
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

    compradores = db.execute(
        text("""
            SELECT
                id::text        AS id,
                nome_comprador,
                email,
                is_gestor,
                receber_auditoria,
                receber_agenda_proximo
            FROM compradores
            WHERE tenant_id = cast(:tid as uuid)
              AND email IS NOT NULL
              AND (receber_auditoria = true OR receber_agenda_proximo = true)
            ORDER BY nome_comprador
        """),
        {"tid": tenant_id},
    ).mappings().all()

    # Carrega todos os dados uma vez para gestores
    auditoria_geral = _get_auditoria_dia(db, tenant_id, data_ref)
    agenda_geral = _get_agenda_dia(db, tenant_id, proximo_dia)
    kpis_geral = _get_kpis_mes(db, tenant_id, data_ref)

    sent = 0
    errors = 0

    for c in compradores:
        is_gestor = bool(c["is_gestor"])

        if is_gestor:
            auditoria_rows = auditoria_geral if c["receber_auditoria"] else []
            agenda_rows = agenda_geral if c["receber_agenda_proximo"] else []
            kpis = kpis_geral
            tipo = "consolidado_gestor"
        else:
            auditoria_rows = _get_auditoria_dia(db, tenant_id, data_ref, c["id"]) if c["receber_auditoria"] else []
            agenda_rows = _get_agenda_dia(db, tenant_id, proximo_dia, c["id"]) if c["receber_agenda_proximo"] else []
            kpis = _get_kpis_mes_por_comprador(db, tenant_id, data_ref, c["id"])
            tipo = "auditoria"

        html = _build_html_email(
            nome_comprador=c["nome_comprador"],
            is_gestor=is_gestor,
            data_ref=data_ref,
            proximo_dia=proximo_dia,
            kpis=kpis,
            auditoria_rows=auditoria_rows,
            agenda_rows=agenda_rows,
            tenant_name=tenant_name,
        )
        subject = f"Agenda de Compras — Relatório {_fmt(data_ref)}"

        try:
            send_html([c["email"]], subject, html)
            _log_envio(db, tenant_id, c["id"], tipo, data_ref, c["email"], "enviado")
            sent += 1
        except Exception as exc:
            _log_envio(db, tenant_id, c["id"], tipo, data_ref, c["email"], "erro", str(exc)[:500])
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
    """Chamado pelo cron job — percorre todos os tenants."""
    tenants = db.execute(text("SELECT id::text AS id FROM tenants")).mappings().all()
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
