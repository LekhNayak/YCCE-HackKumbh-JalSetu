"""Rainwater harvesting: maintenance checklist per unit + the yearly harvest calculator."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import clock
from ..auth import can_see_society, current_user, require
from ..db import get_db
from ..models import RwhCheck, RwhUnit, User, now
from ..services.community import RUNOFF, rwh_yield
from ..services.rain import yearly_rain

router = APIRouter(prefix="/api", tags=["rwh"])

CHECKLIST = ["clean_roof_gutters", "clear_downpipes", "first_flush", "filter_media", "desilt_pit",
             "check_overflow", "mosquito_mesh", "test_flow"]
CYCLE_DAYS = 180          # a tick counts for this maintenance cycle if done within the last ~6 months


def unit_out(u: RwhUnit, rain_mm: float):
    cutoff = now() - timedelta(days=CYCLE_DAYS)
    checks = [{"id": c.id, "item": c.item, "done": bool(c.done_at and c.done_at >= cutoff),
               "done_at": c.done_at.isoformat() if c.done_at else None} for c in u.checks]
    runoff = RUNOFF["concrete_roof"] if u.kind != "paved" else RUNOFF["paved_ground"]
    return {"id": u.id, "kind": u.kind, "label": u.label, "catchment_m2": u.catchment_m2, "checks": checks,
            "done": sum(c["done"] for c in checks), "total": len(checks), "is_demo": u.is_demo,
            "estimate": rwh_yield(u.catchment_m2, rain_mm, runoff)}


@router.get("/societies/{society_id}/rwh")
def rwh(society_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    soc = can_see_society(user, society_id, db)
    rain = yearly_rain(soc.lat, soc.lon, clock.today())
    units = db.scalars(select(RwhUnit).where(RwhUnit.society_id == society_id).order_by(RwhUnit.id)).all()
    return {"rain": rain, "runoff_factors": RUNOFF, "checklist": CHECKLIST, "units": [unit_out(u, rain["rain_mm"]) for u in units],
            "society_roof_m2": soc.roof_area_m2,
            "society_estimate": rwh_yield(soc.roof_area_m2, rain["rain_mm"], RUNOFF["concrete_roof"])}


class CheckIn(BaseModel):
    done: bool


@router.post("/rwh/checks/{check_id}")
def tick(check_id: int, body: CheckIn, user: User = Depends(require("resident", "society_admin")),
         db: Session = Depends(get_db)):
    c = db.get(RwhCheck, check_id)
    if c is None or c.unit.society_id != user.society_id:
        raise HTTPException(404, "checklist item not found")
    c.done_at, c.done_by = (now(), user.id) if body.done else (None, None)
    db.commit()
    return {"id": c.id, "done": body.done}


@router.get("/rwh/calc")
def calc(area_m2: float, rain_mm: float, runoff: float = 0.8):
    if not (0 < area_m2 <= 100_000 and 0 < rain_mm <= 5000 and 0 < runoff <= 1):
        raise HTTPException(422, "area 0-100000 m2, rain 0-5000 mm, runoff 0-1")
    return rwh_yield(area_m2, rain_mm, runoff)
