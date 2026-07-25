from supabase import Client, create_client

from app.core.config import settings


def get_supabase() -> Client:
    """Retorna sempre um cliente fresco — evita contaminação de sessão entre requests."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_supabase_anon():
    """Client com a chave ANON — usado no verify_otp do SSO (muta a sessão do
    client; nunca rodar no client service_role)."""
    from supabase import create_client
    from app.core.config import settings
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise RuntimeError("SUPABASE_URL e SUPABASE_ANON_KEY sao obrigatorios para o SSO.")
    return create_client(settings.supabase_url, settings.supabase_anon_key)
