from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.admin_auth import require_admin_token
from app.db.supabase_client import get_supabase

router = APIRouter(
    prefix="/admin/licencas",
    tags=["admin-licencas"],
    dependencies=[Depends(require_admin_token)],
)


class LicencaCreate(BaseModel):
    tenant_id: UUID
    plano: str = "basico"
    status: str = "ativo"
    inicio_vigencia: str  # YYYY-MM-DD
    fim_vigencia: str | None = None
    limite_compradores: int | None = None
    observacoes: str | None = None


class LicencaUpdate(BaseModel):
    plano: str | None = None
    status: str | None = None
    inicio_vigencia: str | None = None
    fim_vigencia: str | None = None
    limite_compradores: int | None = None
    observacoes: str | None = None


@router.get("")
def listar_licencas(tenant_id: UUID | None = None) -> list[dict]:
    query = get_supabase().table("tenant_licencas").select("*")
    if tenant_id:
        query = query.eq("tenant_id", str(tenant_id))
    result = query.order("inicio_vigencia", desc=True).execute()
    return result.data or []


@router.post("", status_code=201)
def criar_licenca(payload: LicencaCreate) -> dict:
    data = payload.model_dump()
    data["tenant_id"] = str(data["tenant_id"])
    if not data.get("fim_vigencia"):
        data.pop("fim_vigencia", None)
    result = get_supabase().table("tenant_licencas").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Falha ao criar licença.")
    return result.data[0]


@router.patch("/{licenca_id}")
def atualizar_licenca(licenca_id: UUID, payload: LicencaUpdate) -> dict:
    values = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not values:
        raise HTTPException(status_code=400, detail="Nenhum campo enviado.")
    values["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = get_supabase().table("tenant_licencas").update(values).eq("id", str(licenca_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Licença não encontrada.")
    return result.data[0]


@router.delete("/{licenca_id}", status_code=204)
def excluir_licenca(licenca_id: UUID) -> None:
    get_supabase().table("tenant_licencas").delete().eq("id", str(licenca_id)).execute()
