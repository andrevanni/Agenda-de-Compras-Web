from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def _build_engine():
    """
    Constrói o engine SQLAlchemy sem passar pela URL string diretamente,
    evitando problemas de parsing com senhas que contêm caracteres especiais
    como [ e ] (ex: [Service1020]).
    """
    raw = settings.database_url
    try:
        # Separa o scheme (ex: postgresql+psycopg)
        scheme, rest = raw.split("://", 1)

        # Separa userinfo do restante usando o último @ (senha pode ter @)
        userinfo, hostpart = rest.rsplit("@", 1)

        # Separa user da senha usando o primeiro : (senha pode ter :)
        user, password = userinfo.split(":", 1)

        # Separa host:porta do path+query
        host_and_port, db_query = hostpart.split("/", 1)
        db = db_query.split("?")[0]
        query = db_query.split("?", 1)[1] if "?" in db_query else ""

        # Separa host e porta
        host, port_str = host_and_port.rsplit(":", 1)

        # Extrai parâmetros de conexão da query string
        connect_args: dict = {}
        for part in query.split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                if k == "prepare_threshold":
                    connect_args["prepare_threshold"] = int(v) if v.isdigit() else None

        url = URL.create(
            drivername=scheme,
            username=user,
            password=password,  # passado como string, sem encoding
            host=host,
            port=int(port_str),
            database=db,
        )
        return create_engine(url, future=True, pool_pre_ping=True, connect_args=connect_args)
    except Exception:
        # Fallback: tenta criar direto com a string original
        return create_engine(raw, future=True, pool_pre_ping=True)


engine = _build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


def get_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
