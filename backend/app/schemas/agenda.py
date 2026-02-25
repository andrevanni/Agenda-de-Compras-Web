from datetime import date
from pydantic import BaseModel, Field


class AgendaItem(BaseModel):
    id: str
    fornecedor_id: str
    codigo_fornecedor: str
    nome_fornecedor: str
    comprador: str
    data_prevista: date
    status: str
    dias_compra: str | None = None


class AgendaTratarRequest(BaseModel):
    tenant_id: str = Field(..., description="ID do tenant")
    comprador_id: str = Field(..., description="Comprador responsável")
    data_realizacao: date
    observacao: str | None = None
    proxima_data: date | None = None


class AgendaTratarResponse(BaseModel):
    ocorrencia_tratada_id: str
    fornecedor_id: str
    proxima_data: date
    nova_ocorrencia_id: str | None = None


class AgendaSugestaoResponse(BaseModel):
    proxima_data_sugerida: date
    dias_semana: list[str]
