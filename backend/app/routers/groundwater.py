"""Groundwater: real sensor wells, the district forecast, community borewell readings with the trust check, alerts."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import clock
from ..auth import can_see_society, current_user, require
from ..db import get_db
from ..models import BorewellReading, Society, TankerTrip, User, now
from ..services import alerts, forecast, realdata, trust
from ..services.community import tanker_status

router = APIRouter(prefix="/api", tags=["groundwater"])


@router.get("/groundwater/outlook")
def outlook():
    return forecast.outlook(clock.today())


@router.get("/groundwater/district")
def district():
    run = realdata.load("forecast_run")
    latest = realdata.load("district_nagpur")
    return {"outlook": forecast.outlook(clock.today(), run),
            "observed": run["observed"],                 # the series the forecast was made from (same data version)
            "latest_district": {k: latest[k] for k in ("data_version", "last_date", "level_m", "daily_recent")}}


@router.get("/groundwater/backtest")
def backtest(horizon: str = "t+30", step: int = 7):
    run = realdata.load("forecast_run")
    if horizon not in run["backtest"]:
        raise HTTPException(404, "unknown horizon")
    b = run["backtest"][horizon]
    return {"horizon": horizon, "cols": b["cols"], "rows": b["rows"][::max(1, step)],
            "metrics": [m for m in run["metrics"] if m["horizon"] == horizon], "engine": run["engine"]}


@router.get("/groundwater/wells")
def wells(society_id: int, n: int = 6, user: User = Depends(current_user), db: Session = Depends(get_db)):
    soc = can_see_society(user, society_id, db)
    data = realdata.load("wells_nagpur")
    since = (date.fromisoformat(data["last_date"]) - timedelta(days=365)).isoformat()
    out = []
    for w in realdata.nearest_wells(soc.lat, soc.lon, n=min(max(n, 1), 12)):
        out.append({k: w[k] for k in ("code", "agency", "name", "village", "lat", "lon", "km", "first", "last", "latest_m")}
                   | {"weekly": [p for p in w["weekly"] if p[0] >= since], "daily_recent": w["daily_recent"]})
    return {"society": {"id": soc.id, "name": soc.name, "lat": soc.lat, "lon": soc.lon}, "wells": out,
            "last_date": data["last_date"], "source": data["source"], "units": data["units"]}


def reading_out(r: BorewellReading):
    return {"id": r.id, "day": r.day.isoformat(), "depth_m": r.depth_m, "status": r.status, "z": r.z,
            "reasons": r.reasons, "detail": r.detail, "user_id": r.user_id, "is_demo": r.is_demo}


@router.get("/societies/{society_id}/borewell")
def readings(society_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    soc = can_see_society(user, society_id, db)
    rows = db.scalars(select(BorewellReading).where(BorewellReading.society_id == society_id)
                      .order_by(BorewellReading.day)).all()
    return {"danger_depth_m": soc.danger_depth_m, "readings": [reading_out(r) for r in rows]}


class ReadingIn(BaseModel):
    depth_m: float = Field(gt=0, le=trust.MAX_DEPTH_M)
    day: date | None = None


@router.post("/borewell-readings")
def add_reading(body: ReadingIn, user: User = Depends(require("resident", "society_admin")), db: Session = Depends(get_db)):
    soc = db.get(Society, user.society_id)
    day = body.day or clock.today()
    if day > clock.today():
        raise HTTPException(422, "a reading cannot be in the future")
    if db.scalar(select(BorewellReading).where(BorewellReading.society_id == soc.id, BorewellReading.day == day)):
        raise HTTPException(409, "this borewell already has a reading for that day")
    prev = db.scalars(select(BorewellReading).where(BorewellReading.society_id == soc.id, BorewellReading.day < day)
                      .order_by(BorewellReading.day.desc())).first()
    try:
        verdict = trust.check(body.depth_m, day, (prev.day, prev.depth_m) if prev else None, soc.lat, soc.lon,
                              forecast.outlook(clock.today()))
    except trust.ReadingInvalid as e:
        raise HTTPException(422, str(e))
    r = BorewellReading(society_id=soc.id, user_id=user.id, day=day, depth_m=round(body.depth_m, 2), **verdict)
    db.add(r)
    db.flush()
    if r.status == "flagged":
        alerts.emit(db, "reading_flagged", {"society": soc.name, "depth_m": r.depth_m}, society_id=soc.id,
                    ward_id=soc.ward_id, dedupe_key=f"reading_flagged:{r.id}")
    run_society_checks(db, soc)
    db.commit()
    return reading_out(r)


def run_society_checks(db: Session, soc: Society) -> list:
    """Forecast early warnings + late tankers for one society. Each alert is sent once (dedupe key)."""
    made = []
    latest = db.scalars(select(BorewellReading).where(BorewellReading.society_id == soc.id)
                        .order_by(BorewellReading.day.desc())).first()
    out = forecast.outlook(clock.today())
    for w in forecast.early_warnings(soc, clock.today(), latest_reading_depth=latest.depth_m if latest else None):
        a = alerts.emit(db, w["kind"], {"society": soc.name, **w["params"]}, society_id=soc.id, ward_id=soc.ward_id,
                        dedupe_key=f"{w['kind']}:{soc.id}:{out['issue_date']}")
        if a:
            made.append(a.id)
    at = now()
    for t in db.scalars(select(TankerTrip).where(TankerTrip.society_id == soc.id, TankerTrip.arrived_at.is_(None),
                                                TankerTrip.scheduled_at >= at - timedelta(days=1))).all():
        if tanker_status(t.scheduled_at, None, t.cancelled, at) == "scheduled" and at > t.scheduled_at + timedelta(minutes=30):
            a = alerts.emit(db, "tanker_late", {"society": soc.name, "time": t.scheduled_at.strftime("%H:%M")},
                            society_id=soc.id, ward_id=soc.ward_id, dedupe_key=f"tanker_late:{t.id}")
            if a:
                made.append(a.id)
    return made


@router.post("/alerts/run-checks")
def run_checks(user: User = Depends(require("society_admin", "ward_officer")), db: Session = Depends(get_db)):
    q = select(Society).where(Society.ward_id == user.ward_id) if user.role == "ward_officer" else \
        select(Society).where(Society.id == user.society_id)
    made = []
    for soc in db.scalars(q).all():
        made += run_society_checks(db, soc)
    db.commit()
    return {"created": made, "forecast_stale": forecast.outlook(clock.today())["stale"]}
