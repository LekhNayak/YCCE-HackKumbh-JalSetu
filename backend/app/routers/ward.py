"""Ward officer view, alert outbox, district priority map."""
from collections import Counter


from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import clock
from ..auth import current_user, require
from ..db import get_db
from ..models import Alert, BorewellReading, LeakTicket, Society, User, Ward, now
from ..services import realdata
from ..services.community import sla_state
from .society import alert_out, supply_days, tankers

router = APIRouter(prefix="/api", tags=["ward"])


@router.get("/wards/mine/overview")
def overview(user: User = Depends(require("ward_officer")), db: Session = Depends(get_db)):
    ward = db.get(Ward, user.ward_id)
    at = now()
    socs = []
    for s in db.scalars(select(Society).where(Society.ward_id == ward.id).order_by(Society.id)).all():
        _, pct = supply_days(db, s.id, 30, clock.today())
        tk = tankers(s.id, user, db)
        latest = db.scalars(select(BorewellReading).where(BorewellReading.society_id == s.id)
                            .order_by(BorewellReading.day.desc())).first()
        flagged = db.scalar(select(BorewellReading.id).where(BorewellReading.society_id == s.id,
                                                             BorewellReading.status == "flagged").limit(1))
        socs.append({"id": s.id, "name": s.name, "households": s.households, "lat": s.lat, "lon": s.lon,
                     "water_days_pct": pct, "on_time_pct": tk["on_time_pct"], "tanker_counts": tk["counts"],
                     "borewell_m": latest.depth_m if latest else None, "danger_depth_m": s.danger_depth_m,
                     "has_flagged_reading": bool(flagged), "is_demo": s.is_demo})
    tickets = db.scalars(select(LeakTicket).where(LeakTicket.ward_id == ward.id)).all()
    by_status = Counter(t.status for t in tickets)
    escalated = sum(sla_state(t.created_at, t.status, at)["escalated"] for t in tickets)
    resolved = [t for t in tickets if t.resolved_at]
    median_h = None
    if resolved:
        hrs = sorted((t.resolved_at - t.created_at).total_seconds() / 3600 for t in resolved)
        median_h = round(hrs[len(hrs) // 2], 1)
    return {"ward": {"id": ward.id, "name": ward.name, "town": ward.town, "utility": ward.utility, "polygon": ward.polygon},
            "societies": socs, "tickets": {s: by_status.get(s, 0) for s in ("open", "assigned", "in_progress", "resolved")},
            "escalated": escalated, "median_hours_to_fix": median_h}


@router.get("/alerts")
def list_alerts(scope: str = "auto", limit: int = 30, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Alert).order_by(Alert.created_at.desc()).limit(min(max(limit, 1), 100))
    if user.role == "ward_officer" and scope != "mine":
        q = q.where(Alert.ward_id == user.ward_id)
    else:
        q = q.where((Alert.society_id == user.society_id) | (Alert.user_id == user.id))
    return [alert_out(a) for a in db.scalars(q).all()]


@router.get("/districts/priority")
def priority():
    return realdata.load("priority")


@router.get("/geo/districts")
def geo_districts():
    return realdata.load("geo_districts")
