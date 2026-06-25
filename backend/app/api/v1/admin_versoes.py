"""Notas de Versão — gerenciamento via painel admin.

A lista de versões NÃO vive no banco — está hardcoded em
`backend/app/data/versoes.py` (espelho de `frontend/script_state.js`).
O banco guarda só destinatários e log de envios.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.core.admin_auth import require_admin
from app.core.config import settings
from app.data.versoes import VERSOES
from app.db.supabase_client import get_supabase
from app.services.email_service import send_html

router = APIRouter(
    prefix="/admin/versoes",
    tags=["admin-versoes"],
    dependencies=[Depends(require_admin)],
)


# ============================================================
# Schemas
# ============================================================

class DestinatarioCreate(BaseModel):
    email: EmailStr
    nome: Optional[str] = None


class DestinatarioUpdate(BaseModel):
    ativo: Optional[bool] = None
    nome: Optional[str] = None


# ============================================================
# Versões (read-only — fonte é o código)
# ============================================================

@router.get("/list")
def listar_versoes():
    """Devolve a lista de versões do código (mesma vista pelo cliente)."""
    return VERSOES


# ============================================================
# Destinatários (CRUD)
# ============================================================

@router.get("/destinatarios")
def listar_destinatarios():
    sb = get_supabase()
    result = (
        sb.table("versoes_destinatarios")
        .select("id,email,nome,ativo,criado_em")
        .order("criado_em", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/destinatarios", status_code=201)
def criar_destinatario(payload: DestinatarioCreate):
    sb = get_supabase()
    try:
        result = (
            sb.table("versoes_destinatarios")
            .insert({
                "email": payload.email.lower().strip(),
                "nome": (payload.nome or "").strip() or None,
                "ativo": True,
            })
            .execute()
        )
    except Exception as exc:
        msg = str(exc)
        if "duplicate key" in msg.lower() or "unique" in msg.lower():
            raise HTTPException(status_code=409, detail="E-mail já cadastrado.")
        raise HTTPException(status_code=400, detail=f"Erro ao cadastrar: {msg}")
    return (result.data or [{}])[0]


@router.patch("/destinatarios/{dest_id}")
def atualizar_destinatario(dest_id: UUID, payload: DestinatarioUpdate):
    sb = get_supabase()
    update_data: dict = {}
    if payload.ativo is not None:
        update_data["ativo"] = payload.ativo
    if payload.nome is not None:
        update_data["nome"] = payload.nome.strip() or None
    if not update_data:
        raise HTTPException(status_code=400, detail="Nada para atualizar.")
    result = (
        sb.table("versoes_destinatarios")
        .update(update_data)
        .eq("id", str(dest_id))
        .execute()
    )
    if not (result.data or []):
        raise HTTPException(status_code=404, detail="Destinatário não encontrado.")
    return result.data[0]


@router.delete("/destinatarios/{dest_id}", status_code=204)
def excluir_destinatario(dest_id: UUID):
    sb = get_supabase()
    sb.table("versoes_destinatarios").delete().eq("id", str(dest_id)).execute()
    return None


# ============================================================
# Disparo de email
# ============================================================

def _buscar_versao(versao_id: str) -> dict:
    for v in VERSOES:
        if v["versao"] == versao_id:
            return v
    raise HTTPException(status_code=404, detail=f"Versão '{versao_id}' não encontrada.")


def _build_email_html(versao: dict) -> str:
    notas_html = "".join(
        f'<li style="margin-bottom:8px;line-height:1.55;color:#374151;">{nota}</li>'
        for nota in versao.get("notas", [])
    )
    portal_url = settings.frontend_url
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Agenda de Compras — Atualização {versao["versao"]}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:32px auto;padding:0 16px 32px;">
  <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px 12px 0 0;padding:28px 32px;">
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Agenda de Compras</div>
    <div style="font-size:22px;font-weight:700;color:#fff;">Atualização {versao["versao"]}</div>
    <div style="font-size:13px;color:#cbd5e1;margin-top:6px;">{versao.get("dataHora", "")}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,.06);">
    <p style="margin:0 0 18px;font-size:15px;color:#374151;">Olá! Acabamos de publicar uma nova versão do sistema com as seguintes novidades:</p>
    <ul style="padding-left:20px;margin:0 0 24px;">{notas_html}</ul>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f1f5f9;text-align:center;">
      <a href="{portal_url}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Abrir portal →</a>
      <p style="color:#94a3b8;font-size:11px;margin:18px 0 0;">Para deixar de receber estas notificações, peça ao administrador para remover seu e-mail da lista.</p>
    </div>
  </div>
</div>
</body></html>"""


@router.post("/{versao_id}/disparar")
def disparar_versao(versao_id: str):
    """Envia o changelog da versão para todos os destinatários ativos.
    Pode ser chamado quantas vezes for necessário (reenvio).
    """
    versao = _buscar_versao(versao_id)
    sb = get_supabase()

    destinatarios = (
        sb.table("versoes_destinatarios")
        .select("email,nome")
        .eq("ativo", True)
        .execute()
        .data
        or []
    )
    if not destinatarios:
        raise HTTPException(status_code=400, detail="Nenhum destinatário ativo cadastrado.")

    html = _build_email_html(versao)
    subject = f"Agenda de Compras — Atualização {versao['versao']}"

    sent = 0
    errors = 0
    for d in destinatarios:
        email = d["email"]
        try:
            send_html([email], subject, html)
            sb.table("versoes_envios").insert({
                "versao": versao_id,
                "email_destino": email,
                "status": "enviado",
            }).execute()
            sent += 1
        except Exception as exc:
            sb.table("versoes_envios").insert({
                "versao": versao_id,
                "email_destino": email,
                "status": "erro",
                "erro_mensagem": str(exc)[:500],
            }).execute()
            errors += 1

    return {"versao": versao_id, "destinatarios": len(destinatarios), "sent": sent, "errors": errors}


@router.get("/{versao_id}/envios")
def listar_envios(versao_id: str):
    """Histórico de envios da versão (mais recente primeiro)."""
    sb = get_supabase()
    result = (
        sb.table("versoes_envios")
        .select("id,versao,email_destino,status,erro_mensagem,enviado_em")
        .eq("versao", versao_id)
        .order("enviado_em", desc=True)
        .execute()
    )
    return result.data or []
