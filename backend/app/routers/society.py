"""Supply logs, tankers and the society dashboard."""
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import clock
from ..auth import can_see_society, current_user, require
from ..db import get_db
from ..models import Alert, BorewellReading, RwhCheck, RwhUnit, SavingLog, Society, SupplyLog, TankerTrip, User, now
from ..services import alerts, forecast
from ..services.community import on_time_pct, tanker_status

router = APIRouter(prefix="/api", tags=["society"])


def society_out(s: Society):
    return {"id": s.id, "name": s.name, "ward_id": s.ward_id, "lat": s.lat, "lon": s.lon, "households": s.households,
            "roof_area_m2": s.roof_area_m2, "danger_depth_m": s.danger_depth_m, "is_demo": s.is_demo}


def trip_out(t: TankerTrip, at: datetime):
    return {"id": t.id, "society_id": t.society_id, "scheduled_at": t.scheduled_at.isoformat(), "capacity_l": t.capacity_l,
            "source": t.source, "arrived_at": t.arrived_at.isoformat() if t.arrived_at else None,
            "status": tanker_status(t.scheduled_at, t.arrived_at, t.cancelled, at), "is_demo": t.is_demo}


def alert_out(a: Alert):
    return {"id": a.id, "kind": a.kind, "level": a.level, "text": a.text, "channel": a.channel, "status": a.status,
            "society_id": a.society_id, "ward_id": a.ward_id, "created_at": a.created_at.isoformat(), "is_demo": a.is_demo}


def supply_days(db: Session, society_id: int, days: int, today: date):
    start = today - timedelta(days=days - 1)
    logs = db.scalars(select(SupplyLog).where(SupplyLog.society_id == society_id, SupplyLog.day >= start)).all()
    by_day = defaultdict(list)
    for log in logs:
        by_day[log.day].append(log)
    out = []
    for i in range(days):
        d = start + timedelta(days=i)
        ls = by_day.get(d, [])
        if not ls:
            out.append({"day": d.isoformat(), "state": "unknown", "hours": None, "n": 0, "demo": False})
            continue
        yes = sum(1 for x in ls if x.came)
        hrs = [x.hours for x in ls if x.came and x.hours]
        out.append({"day": d.isoformat(), "state": "came" if yes * 2 >= len(ls) else "none",
                    "hours": round(sum(hrs) / len(hrs), 1) if hrs else None, "n": len(ls),
                    "demo": all(x.is_demo for x in ls)})
    known = [x for x in out if x["state"] != "unknown"]
    pct = round(100 * sum(x["state"] == "came" for x in known) / len(known)) if known else None
    return out, pct


@router.get("/societies")
def societies(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Society).where(Society.ward_id == user.ward_id).order_by(Society.id)).all()
    return [society_out(s) for s in rows]


class SupplyIn(BaseModel):
    came: bool
    hours: float | None = Field(default=None, ge=0, le=24)
    pressure: str | None = Field(default=None, pattern="^(low|ok|good)$")
    day: date | None = None
    client_id: str | None = Field(default=None, max_length=64)


@router.post("/supply-logs")
def add_supply(body: SupplyIn, user: User = Depends(require("resident", "society_admin")), db: Session = Depends(get_db)):
    if body.client_id:
        dup = db.scalar(select(SupplyLog).where(SupplyLog.client_id == body.client_id))
        if dup:
            return {"id": dup.id, "duplicate": True}
    day = body.day or clock.today()
    if day > clock.today() or day < clock.today() - timedelta(days=7):
        raise HTTPException(422, "day must be within the last 7 days")
    same = db.scalar(select(SupplyLog).where(SupplyLog.user_id == user.id, SupplyLog.day == day))
    if same:                     # one entry per person per day: a second tap corrects the first
        same.came, same.hours, same.pressure = body.came, body.hours if body.came else None, body.pressure
        db.commit()
        return {"id": same.id, "updated": True}
    log = SupplyLog(society_id=user.society_id, user_id=user.id, day=day, came=body.came,
                    hours=body.hours if body.came else None, pressure=body.pressure, client_id=body.client_id)
    db.add(log)
    try:
        db.commit()
    except IntegrityError:       # the same offline entry arrived twice at once
        db.rollback()
        dup = db.scalar(select(SupplyLog).where(SupplyLog.client_id == body.client_id))
        return {"id": dup.id, "duplicate": True}
    return {"id": log.id, "created": True}


@router.get("/societies/{society_id}/supply")
def supply(society_id: int, days: int = 60, user: User = Depends(current_user), db: Session = Depends(get_db)):
    can_see_society(user, society_id, db)
    out, pct = supply_days(db, society_id, min(max(days, 7), 120), clock.today())
    return {"days": out, "water_days_pct": pct}


