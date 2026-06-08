from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from srv.core.config import settings

# SQLAlchemy setup
_is_sqlite = settings.database_url.startswith("sqlite")

if _is_sqlite:
    connect_args = {"check_same_thread": False}
    engine_kwargs = {}
else:
    # Serverless (Vercel) + Neon: Neon suspends its compute when idle and drops
    # connections that SQLAlchemy still believes are alive. Without pre-ping the
    # next request gets a dead connection and hangs on TCP until timeout (the
    # ~60s "infinite spinner" on the first request after idle). pool_pre_ping
    # validates/replaces stale connections, pool_recycle drops them before Neon
    # does, and connect_timeout makes any reconnect fail fast instead of hanging.
    # NOTE: do NOT pass statement_timeout via connect_args "options" — Neon's
    # pooled endpoint (PgBouncer) rejects it as an "unsupported startup
    # parameter" and every connection fails. connect_timeout is fine.
    connect_args = {"connect_timeout": 10}
    engine_kwargs = {"pool_pre_ping": True, "pool_recycle": 300}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    echo=settings.debug,
    future=True,
    **engine_kwargs,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
