from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.supabase_client import get_supabase

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


class AdminLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def admin_login(payload: AdminLoginRequest) -> dict:
    """Login do administrador via Supabase Auth. Requer role='admin' no app_metadata."""
    sb = get_supabase()
    try:
        sign_resp = sb.auth.sign_in_with_password({
            "email": payload.email,
            "password": payload.password,
        })
    except Exception:
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    user = sign_resp.user
    role = (getattr(user, "app_metadata", None) or {}).get("role")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Você não tem permissão de administrador.")

    return {
        "access_token": sign_resp.session.access_token,
        "email": user.email,
    }
