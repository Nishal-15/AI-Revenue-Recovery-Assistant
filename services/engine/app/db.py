"""Database pool. Synchronous psycopg on purpose: request handlers run in FastAPI's thread pool,
and it works the same on Windows (where async psycopg cannot use the default event loop) and Linux."""

from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

Row = dict[str, Any]


def create_pool(conninfo: str, max_size: int) -> ConnectionPool[Connection[Row]]:
    return ConnectionPool(
        conninfo,
        min_size=1,
        max_size=max_size,
        kwargs={"row_factory": dict_row, "autocommit": True},
        open=False,
    )
