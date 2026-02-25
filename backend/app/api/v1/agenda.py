from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.schemas.agenda import (
    AgendaItem,
    AgendaSugestaoResponse,
    AgendaTratarRequest,
    AgendaTratarResponse,
)
from app.services.agenda_service import (
    listar_atrasadas,
    listar_proximas,
    sugerir_proxima_data_ocorrencia,
    tratar_ocorrencia,
)

router = APIRouter(prefix="/agenda", tags=["agenda"])


@router.get("/proximas", response_model=list[AgendaItem])
def api_listar_proximas(
    tenant_id: str = Query(...),
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    db: Session = Depends(get_db_session),
):
    if data_fim < data_inicio:
        raise HTTPException(status_code=400, detail="data_fim deve ser maior ou igual a data_inicio")
    return listar_proximas(db, tenant_id, data_inicio, data_fim)


@router.get("/atrasadas", response_model=list[AgendaItem])
def api_listar_atrasadas(
    tenant_id: str = Query(...),
    data_ref: date = Query(...),
    db: Session = Depends(get_db_session),
):
    return listar_atrasadas(db, tenant_id, data_ref)


@router.get("/{ocorrencia_id}/sugestao", response_model=AgendaSugestaoResponse)
def api_sugerir_proxima_data(
    ocorrencia_id: str,
    tenant_id: str = Query(...),
    db: Session = Depends(get_db_session),
):
    try:
        return sugerir_proxima_data_ocorrencia(db, tenant_id, ocorrencia_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{ocorrencia_id}/tratar", response_model=AgendaTratarResponse)
def api_tratar_ocorrencia(
    ocorrencia_id: str,
    payload: AgendaTratarRequest,
    db: Session = Depends(get_db_session),
):
    try:
        return tratar_ocorrencia(db, ocorrencia_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
