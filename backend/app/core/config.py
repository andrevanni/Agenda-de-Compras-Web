from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Agenda de Compras Web API"
    app_env: str = "dev"
    database_url: str
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    admin_api_token: str | None = None

    # SMTP — e-mail da Service Farma
    smtp_host:      str = "mail.servicefarma.far.br"
    smtp_port:      int = 465
    smtp_user:      str = "comercial@servicefarma.far.br"
    smtp_password:  str = ""
    smtp_from_name: str = "Agenda de Compras – Service Farma"

    # Credenciais do admin do portal (para simulação via abrir-portal)
    portal_admin_email:    str = ""
    portal_admin_password: str = ""

    # URL do frontend (para links nos e-mails)
    frontend_url: str = "https://agenda-compras-web.vercel.app"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
