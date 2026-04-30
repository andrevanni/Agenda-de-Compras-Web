import json
import time
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

# Cache do JWT do portal-admin (evita autenticar a cada clique)
_portal_jwt_cache: dict = {"token": None, "expires_at": 0.0}


def _get_portal_jwt() -> str:
    """Retorna JWT do portal_admin_email, reautenticando apenas quando expirado."""
    now = time.time()
    if _portal_jwt_cache["token"] and now < _portal_jwt_cache["expires_at"]:
        return _portal_jwt_cache["token"]

    if not settings.portal_admin_password:
        raise HTTPException(status_code=503, detail="PORTAL_ADMIN_PASSWORD não configurado.")

    url = f"{settings.supabase_url}/auth/v1/token?grant_type=password"
    body = json.dumps({
        "email": settings.portal_admin_email,
        "password": settings.portal_admin_password,
    }).encode()
    req = urlreq.Request(url, data=body, headers={
        "Content-Type": "application/json",
        "apikey": settings.supabase_anon_key,
    }, method="POST")

    try:
        with urlreq.urlopen(req, timeout=15) as r:
            session = json.loads(r.read())
    except urlreq.error.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Falha ao autenticar admin: {e.read().decode()}")

    token = session.get("access_token")
    if not token:
        raise HTTPException(status_code=502, detail="Supabase não retornou access_token.")

    expires_in = session.get("expires_in", 3600)
    _portal_jwt_cache["token"] = token
    _portal_jwt_cache["expires_at"] = now + expires_in - 60  # margem de 1 min

    return token


@router.post("/abrir-portal/{tenant_id}")
def abrir_portal(tenant_id: UUID) -> dict:
    """Gera token JWT para o admin simular acesso ao portal do tenant."""
    token = _get_portal_jwt()
    return {
        "access_token": token,
        "tenant_id": str(tenant_id),
        "expires_in": max(0, int(_portal_jwt_cache["expires_at"] - time.time())),
    }
