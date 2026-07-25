"""Callback do SSO Service Farma para a Agenda de Compras.

Recebe o code do Hub central, troca por identidade, casa e-mail -> comprador,
confere vigência (bloqueante; fail-open só em falha de rede) e cria uma SESSÃO
NATIVA do GoTrue (generate_link magiclink + verify_otp em client anon descartável
— hospedado assina ES256, NUNCA mintar JWT próprio).

O handoff pro portal (domínio separado) vai por URL com REFRESH TOKEN — o front
tem timer de renovação a cada 50 min, então a sessão dura o dia todo no
computador do comprador (requisito do André, 2026-07-25):
  {frontend_url}/?jwt=&refresh=&tenant_id=&comprador_id=&email=
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


def _erro(motivo: str) -> RedirectResponse:
    base = (settings.frontend_url or "https://agenda-compras-cliente.vercel.app").rstrip("/")
    return RedirectResponse(f"{base}/?sso_erro={motivo}", status_code=303)


@router.get("/callback")
def callback(code: str | None = Query(default=None)) -> RedirectResponse:
    if not code:
        return _erro("code")
    try:
        ident = trocar_codigo(code)
        if not ident:
            return _erro("troca")

        sb = get_supabase()
        alvo = resolver_comprador(sb, ident["email"])
        if not alvo:
            return _erro("sem_acesso")

        # Vigência BLOQUEANTE (fail-open só quando o central está inacessível).
        ent = consultar_entitlement(ident["sub"])
        log.info("sso callback email=%s tenant=%s ent=%s", ident["email"], alvo["tenant_id"], ent)
        if ent is not None and not ent.get("autorizado"):
            return _erro("vigencia")

        link = sb.auth.admin.generate_link({"type": "magiclink", "email": alvo["email"]})
        hashed = getattr(getattr(link, "properties", None), "hashed_token", None)
        if not hashed:
            return _erro("sessao")
        res = get_supabase_anon().auth.verify_otp({"token_hash": hashed, "type": "magiclink"})
        if not res.session:
            return _erro("sessao")

        base = (settings.frontend_url or "https://agenda-compras-cliente.vercel.app").rstrip("/")
        qs = urlencode({
            "jwt": res.session.access_token,
            "refresh": res.session.refresh_token or "",
            "tenant_id": alvo["tenant_id"],
            "comprador_id": alvo["comprador_id"],
            "email": alvo["email"],
        })
        return RedirectResponse(f"{base}/?{qs}", status_code=303)
    except Exception:
        log.exception("sso/callback falhou")
        return _erro("interno")
