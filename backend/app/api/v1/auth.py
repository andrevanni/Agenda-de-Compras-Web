import traceback

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
        "refresh_token": resp.session.refresh_token,
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
        print("[definir-senha] get_user FALHOU — link de convite expirado/inválido")
        traceback.print_exc()
        raise HTTPException(
            status_code=401,
            detail="Link expirado ou inválido. Solicite um novo convite ao administrador.",
        )

    email = (user.email or "").lower().strip()

    if len(payload.nova_senha) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter ao menos 6 caracteres.")

    # Grava a senha E confirma o e-mail. Sem email_confirm o usuário fica com
    # email_confirmed_at=NULL e o sign_in abaixo pode ser rejeitado pelo Supabase
    # Auth — deixando o comprador preso (casos Raquel/Caio/Elias, mai/2026).
    try:
        sb.auth.admin.update_user_by_id(
            str(user.id), {"password": payload.nova_senha, "email_confirm": True}
        )
    except Exception as e:
        print(f"[definir-senha] update_user_by_id FALHOU — email={email} user_id={user.id}")
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Erro ao definir senha: {e}")

    # Vincula user_id ao comprador pelo e-mail (não fatal — só loga se falhar)
    try:
        sb.table("compradores").update({"user_id": str(user.id)}).eq(
            "email", email
        ).execute()
    except Exception:
        print(f"[definir-senha] AVISO: falha ao vincular user_id ao comprador — email={email}")
        traceback.print_exc()

    # Verificação pós-update: o sign_in PROVA que a senha foi realmente persistida.
    # Se falhar após um update "ok", é sinal de que a senha NÃO gravou — loga alto e
    # retorna erro HONESTO em vez de dizer "Senha definida" e deixar o usuário preso
    # achando que deu certo (causa-raiz dos casos de mai/2026).
    try:
        sign_resp = sb.auth.sign_in_with_password(
            {"email": user.email, "password": payload.nova_senha}
        )
    except Exception:
        print(
            f"[definir-senha] ALERTA: sign_in FALHOU após update — email={email} "
            f"user_id={user.id} — senha provavelmente NÃO foi persistida"
        )
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=(
                "Não foi possível confirmar sua senha. Tente novamente em alguns "
                "instantes ou solicite um novo convite ao administrador."
            ),
        )

    if not sign_resp.session:
        print(f"[definir-senha] ALERTA: sign_in sem session — email={email} user_id={user.id}")
        raise HTTPException(
            status_code=500,
            detail=(
                "Não foi possível confirmar sua senha. Tente novamente ou solicite "
                "um novo convite ao administrador."
            ),
        )

    comprador = _comprador_para_usuario(sb, user.email, str(user.id))
    print(
        f"[definir-senha] OK — senha definida e login confirmado — email={email} "
        f"tenant={comprador['tenant_id']}"
    )
    return {
        "access_token": sign_resp.session.access_token,
        "refresh_token": sign_resp.session.refresh_token,
        "tenant_id": str(comprador["tenant_id"]),
        "comprador_id": str(comprador["id"]),
        "nome": comprador.get("nome_comprador"),
    }
