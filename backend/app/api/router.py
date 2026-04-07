from fastapi import APIRouter

from app.api.v1.admin_clientes import router as admin_clientes_router
from app.api.v1.agenda import router as agenda_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(admin_clientes_router)
api_router.include_router(agenda_router)
