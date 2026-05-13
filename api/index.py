"""Vercel serverless entry point for the Personal Finance Dashboard API."""
import sys
import traceback
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


def _load_app() -> FastAPI:
    try:
        from srv.main import app as real_app
        return real_app
    except Exception as exc:  # pragma: no cover — debug fallback
        err_text = f"{type(exc).__name__}: {exc}\n\n{traceback.format_exc()}"
        print(f"BOOT ERROR:\n{err_text}", file=sys.stderr, flush=True)

        fallback = FastAPI()

        @fallback.get("/{full_path:path}")
        async def boot_error(full_path: str):  # noqa: ARG001
            return PlainTextResponse(err_text, status_code=500)

        return fallback


app: FastAPI = _load_app()
