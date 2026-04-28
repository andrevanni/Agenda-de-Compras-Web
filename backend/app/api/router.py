from fastapi import APIRouter

from app.api.v1.admin_clientes import router as admin_clientes_router
from app.api.v1.admin_compradores_invite import router as admin_compradores_invite_router
from app.api.v1.admin_licencas import router as admin_licencas_router
from app.api.v1.agenda import router as agenda_router
from app.api.v1.auth import router as auth_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(admin_clientes_router)
api_router.include_router(admin_compradores_invite_router)
api_router.include_router(admin_licencas_router)
api_router.include_router(agenda_router)
