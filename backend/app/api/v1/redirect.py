from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from app.core.config import settings

router = APIRouter(tags=["redirect"])


@router.get("/portal")
def redirect_portal():
    """Redireciona para o portal do cliente. URL configurável via FRONTEND_URL."""
    return RedirectResponse(url=settings.frontend_url, status_code=302)
