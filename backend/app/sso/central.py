"""Cliente HTTP servidor<->servidor para os endpoints SSO do Hub central.
Mesmo padrão do Contagem/QTQD: urllib da stdlib, sem estado."""
import json
import urllib.error
import urllib.request

from app.core.config import settings


def _cred() -> dict:
    return {"client_id": settings.sf_sso_client_id, "client_secret": settings.sf_sso_client_secret}


def _post(path: str, body: dict) -> dict | None:
    base = (settings.sf_central_url or "").rstrip("/")
    if not base or not settings.sf_sso_client_id or not settings.sf_sso_client_secret:
        return None
    req = urllib.request.Request(
        f"{base}{path}", data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except (urllib.error.URLError, ValueError):
        return None


def trocar_codigo(code: str) -> dict | None:
    """POST /sso/token -> {sub, nome, email} ou None."""
    d = _post("/sso/token", {"code": code, **_cred()})
    if not d or not d.get("email") or not d.get("sub"):
        return None
    return {"sub": d["sub"], "nome": d.get("nome"), "email": d["email"]}


def consultar_entitlement(sub: str) -> dict | None:
    """POST /sso/entitlements -> {autorizado, ate, motivo} ou None."""
    d = _post("/sso/entitlements", {"sub": sub, **_cred()})
    if not d or "autorizado" not in d:
        return None
    return d
