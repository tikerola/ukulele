import os
from contextlib import contextmanager

import psycopg2
from psycopg2.extras import RealDictCursor

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

_ENV_VAR_CANDIDATES = ["POSTGRES_URL", "DATABASE_URL", "POSTGRES_URL_NON_POOLING"]


def _connection_string() -> str:
    for name in _ENV_VAR_CANDIDATES:
        value = os.environ.get(name)
        if value:
            return value
    raise RuntimeError(
        f"No Postgres connection string found in env vars: {', '.join(_ENV_VAR_CANDIDATES)}"
    )


@contextmanager
def get_db():
    conn = psycopg2.connect(_connection_string(), cursor_factory=RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS songs (
                    video_id   TEXT PRIMARY KEY,
                    data       TEXT NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
        conn.commit()
