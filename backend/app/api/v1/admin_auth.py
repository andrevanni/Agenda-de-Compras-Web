import json
import urllib.request as urlreq
from urllib.error import HTTPError

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin, require_master_admin
from app.core.config import settings
from app.db.session import get_db_session
from app.db.supabase_client import get_supabase
from app.services.email_service import send_html

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])

ADMIN_PANEL_URL = "https://agenda-compras-admin.vercel.app"


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class ConvidarAdminRequest(BaseModel):
    email: str
    nome: str = ""


class ReportSubscriptionsRequest(BaseModel):
    tenant_ids: list[str]


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
    except HTTPError:
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


@router.get("/admins", dependencies=[Depends(require_admin)])
def listar_admins() -> list:
    """Lista todos os usuários com role=admin no app_metadata."""
    sb = get_supabase()
    try:
        resp = sb.auth.admin.list_users()
        users = resp if isinstance(resp, list) else getattr(resp, "users", [])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao listar usuários: {e}")

    admins = []
    for user in users:
        app_meta = getattr(user, "app_metadata", None) or {}
        if app_meta.get("role") == "admin":
            admins.append({
                "id": str(user.id),
                "email": user.email or "",
                "created_at": str(getattr(user, "created_at", "") or ""),
                "last_sign_in_at": str(getattr(user, "last_sign_in_at", "") or ""),
            })

    return admins


@router.patch("/admins/{user_id}/revogar", dependencies=[Depends(require_master_admin)])
def revogar_admin(user_id: str) -> dict:
    """Remove role=admin do app_metadata. Usuário continua existindo mas perde acesso ao painel."""
    sb = get_supabase()
    try:
        user_resp = sb.auth.admin.get_user_by_id(user_id)
        user = user_resp.user
    except Exception:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    if user.email == settings.portal_admin_email:
        raise HTTPException(status_code=403, detail="Não é possível revogar o administrador master.")

    try:
        current_meta = dict(getattr(user, "app_metadata", None) or {})
        current_meta.pop("role", None)
        sb.auth.admin.update_user_by_id(user_id, {"app_metadata": current_meta})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao revogar acesso: {e}")

    return {"ok": True, "email": user.email}


@router.delete("/admins/{user_id}", dependencies=[Depends(require_master_admin)])
def excluir_admin(user_id: str) -> dict:
    """Exclui o usuário do Supabase Auth permanentemente."""
    sb = get_supabase()
    try:
        user_resp = sb.auth.admin.get_user_by_id(user_id)
        user = user_resp.user
    except Exception:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    if user.email == settings.portal_admin_email:
        raise HTTPException(status_code=403, detail="Não é possível excluir o administrador master.")

    try:
        sb.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao excluir usuário: {e}")

    return {"ok": True, "email": user.email}


@router.post("/convidar", dependencies=[Depends(require_master_admin)])
def convidar_admin(payload: ConvidarAdminRequest) -> dict:
    """Convida um novo administrador com senha temporária (sem link mágico)."""
    import secrets
    import string

    sb = get_supabase()

    # Gera senha temporária legível
    chars = string.ascii_letters + string.digits
    senha_temp = "".join(secrets.choice(chars) for _ in range(10))

    # Cria ou atualiza o usuário no Supabase Auth
    user_id = None
    try:
        resp = sb.auth.admin.create_user({
            "email": payload.email,
            "password": senha_temp,
            "email_confirm": True,
            "app_metadata": {"role": "admin"},
        })
        auth_user = getattr(resp, "user", None)
        if auth_user:
            user_id = str(auth_user.id)
    except Exception:
        # Usuário já existe — atualiza senha e garante role
        try:
            users_resp = sb.auth.admin.list_users()
            users = users_resp if isinstance(users_resp, list) else getattr(users_resp, "users", [])
            existing = next((u for u in users if u.email == payload.email), None)
            if existing:
                user_id = str(existing.id)
                sb.auth.admin.update_user_by_id(user_id, {
                    "password": senha_temp,
                    "app_metadata": {"role": "admin"},
                })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro ao configurar usuário: {e}")

    if not user_id:
        raise HTTPException(status_code=500, detail="Não foi possível criar ou localizar o usuário.")

    nome_display = payload.nome or payload.email
    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Convite — Painel Admin</title></head>
