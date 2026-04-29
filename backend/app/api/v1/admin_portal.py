import json
import urllib.request as urlreq
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.admin_auth import require_admin
from app.core.config import settings

router = APIRouter(
    prefix="/admin",
    tags=["admin-portal"],
    dependencies=[Depends(require_admin)],
)


@router.post("/abrir-portal/{tenant_id}")
def abrir_portal(tenant_id: UUID) -> dict:
    """Gera token JWT para o admin simular acesso ao portal do tenant."""
    if not settings.portal_admin_password:
        raise HTTPException(status_code=503, detail="PORTAL_ADMIN_PASSWORD não configurado.")

    url = f"{settings.supabase_url}/auth/v1/token?grant_type=password"
    body = json.dumps({
        "email": settings.portal_admin_email,
        "password": settings.portal_admin_password,
    }).encode()
    req = urlreq.Request(url, data=body, headers={
        "Content-Type": "application/json",
        "apikey": settings.supabase_service_role_key or "",
    }, method="POST")

    try:
        with urlreq.urlopen(req, timeout=15) as r:
            session = json.loads(r.read())
    except urlreq.error.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Falha ao autenticar admin: {e.read().decode()}")

    return {
        "access_token": session.get("access_token"),
        "tenant_id": str(tenant_id),
        "expires_in": session.get("expires_in", 3600),
    }
