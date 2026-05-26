"""
Endpoint para gravar eventos de auditoria a partir do portal cliente.
Substitui o INSERT direto via Supabase REST que era bloqueado pela RLS
quando o usuário é comprador (buyer) sem entrada em tenant_users.
"""
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.db.supabase_client import get_supabase


router = APIRouter(prefix="/portal/audit-log", tags=["portal-audit-log"])


class AuditEventIn(BaseModel):
    tipo_objeto: str = Field(..., max_length=64)
    objeto_id: UUID | None = None
    objeto_nome: str | None = Field(default=None, max_length=255)
    acao: str = Field(..., max_length=32)
    campos_alterados: dict[str, Any] | None = None
    comprador_id: UUID | None = None
    executor_role: str | None = Field(default=None, max_length=32)
    executor_nome: str | None = Field(default=None, max_length=255)


@router.post("")
def gravar_audit_event(
    evento: AuditEventIn,
    authorization: str | None = Header(default=None),
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Autenticação necessária.")
    token = authorization.split(" ", 1)[1]

    sb = get_supabase()
    try:
        user_resp = sb.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado.")

    user = getattr(user_resp, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Token sem usuário válido.")

    app_metadata = getattr(user, "app_metadata", None) or {}
    tenant_id = app_metadata.get("agenda_tenant_id")

    if not tenant_id:
        # Fallback: tenta localizar tenant via tabela compradores pelo user_id
        c_res = (
            sb.table("compradores")
            .select("tenant_id")
            .eq("user_id", str(user.id))
            .limit(1)
            .execute()
        )
        if c_res.data:
            tenant_id = c_res.data[0]["tenant_id"]

    if not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Não foi possível identificar o tenant do usuário autenticado.",
        )

    payload = {
        "tenant_id": str(tenant_id),
        "tipo_objeto": evento.tipo_objeto,
        "objeto_id": str(evento.objeto_id) if evento.objeto_id else None,
        "objeto_nome": evento.objeto_nome,
        "acao": evento.acao,
        "campos_alterados": evento.campos_alterados,
        "comprador_id": str(evento.comprador_id) if evento.comprador_id else None,
        "executor_role": evento.executor_role,
        "executor_nome": evento.executor_nome,
    }

    try:
        sb.table("audit_log").insert(payload).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gravar auditoria: {e}")

    return {"ok": True}
