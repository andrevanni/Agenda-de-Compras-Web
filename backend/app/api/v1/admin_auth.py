import json
import urllib.request as urlreq
from urllib.error import HTTPError

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


class AdminLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def admin_login(payload: AdminLoginRequest) -> dict:
    """Login do administrador via Supabase Auth. Requer role='admin' no app_metadata."""
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(status_code=503, detail="Supabase não configurado.")

    url = f"{settings.supabase_url}/auth/v1/token?grant_type=password"
    body = json.dumps({"email": payload.email, "password": payload.password}).encode()
    req = urlreq.Request(url, data=body, headers={
        "Content-Type": "application/json",
        "apikey": settings.supabase_anon_key,
    }, method="POST")

    try:
        with urlreq.urlopen(req, timeout=15) as r:
            session = json.loads(r.read())
    except HTTPError as e:
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    except Exception:
        raise HTTPException(status_code=502, detail="Erro ao conectar ao Supabase.")

    role = (session.get("user") or {}).get("app_metadata", {}).get("role")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Você não tem permissão de administrador.")

    return {
        "access_token": session["access_token"],
        "email": session["user"]["email"],
    }
