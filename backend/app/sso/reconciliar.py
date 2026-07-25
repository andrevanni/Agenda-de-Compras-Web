"""Reconciliação da identidade central (e-mail) -> comprador da Agenda.

O SSO entra sempre como COMPRADOR no portal do cliente (o admin da Agenda usa
X-Admin-Token/JWT admin próprio e fica fora). Sem match -> None (nega o SSO)."""
from typing import Any


def resolver_comprador(sb: Any, email: str) -> dict | None:
    email = (email or "").lower().strip()
    if not email:
        return None

    r = (
        sb.table("compradores").select("id, tenant_id, nome_comprador, email")
        .ilike("email", email).limit(1).execute()
    )
    if r.data:
        row = r.data[0]
        return {
            "comprador_id": str(row["id"]),
            "tenant_id": str(row["tenant_id"]),
            "nome": row.get("nome_comprador"),
            "email": email,
        }
    return None
