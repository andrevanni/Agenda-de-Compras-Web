"""Callback do SSO Service Farma para a Agenda de Compras.

Roteia por PAPEL (correção 2026-07-25, pedido do André — admin não pode cair no
portal de um cliente):
  • e-mail com `app_metadata.role == 'admin'` no Auth da Agenda → PAINEL ADMIN
    (domínio próprio; sessão em `agenda_admin_jwt`). Vigência não se aplica a
    staff do sistema.
  • senão → casa em `compradores` → PORTAL DO CLIENTE, com vigência bloqueante
    e refresh token (sessão dura o dia).

Sessão sempre NATIVA do GoTrue (generate_link magiclink + verify_otp em client
anon descartável) — o hospedado assina ES256; NUNCA mintar JWT próprio.
"""
import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Query
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.db.supabase_client import get_supabase, get_supabase_anon
from app.sso.central import consultar_entitlement, trocar_codigo
from app.sso.reconciliar import resolver_comprador

router = APIRouter(prefix="/sso", tags=["sso"])
log = logging.getLogger("sso")

ADMIN_PANEL_URL = "https://agenda-compras-admin.vercel.app"


def _portal_url() -> str:
    return (settings.frontend_url or "https://agenda-compras-cliente.vercel.app").rstrip("/")


def _erro(motivo: str) -> RedirectResponse:
    return RedirectResponse(f"{_portal_url()}/?sso_erro={motivo}", status_code=303)


@router.get("/callback")
def callback(code: str | None = Query(default=None)) -> RedirectResponse:
    if not code:
        return _erro("code")
    try:
        ident = trocar_codigo(code)
        if not ident:
            return _erro("troca")
        email = (ident["email"] or "").lower().strip()

        sb = get_supabase()
        # generate_link serve aos dois caminhos: devolve o user (com app_metadata,
        # que decide o papel) e o hashed_token da sessão.
        link = sb.auth.admin.generate_link({"type": "magiclink", "email": email})
        hashed = getattr(getattr(link, "properties", None), "hashed_token", None)
        auth_user = getattr(link, "user", None)
        if not hashed:
            return _erro("sessao")

        app_meta = getattr(auth_user, "app_metadata", None) or {}
        eh_admin = app_meta.get("role") == "admin"

        alvo = None
        if not eh_admin:
            alvo = resolver_comprador(sb, email)
            if not alvo:
                return _erro("sem_acesso")
            # Vigência BLOQUEANTE só para CLIENTE (staff do sistema não tem vigência).
            # Fail-open apenas quando o central está inacessível.
            ent = consultar_entitlement(ident["sub"])
            log.info("sso callback cliente email=%s tenant=%s ent=%s", email, alvo["tenant_id"], ent)
            if ent is not None and not ent.get("autorizado"):
                return _erro("vigencia")
        else:
            log.info("sso callback ADMIN email=%s", email)

        res = get_supabase_anon().auth.verify_otp({"token_hash": hashed, "type": "magiclink"})
        if not res.session:
            return _erro("sessao")

        if eh_admin:
            qs = urlencode({"jwt": res.session.access_token, "email": email})
            return RedirectResponse(f"{ADMIN_PANEL_URL}/?{qs}", status_code=303)

        qs = urlencode({
            "jwt": res.session.access_token,
            "refresh": res.session.refresh_token or "",
            "tenant_id": alvo["tenant_id"],
            "comprador_id": alvo["comprador_id"],
            "email": email,
        })
        return RedirectResponse(f"{_portal_url()}/?{qs}", status_code=303)
    except Exception:
        log.exception("sso/callback falhou")
        return _erro("interno")
