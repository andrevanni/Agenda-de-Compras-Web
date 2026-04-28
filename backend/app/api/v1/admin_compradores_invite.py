"""
Endpoint para enviar convite de acesso a compradores cadastrados.
O comprador recebe um link do Supabase Auth → acessa /instalar → define senha → JWT.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.admin_auth import require_admin_token
from app.core.config import settings
from app.db.supabase_client import get_supabase
from app.services.email_service import send_html

router = APIRouter(
    prefix="/admin/compradores",
    tags=["admin-compradores-invite"],
    dependencies=[Depends(require_admin_token)],
)


@router.post("/{comprador_id}/enviar-convite")
def enviar_convite(comprador_id: UUID) -> dict:
    sb = get_supabase()

    c_res = sb.table("compradores").select("*").eq("id", str(comprador_id)).limit(1).execute()
    if not c_res.data:
        raise HTTPException(status_code=404, detail="Comprador não encontrado.")
    c = c_res.data[0]

    if not c.get("email"):
        raise HTTPException(status_code=400, detail="O comprador não tem e-mail cadastrado.")

    t_res = sb.table("tenants").select("nome").eq("id", str(c["tenant_id"])).limit(1).execute()
    tenant_nome = t_res.data[0]["nome"] if t_res.data else "Agenda de Compras"

    instalar_url = f"{settings.frontend_url}/instalar"
    setup_link = None
    last_error = None

    for link_type in ("recovery", "invite"):
        try:
            link_resp = sb.auth.admin.generate_link({
                "type": link_type,
                "email": c["email"],
                "redirect_to": instalar_url,
            })
            props = getattr(link_resp, "properties", None)
            action = getattr(props, "action_link", None) if props else None
            if action:
                setup_link = action
                auth_user = getattr(link_resp, "user", None)
                if auth_user and getattr(auth_user, "id", None):
                    auth_uid = str(auth_user.id)
                    sb.table("compradores").update({"user_id": auth_uid}).eq("id", str(comprador_id)).execute()
                    try:
                        sb.auth.admin.update_user_by_id(auth_uid, {
                            "app_metadata": {
                                "agenda_comprador_id": str(comprador_id),
                                "agenda_tenant_id": str(c["tenant_id"]),
                            }
                        })
                    except Exception:
                        pass
                break
        except Exception as e:
            last_error = str(e)
            continue

    if not setup_link:
        raise HTTPException(
            status_code=500,
            detail=f"Não foi possível gerar o link para {c['email']}. Erro: {last_error}",
        )

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Convite Agenda de Compras</title></head>
<body style="margin:0;padding:20px;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;">

  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#2563eb 100%);border-radius:12px 12px 0 0;padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#93c5fd;">Agenda de Compras</p>
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">Você foi convidado!</h1>
    <p style="margin:0;font-size:14px;color:#bfdbfe;">{tenant_nome}</p>
  </div>

  <div style="background:#ffffff;padding:28px 32px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Olá, <strong>{c['nome_comprador']}</strong>!</p>

    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
      Você foi cadastrado como comprador no sistema <strong>Agenda de Compras</strong>
      de <strong>{tenant_nome}</strong>. Clique no botão abaixo para criar sua senha e acessar o portal.
    </p>

    <div style="text-align:center;margin:0 0 28px;">
      <a href="{setup_link}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:16px 36px;border-radius:10px;font-size:16px;font-weight:700;">
        🔑 Criar minha senha →
      </a>
      <p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">Este link expira em 24 horas.</p>
    </div>

    <div style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:0 0 24px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Seus dados de acesso</p>
      <p style="margin:0;font-size:14px;color:#374151;">📧 <strong>E-mail:</strong> {c['email']}</p>
    </div>

    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;">
      Em caso de dúvidas, entre em contato com o administrador.<br>
      Não responda a este e-mail.
    </p>
  </div>

</div>
</body>
</html>"""

    try:
        send_html(to=[c["email"]], subject=f"Convite — Agenda de Compras {tenant_nome}", html=html)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao enviar e-mail: {e}")

    return {"ok": True, "enviado_para": c["email"]}


@router.post("/abrir-portal/{tenant_id}")
def abrir_portal(tenant_id: UUID) -> dict:
    """Gera token JWT para o admin simular acesso ao portal do tenant."""
    import json
    import urllib.request as urlreq

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
