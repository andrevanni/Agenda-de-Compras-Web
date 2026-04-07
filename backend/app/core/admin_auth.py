from fastapi import Header, HTTPException, status

from app.core.config import settings


def require_admin_token(x_admin_token: str | None = Header(default=None)) -> None:
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
