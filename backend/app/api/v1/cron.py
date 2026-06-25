from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db_session
from app.services.relatorio_service import (
    enviar_relatorios_tenant,
    enviar_relatorios_todos_tenants,
)

router = APIRouter(prefix="/cron", tags=["cron"])


def _verificar_auth(
    authorization: str = Header(default=""),
    x_cron_secret: str = Header(default=""),
) -> None:
    """
    Aceita dois formatos:
      - Vercel Cron Jobs: Authorization: Bearer {CRON_SECRET}
      - Chamadas manuais: X-Cron-Secret: {CRON_SECRET}
    """
    if not settings.cron_secret:
        raise HTTPException(status_code=503, detail="CRON_SECRET não configurado no servidor.")
    bearer = authorization.removeprefix("Bearer ").strip()
    if bearer != settings.cron_secret and x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="Token de cron inválido.")


def _executar(
    db: Session,
    tenant_id: Optional[str],
    data_ref: Optional[date],
    admin_only: bool = False,
    comprador_id: Optional[str] = None,
) -> dict:
    if tenant_id:
        return enviar_relatorios_tenant(
            db, tenant_id, data_ref, admin_only=admin_only, comprador_id=comprador_id
        )
    return enviar_relatorios_todos_tenants(db, data_ref)


@router.get("/relatorio-diario")
def cron_relatorio_diario_get(
    data_ref: Optional[date] = Query(default=None),
    tenant_id: Optional[str] = Query(default=None),
    _: None = Depends(_verificar_auth),
    db: Session = Depends(get_db_session),
) -> dict:
    """Chamado pelo Vercel Cron Job (GET). Horário: 00:00 UTC = 21:00 BRT."""
    return _executar(db, tenant_id, data_ref)


@router.post("/relatorio-diario")
def cron_relatorio_diario_post(
    data_ref: Optional[date] = Query(default=None),
    tenant_id: Optional[str] = Query(default=None),
    admin_only: bool = Query(default=False),
    comprador_id: Optional[str] = Query(default=None),
    _: None = Depends(_verificar_auth),
    db: Session = Depends(get_db_session),
) -> dict:
    """Chamado manualmente via POST com header X-Cron-Secret.
    admin_only=true envia apenas para admins inscritos, sem disparar e-mails aos compradores.
    comprador_id=<uuid> envia somente para aquele comprador (validação pontual), sem admins."""
    return _executar(db, tenant_id, data_ref, admin_only=admin_only, comprador_id=comprador_id)
