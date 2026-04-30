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


def _verificar_cron_secret(x_cron_secret: str = Header(default="")) -> None:
    if not settings.cron_secret:
        raise HTTPException(status_code=503, detail="CRON_SECRET não configurado no servidor.")
    if x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="Token de cron inválido.")


@router.post("/relatorio-diario")
def cron_relatorio_diario(
    data_ref: Optional[date] = Query(default=None, description="Data de referência ISO (padrão: ontem)"),
    tenant_id: Optional[str] = Query(default=None, description="Rodar somente para este tenant UUID"),
    _: None = Depends(_verificar_cron_secret),
    db: Session = Depends(get_db_session),
) -> dict:
    """
    Envia relatórios diários de auditoria e agenda para compradores com notificações habilitadas.
    Protegido pelo header X-Cron-Secret. Configure o cron-job.org (ou similar) para chamar:
      POST https://agenda-de-compras-api.vercel.app/api/v1/cron/relatorio-diario
      Header: X-Cron-Secret: <valor de CRON_SECRET>
    Horário sugerido: 07:00 BRT (10:00 UTC).
    """
    if tenant_id:
        return enviar_relatorios_tenant(db, tenant_id, data_ref)
    return enviar_relatorios_todos_tenants(db, data_ref)