@router.get("/societies/{society_id}/tankers")
def tankers(society_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    can_see_society(user, society_id, db)
    at = now()
    trips = db.scalars(select(TankerTrip).where(TankerTrip.society_id == society_id,
                                                TankerTrip.scheduled_at >= at - timedelta(days=45))
                       .order_by(TankerTrip.scheduled_at)).all()
    out = [trip_out(t, at) for t in trips]
    done = [t for t in out if t["status"] in ("on_time", "late", "missed")]
    upcoming = [t for t in out if t["status"] == "scheduled"]
    return {"trips": out[::-1], "on_time_pct": on_time_pct([t["status"] for t in done]),
            "next": upcoming[0] if upcoming else None, "counts": {k: sum(t["status"] == k for t in done)
                                                                   for k in ("on_time", "late", "missed")}}


class TankerIn(BaseModel):
    scheduled_at: datetime
    capacity_l: int = Field(default=10000, ge=1000, le=30000)
    source: str = Field(default="municipal", pattern="^(municipal|private)$")


@router.post("/tankers")
def add_tanker(body: TankerIn, user: User = Depends(require("society_admin")), db: Session = Depends(get_db)):
    t = TankerTrip(society_id=user.society_id, scheduled_at=body.scheduled_at.replace(tzinfo=None, microsecond=0),
                   capacity_l=body.capacity_l, source=body.source)
    db.add(t)
    db.commit()
    return trip_out(t, now())


class ArrivedIn(BaseModel):
    at: datetime | None = None
    client_id: str | None = Field(default=None, max_length=64)


@router.post("/tankers/{trip_id}/arrived")
def tanker_arrived(trip_id: int, body: ArrivedIn | None = None, user: User = Depends(require("resident", "society_admin")),
                   db: Session = Depends(get_db)):
    t = db.get(TankerTrip, trip_id)
    if t is None or t.society_id != user.society_id:
        raise HTTPException(404, "tanker trip not found")
    if t.arrived_at is None:
        t.arrived_at = ((body.at if body and body.at else None) or now()).replace(tzinfo=None, microsecond=0)
        t.checked_in_by = user.id
        soc = db.get(Society, t.society_id)
        alerts.emit(db, "tanker_arrived", {"society": soc.name, "time": t.arrived_at.strftime("%H:%M")},
                    society_id=soc.id, ward_id=soc.ward_id, lang=user.lang, dedupe_key=f"tanker_arrived:{t.id}")
        db.commit()
    return trip_out(t, now())


@router.get("/societies/{society_id}/dashboard")
def dashboard(society_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    soc = can_see_society(user, society_id, db)
    today = clock.today()
    days, pct = supply_days(db, society_id, 30, today)
    mine_today = db.scalar(select(SupplyLog).where(SupplyLog.user_id == user.id, SupplyLog.day == today))
    tk = tankers(society_id, user, db)
    latest = db.scalars(select(BorewellReading).where(BorewellReading.society_id == society_id)
                        .order_by(BorewellReading.day.desc())).first()
    outlook = forecast.outlook(today)
    warnings = forecast.early_warnings(soc, today, latest_reading_depth=latest.depth_m if latest else None)
    alert_rows = db.scalars(select(Alert).where(Alert.society_id == society_id).order_by(Alert.created_at.desc()).limit(6)).all()
    checks = db.execute(select(func.count(RwhCheck.id), func.count(RwhCheck.done_at)).join(RwhUnit)
                        .where(RwhUnit.society_id == society_id)).one()
    saved = db.scalar(select(func.coalesce(func.sum(SavingLog.litres), 0)).where(
        SavingLog.society_id == society_id, SavingLog.day >= today - timedelta(days=29)))
    return {"society": society_out(soc), "today": today.isoformat(),
            "my_log_today": {"came": mine_today.came, "hours": mine_today.hours} if mine_today else None,
            "supply": {"last_30": days, "water_days_pct": pct},
            "tankers": {"next": tk["next"], "on_time_pct": tk["on_time_pct"], "counts": tk["counts"]},
            "borewell": {"latest": {"day": latest.day.isoformat(), "depth_m": latest.depth_m, "status": latest.status}
                         if latest else None, "danger_depth_m": soc.danger_depth_m},
            "outlook": outlook, "warnings": warnings,
            "alerts": [alert_out(a) for a in alert_rows],
            "rwh": {"checks_total": checks[0], "checks_done": checks[1]},
            "savings_30d_l": round(saved)}
