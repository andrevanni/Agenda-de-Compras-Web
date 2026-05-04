from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.admin_auth import require_admin
from app.db.supabase_client import get_supabase

router = APIRouter(
    prefix="/admin/email-log",
    tags=["admin-email-log"],
    dependencies=[Depends(require_admin)],
)


@router.get("")
def listar_email_log(
    dias: int = Query(30, ge=1, le=365),
    tenant_id: Optional[UUID] = Query(None),
):
    sb = get_supabase()

    cutoff = (datetime.now(timezone.utc) - timedelta(days=dias)).isoformat()

    query = (
        sb.table("relatorio_log")
        .select(
            "id,tenant_id,comprador_id,tipo,data_referencia,email_destino,status,erro_mensagem,created_at,"
            "tenants(nome),"
            "compradores(nome_comprador)"
        )
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(500)
    )

    if tenant_id:
        query = query.eq("tenant_id", str(tenant_id))

    result = query.execute()
    rows = result.data or []

    out = []
    for r in rows:
        tenant_nome = (r.get("tenants") or {}).get("nome") or r.get("tenant_id", "")
        comprador_nome = (r.get("compradores") or {}).get("nome_comprador") or ""
        out.append({
            "id": r.get("id"),
            "tenant_id": r.get("tenant_id"),
            "tenant_nome": tenant_nome,
            "comprador_id": r.get("comprador_id"),
            "comprador_nome": comprador_nome,
            "tipo": r.get("tipo"),
            "data_referencia": r.get("data_referencia"),
            "email_destino": r.get("email_destino"),
            "status": r.get("status"),
            "erro_mensagem": r.get("erro_mensagem"),
            "created_at": r.get("created_at"),
        })

    return out
