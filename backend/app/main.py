"""JalSetu API: community water portal (supply, tankers, groundwater + forecast, rainwater, leaks, community)."""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.exc import DataError
from sqlalchemy.orm import Session

from .config import settings
from .db import SessionLocal, get_db, init_db
from .models import Photo, Ward
from .routers import accounts, assist, community, core, groundwater, leaks, rwh, society, ward
from .services.photos import MIME, NAME_RE
from .services.realdata import DataMissing


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.production:                     # tables and demo data come from scripts/seed_remote.ps1
        yield
        return
    init_db()
    with SessionLocal() as db:
        empty = db.scalar(select(Ward.id).limit(1)) is None
    if empty:                                   # first start: load the demo ward so the app is usable at once
        from .seed import seed
        seed()
    yield


app = FastAPI(title="JalSetu API", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"], allow_headers=["*"])
for r in (core, accounts, society, groundwater, rwh, leaks, community, ward, assist):
    app.include_router(r.router)


@app.exception_handler(DataMissing)
def data_missing(_: Request, exc: DataMissing):
    return JSONResponse({"detail": str(exc), "code": "data_not_built"}, status_code=503)


@app.exception_handler(OverflowError)
@app.exception_handler(DataError)
def value_not_storable(_: Request, exc: Exception):
    """Values the database cannot hold, such as an id beyond 2 billion or (Postgres) a NUL character in a text."""
    return JSONResponse({"detail": "invalid value"}, status_code=422)


@app.middleware("http")
async def never_cache_answers(request: Request, call_next):
    """API answers depend on who is signed in: no CDN may keep them, and the app's offline copy is kept per user."""
    res = await call_next(request)
    if request.url.path.startswith("/api/"):
        res.headers.setdefault("Cache-Control", "private, no-store")
        res.headers.add_vary_header("Authorization")
    return res


@app.get("/uploads/{name}", include_in_schema=False)
def uploaded_photo(name: str, db: Session = Depends(get_db)):
    if not NAME_RE.match(name):
        raise HTTPException(404, "not found")
    headers = {"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"}
    p = db.get(Photo, name)
    if p is not None:
        return Response(content=p.data, media_type=p.mime, headers=headers)
    f = settings.uploads_dir / name             # photos saved on disk by an earlier local version
    if f.is_file():
        return FileResponse(f, media_type=MIME[name.rsplit(".", 1)[1]], headers=headers)
    raise HTTPException(404, "not found")


if settings.serve_frontend and settings.frontend_dist.exists():
    _dist = settings.frontend_dist.resolve()
    app.mount("/assets", StaticFiles(directory=settings.frontend_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (_dist / path).resolve()                # "..%2f" must not reach files outside the built site (e.g. .env)
        return FileResponse(f if path and f.is_relative_to(_dist) and f.is_file() else _dist / "index.html")
