"""Leak and wastage reports, routed to the ward's water utility."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user, require
from ..config import settings
from ..db import get_db
from ..models import LeakTicket, User, Ward, now
from ..services import alerts
from ..services.community import point_in_polygon, sla_state

router = APIRouter(prefix="/api", tags=["leaks"])

CATEGORIES = ("pipe_burst", "overflow", "open_tap", "illegal", "drain")
FLOW = {"open": "assigned", "assigned": "in_progress", "in_progress": "resolved"}
MAX_PHOTO = 6 * 1024 * 1024


def ticket_out(t: LeakTicket, at: datetime):
    return {"id": t.id, "category": t.category, "note": t.note, "lat": t.lat, "lon": t.lon, "status": t.status,
            "photo": f"/uploads/{t.photo}" if t.photo else None, "ward_id": t.ward_id, "society_id": t.society_id,
            "reporter_id": t.reporter_id, "created_at": t.created_at.isoformat(), "updated_at": t.updated_at.isoformat(),
            "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None, "history": t.history,
            "sla": sla_state(t.created_at, t.status, at), "is_demo": t.is_demo}


def find_ward(db: Session, lon: float, lat: float):
    for w in db.scalars(select(Ward)).all():
        if point_in_polygon(lon, lat, w.polygon):
            return w
    return None


@router.post("/leaks")
async def report(category: str = Form(...), lat: float = Form(...), lon: float = Form(...), note: str = Form(""),
                 photo: UploadFile | None = File(default=None), user: User = Depends(require("resident", "society_admin")),
                 db: Session = Depends(get_db)):
    if category not in CATEGORIES:
        raise HTTPException(422, f"category must be one of {CATEGORIES}")
    fname = None
    if photo is not None and photo.filename:
        if not (photo.content_type or "").startswith("image/"):
            raise HTTPException(422, "photo must be an image")
        data = await photo.read()
        if len(data) > MAX_PHOTO:
            raise HTTPException(413, "photo larger than 6 MB")
        ext = {"image/png": "png", "image/webp": "webp"}.get(photo.content_type, "jpg")
        fname = f"{uuid.uuid4().hex}.{ext}"
        settings.uploads_dir.mkdir(parents=True, exist_ok=True)
        (settings.uploads_dir / fname).write_bytes(data)
    ward = find_ward(db, lon, lat)
    at = now()
    t = LeakTicket(reporter_id=user.id, society_id=user.society_id, ward_id=ward.id if ward else None, lat=lat, lon=lon,
                   category=category, note=note[:500], photo=fname, created_at=at, updated_at=at,
                   history=[{"status": "open", "at": at.isoformat(), "by": user.id}])
    db.add(t)
    db.flush()
    if ward:
        alerts.emit(db, "leak_new", {"id": t.id, "ward": ward.name, "category": category}, ward_id=ward.id,
                    dedupe_key=f"leak_new:{t.id}")
    db.commit()
    return {**ticket_out(t, at), "routed_to": ward.utility if ward else None}


@router.get("/leaks")
def list_leaks(mine: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(LeakTicket).order_by(LeakTicket.created_at.desc())
    q = q.where(LeakTicket.reporter_id == user.id) if mine or user.role != "ward_officer" else q.where(LeakTicket.ward_id == user.ward_id)
    at = now()
    return [ticket_out(t, at) for t in db.scalars(q).all()]


class StatusIn(BaseModel):
    status: str


@router.patch("/leaks/{ticket_id}")
def update(ticket_id: int, body: StatusIn, user: User = Depends(require("ward_officer")), db: Session = Depends(get_db)):
    t = db.get(LeakTicket, ticket_id)
    if t is None or t.ward_id != user.ward_id:
        raise HTTPException(404, "ticket not found")
    if FLOW.get(t.status) != body.status:
        raise HTTPException(422, f"next status after {t.status} is {FLOW.get(t.status)}")
    at = now()
    t.status, t.updated_at = body.status, at
    if body.status == "resolved":
        t.resolved_at = at
    t.history = [*t.history, {"status": body.status, "at": at.isoformat(), "by": user.id}]
    reporter = db.get(User, t.reporter_id)
    alerts.emit(db, "leak_update", {"id": t.id, "category": t.category, "status": body.status},
                user_id=t.reporter_id, society_id=t.society_id, ward_id=t.ward_id, lang=reporter.lang if reporter else "en",
                dedupe_key=f"leak_update:{t.id}:{body.status}")
    db.commit()
    return ticket_out(t, at)


@router.get("/leaks/hotspots")
def hotspots(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Reports grouped on a ~200 m grid, so repeated problems in one place stand out."""
    cells: dict = {}
    for t in db.scalars(select(LeakTicket).where(LeakTicket.ward_id == user.ward_id)).all():
        key = (round(t.lat / 0.002) * 0.002, round(t.lon / 0.002) * 0.002)
        c = cells.setdefault(key, {"lat": round(key[0], 4), "lon": round(key[1], 4), "count": 0, "open": 0})
        c["count"] += 1
        c["open"] += t.status != "resolved"
    return sorted(cells.values(), key=lambda c: -c["count"])
