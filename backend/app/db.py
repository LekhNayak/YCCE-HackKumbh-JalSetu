"""Database engine and session. SQLite by default; set DATABASE_URL to a Postgres (e.g. Supabase) URL to switch."""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

# Postgres: few connections per instance, checked before use (Neon sleeps when idle), and no prepared statements, so the
# pooled (PgBouncer) connection string works.
_kwargs = {"connect_args": {"check_same_thread": False}} if settings.database_url.startswith("sqlite") else {
    "pool_pre_ping": True, "pool_size": 2, "max_overflow": 3, "pool_recycle": 300, "connect_args": {"prepare_threshold": None, "connect_timeout": 10}}
engine = create_engine(settings.database_url, **_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from . import models  # noqa: F401  (registers the tables)
    Base.metadata.create_all(engine)
