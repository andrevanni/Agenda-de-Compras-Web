from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.supabase_client import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class DefinirSenhaRequest(BaseModel):
    access_token: str
    nova_senha: str


def _comprador_para_usuario(sb, email: str, user_id: str | None = None) -> dict:
    """Busca o comprador por user_id (UUID do Supabase Auth) ou email. Retorna o registro ou lança 403."""

    # 1. Por user_id (mais confiável — nunca muda)
    if user_id:
        res = (
            sb.table("compradores")
            .select("id,tenant_id,nome_comprador,email")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]

    # 2. Por e-mail (fallback para primeiro acesso antes do user_id ser gravado)
    email_lower = email.lower().strip()
    res = (
        sb.table("compradores")
        .select("id,tenant_id,nome_comprador,email")
        .eq("email", email_lower)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]

    raise HTTPException(
        status_code=403,
        detail=f"Comprador '{email_lower}' não encontrado. Cadastre-o no painel de compradores.",
    )


@router.post("/login")
def login(payload: LoginRequest) -> dict:
    sb = get_supabase()
    try:
        resp = sb.auth.sign_in_with_password(
            {"email": payload.email, "password": payload.password}
        )
    except Exception:
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    if not resp.session:
        raise HTTPException(status_code=401, detail="Falha na autenticação.")

    comprador = _comprador_para_usuario(sb, resp.user.email, str(resp.user.id))
    return {
        "access_token": resp.session.access_token,
        "tenant_id": str(comprador["tenant_id"]),
        "comprador_id": str(comprador["id"]),
        "nome": comprador.get("nome_comprador"),
    }


@router.post("/definir-senha")
def definir_senha(payload: DefinirSenhaRequest) -> dict:
    sb = get_supabase()

    try:
        user_resp = sb.auth.get_user(payload.access_token)
        user = user_resp.user
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Link expirado ou inválido. Solicite um novo convite ao administrador.",
        )

    if len(payload.nova_senha) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter ao menos 6 caracteres.")

    try:
        sb.auth.admin.update_user_by_id(str(user.id), {"password": payload.nova_senha})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao definir senha: {e}")

    # Vincula user_id ao comprador pelo e-mail
    try:
        sb.table("compradores").update({"user_id": str(user.id)}).eq(
            "email", user.email.lower().strip()
        ).execute()
    except Exception:
        pass

    try:
        sign_resp = sb.auth.sign_in_with_password(
            {"email": user.email, "password": payload.nova_senha}
        )
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Senha definida. Acesse o portal com seu e-mail e senha.",
        )

    comprador = _comprador_para_usuario(sb, user.email, str(user.id))
    return {
        "access_token": sign_resp.session.access_token,
        "tenant_id": str(comprador["tenant_id"]),
        "comprador_id": str(comprador["id"]),
        "nome": comprador.get("nome_comprador"),
    }
