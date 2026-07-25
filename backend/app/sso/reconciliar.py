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
        .ilike("email", email).limit(3).execute()
    )
    # Mesmo e-mail em >1 tenant: NEGA (fail-closed). Escolher "o primeiro" logaria
    # a pessoa num cliente arbitrário — risco de ver dados de outro cliente.
    # Hoje não ocorre (0 casos), mas o cadastro é livre e isto tem de ser explícito.
    if r.data and len({str(x["tenant_id"]) for x in r.data}) > 1:
        return None
    if r.data:
        row = r.data[0]
        return {
            "comprador_id": str(row["id"]),
            "tenant_id": str(row["tenant_id"]),
            "nome": row.get("nome_comprador"),
            "email": email,
        }
    return None
