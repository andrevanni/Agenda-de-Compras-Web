from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.admin_auth import require_admin_token
from app.db.session import get_db_session
from app.schemas.admin_clientes import (
    ClienteAdminCreateRequest,
    ClienteAdminDetalhe,
    ClienteAdminResumo,
    ClienteAdminUpdateRequest,
)
from app.services.admin_clientes_service import (
    atualizar_cliente,
    criar_cliente,
    listar_clientes,
    obter_cliente,
)

router = APIRouter(
    prefix="/admin/clientes",
    tags=["admin-clientes"],
    dependencies=[Depends(require_admin_token)],
)


@router.get("", response_model=list[ClienteAdminResumo])
def api_listar_clientes(db: Session = Depends(get_db_session)):
    return listar_clientes(db)


@router.get("/{tenant_id}", response_model=ClienteAdminDetalhe)
def api_obter_cliente(tenant_id: str, db: Session = Depends(get_db_session)):
    try:
        return obter_cliente(db, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("", response_model=ClienteAdminDetalhe, status_code=status.HTTP_201_CREATED)
def api_criar_cliente(payload: ClienteAdminCreateRequest, db: Session = Depends(get_db_session)):
    try:
        return criar_cliente(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/{tenant_id}", response_model=ClienteAdminDetalhe)
def api_atualizar_cliente(
    tenant_id: str,
    payload: ClienteAdminUpdateRequest,
    db: Session = Depends(get_db_session),
):
    try:
        return atualizar_cliente(db, tenant_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
