"""Leitura consolidada para o espelho do Hub central (Painel Admin A3).

Um GET único devolve tenants + compradores + licenças COMERCIAIS (clientes_licencas,
a fonte de vigência real — tenant_licencas é legado morto), já mapeadas por tenant.
Somente leitura; auth pelo mesmo X-Admin-Token dos demais endpoints admin.
"""
from fastapi import APIRouter, Depends

from app.core.admin_auth import require_admin
from app.db.supabase_client import get_supabase

router = APIRouter(
    prefix="/admin/espelho",
    tags=["admin-espelho"],
    dependencies=[Depends(require_admin)],
)


@router.get("")
def leitura_espelho() -> dict:
    sb = get_supabase()

    tenants = sb.table("tenants").select("id, nome, slug, status").execute().data or []
    clientes = (
        sb.table("clientes").select("id, tenant_id, nome_fantasia, razao_social").execute().data or []
    )
    compradores = (
        sb.table("compradores")
        .select("id, tenant_id, nome_comprador, email, is_gestor, user_id")
        .not_.is_("email", "null")
        .execute()
        .data
        or []
    )
    licencas = (
        sb.table("clientes_licencas")
        .select("cliente_id, status, data_inicio_vigencia, data_fim_vigencia, bloqueado_manual")
        .execute()
        .data
        or []
    )

    # Nome de exibição = clientes.nome_fantasia com fallback tenants.nome (regra do app).
    cliente_por_tenant = {c["tenant_id"]: c for c in clientes if c.get("tenant_id")}
    tenant_por_cliente = {c["id"]: c["tenant_id"] for c in clientes if c.get("tenant_id")}

    return {
        "tenants": [
            {
                "id": t["id"],
                "nome": (cliente_por_tenant.get(t["id"]) or {}).get("nome_fantasia") or t["nome"],
                "status": t.get("status"),
            }
            for t in tenants
        ],
        "compradores": compradores,
        "licencas": [
            {
                "tenant_id": tenant_por_cliente.get(l["cliente_id"]),
                "status": l.get("status"),
                "data_inicio_vigencia": l.get("data_inicio_vigencia"),
                "data_fim_vigencia": l.get("data_fim_vigencia"),
                "bloqueado_manual": bool(l.get("bloqueado_manual")),
            }
            for l in licencas
            if tenant_por_cliente.get(l["cliente_id"])
        ],
    }