<body style="margin:0;padding:20px;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;">

  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#2563eb 100%);border-radius:12px 12px 0 0;padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#93c5fd;">Agenda de Compras</p>
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">Você foi convidado como administrador!</h1>
    <p style="margin:0;font-size:14px;color:#bfdbfe;">Painel Administrativo — Service Farma</p>
  </div>

  <div style="background:#ffffff;padding:28px 32px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Olá, <strong>{nome_display}</strong>!</p>

    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
      Você foi convidado para acessar o <strong>Painel Administrativo</strong> da Agenda de Compras.
      Use as credenciais abaixo para entrar. Recomendamos trocar a senha após o primeiro acesso.
    </p>

    <div style="text-align:center;margin:0 0 28px;">
      <a href="{ADMIN_PANEL_URL}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:16px 36px;border-radius:10px;font-size:16px;font-weight:700;">
        🚀 Acessar o Painel Admin →
      </a>
    </div>

    <div style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:0 0 24px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Seus dados de acesso</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151;">📧 <strong>E-mail:</strong> {payload.email}</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151;">🔑 <strong>Senha temporária:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:14px;">{senha_temp}</code></p>
      <p style="margin:0;font-size:14px;color:#374151;">🌐 <strong>Painel:</strong> {ADMIN_PANEL_URL}</p>
    </div>

    <p style="margin:0 0 0;font-size:13px;color:#f59e0b;background:#fef3c7;padding:10px 14px;border-radius:8px;">
      ⚠️ Troque sua senha após o primeiro acesso.
    </p>

    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;">
      Em caso de dúvidas, entre em contato com o administrador master.<br>
      Não responda a este e-mail.
    </p>
  </div>

</div>
</body>
</html>"""

    try:
        send_html(
            to=[payload.email],
            subject="Convite — Painel Admin Agenda de Compras",
            html=html,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao enviar e-mail: {e}")

    return {"ok": True, "enviado_para": payload.email}


def _get_admin_email(user_id: str) -> str:
    sb = get_supabase()
    try:
        user_resp = sb.auth.admin.get_user_by_id(user_id)
        return user_resp.user.email
    except Exception:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")


@router.get("/admins/{user_id}/report-subscriptions", dependencies=[Depends(require_admin)])
def get_report_subscriptions(user_id: str, db: Session = Depends(get_db_session)) -> list:
    """Retorna os tenant_ids para os quais este admin recebe cópia do relatório diário."""
    email = _get_admin_email(user_id)
    rows = db.execute(
        text("SELECT tenant_id::text FROM admin_report_subscriptions WHERE admin_email = :email"),
        {"email": email},
    ).fetchall()
    return [r[0] for r in rows]


@router.put("/admins/{user_id}/report-subscriptions", dependencies=[Depends(require_admin)])
def set_report_subscriptions(
    user_id: str,
    payload: ReportSubscriptionsRequest,
    db: Session = Depends(get_db_session),
) -> dict:
    """Salva a lista de tenant_ids que este admin quer receber por e-mail."""
    email = _get_admin_email(user_id)
    db.execute(
        text("DELETE FROM admin_report_subscriptions WHERE admin_email = :email"),
        {"email": email},
    )
    for tid in payload.tenant_ids:
        db.execute(
            text(
                "INSERT INTO admin_report_subscriptions (admin_email, tenant_id)"
                " VALUES (:email, cast(:tid as uuid)) ON CONFLICT DO NOTHING"
            ),
            {"email": email, "tid": tid},
        )
    db.commit()
    return {"ok": True, "email": email, "tenant_ids": payload.tenant_ids}
