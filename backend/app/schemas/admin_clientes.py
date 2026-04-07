from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class ClienteAdminResumo(BaseModel):
    id: str
    nome: str
    slug: str
    status: str
    plano: str
    contato_nome: str | None = None
    contato_email: EmailStr | None = None
    created_at: datetime
    updated_at: datetime
    total_compradores: int
    total_fornecedores: int
    total_pendencias: int


class ClienteAdminCreateRequest(BaseModel):
    nome: str = Field(..., min_length=2, max_length=120)
    slug: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    plano: str = Field(default="basico", min_length=2, max_length=30)
    status: str = Field(default="ativo", pattern=r"^(ativo|implantacao|bloqueado|inativo)$")
    contato_nome: str | None = Field(default=None, max_length=120)
    contato_email: EmailStr | None = None
    observacoes: str | None = Field(default=None, max_length=1000)


class ClienteAdminUpdateRequest(BaseModel):
    nome: str | None = Field(default=None, min_length=2, max_length=120)
    slug: str | None = Field(default=None, min_length=2, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    plano: str | None = Field(default=None, min_length=2, max_length=30)
    status: str | None = Field(default=None, pattern=r"^(ativo|implantacao|bloqueado|inativo)$")
    contato_nome: str | None = Field(default=None, max_length=120)
    contato_email: EmailStr | None = None
    observacoes: str | None = Field(default=None, max_length=1000)


class ClienteAdminDetalhe(ClienteAdminResumo):
    observacoes: str | None = None
