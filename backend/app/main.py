"""JalSetu API: community water portal (supply, tankers, groundwater + forecast, rainwater, leaks, community)."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .config import settings
from .db import SessionLocal, init_db
from .models import Ward
from .routers import assist, community, core, groundwater, leaks, rwh, society, ward
from .services.realdata import DataMissing


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        empty = db.scalar(select(Ward.id).limit(1)) is None
    if empty:                                   # first start: load the demo ward so the app is usable at once
        from .seed import seed
        seed()
    yield


app = FastAPI(title="JalSetu API", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"], allow_headers=["*"])
for r in (core, society, groundwater, rwh, leaks, community, ward, assist):
    app.include_router(r.router)


@app.exception_handler(DataMissing)
def data_missing(_: Request, exc: DataMissing):
    return JSONResponse({"detail": str(exc), "code": "data_not_built"}, status_code=503)


settings.uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")

if settings.serve_frontend and settings.frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=settings.frontend_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = settings.frontend_dist / path
        return FileResponse(f if path and f.is_file() else settings.frontend_dist / "index.html")
