from fastapi import Header, HTTPException, status

from app.core.config import settings


def require_admin_token(x_admin_token: str | None = Header(default=None)) -> None:
    """Legado: valida X-Admin-Token fixo. Mantido para compatibilidade."""
    expected_token = settings.admin_api_token

    if not expected_token:
        if settings.app_env.lower() == "dev":
            return
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ADMIN_API_TOKEN nao configurado.",
        )

    if x_admin_token != expected_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token administrativo invalido.",
        )


def require_admin(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None),
) -> None:
    """Aceita JWT Supabase (novo) ou X-Admin-Token (legado). JWT tem precedência."""

    # JWT via Authorization: Bearer <token>
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        from app.db.supabase_client import get_supabase
        sb = get_supabase()
        try:
            user_resp = sb.auth.get_user(token)
            user = user_resp.user
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido ou expirado.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        role = (getattr(user, "app_metadata", None) or {}).get("role")
        if role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso restrito a administradores.",
            )
        return

    # Fallback: X-Admin-Token (backward compat)
    expected_token = settings.admin_api_token
    if expected_token and x_admin_token == expected_token:
        return

    # Dev sem token configurado
    if settings.app_env.lower() == "dev" and not expected_token:
        return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Autenticação necessária.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_admin_user(
    authorization: str | None = Header(default=None),
):
    """Variante de require_admin que devolve o user do Supabase (com .id e .email).
    Usar quando o endpoint precisa saber QUEM é o admin logado (ex.: trocar
    a própria senha). Só aceita JWT (não tem fallback de X-Admin-Token —
    o token legado não identifica usuário).
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token JWT obrigatório para esta operação.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1]
    from app.db.supabase_client import get_supabase
    sb = get_supabase()
    try:
        user_resp = sb.auth.get_user(token)
        user = user_resp.user
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    role = (getattr(user, "app_metadata", None) or {}).get("role")
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores.",
        )
    return user


def require_master_admin(
    authorization: str | None = Header(default=None),
) -> None:
    """Restringe ao admin master (portal_admin_email). Apenas ele pode gerenciar outros admins."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Autenticação necessária.")

    token = authorization.split(" ", 1)[1]
    from app.db.supabase_client import get_supabase
    sb = get_supabase()
    try:
        user_resp = sb.auth.get_user(token)
        user = user_resp.user
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido ou expirado.")

    role = (getattr(user, "app_metadata", None) or {}).get("role")
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores.")

    master_email = settings.portal_admin_email
    if not master_email or user.email != master_email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas o administrador master pode realizar esta ação.",
        )
