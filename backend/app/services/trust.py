"""Trust check for a community borewell reading.

Wells only a few hundred metres apart can sit metres apart in level, so a household reading is never compared with a
sensor's LEVEL. It is compared by CHANGE: how much deeper/shallower the borewell got since the household's previous
reading, against how much the nearest real sensor wells moved over a window of the same length.

  z = (change of this borewell - median change of the 3 nearest wells) / typical spread of those wells' changes

|z| > 3 flags the reading for the society admin. If the forecast is current, the change must also fall inside the
forecast's 80% change range (widened by 0.5 m). The first reading of a borewell is its baseline.
"""
from bisect import bisect_left
from datetime import date, timedelta
from statistics import median, pstdev

from .realdata import nearest_wells, series

MAX_DEPTH_M = 150.0
Z_LIMIT = 3.0
SIGMA_FLOOR_M = 0.15
FORECAST_SLACK_M = 0.5
TOLERANCE_DAYS = 4
LIVE_WITHIN_DAYS = 60     # use wells whose latest reading is at most this many days before the household reading


class ReadingInvalid(ValueError):
    pass


def value_near(points, d: date, tol=TOLERANCE_DAYS):
    """Level at (or within tol days of) date d from a sorted [(date, level)] list, else None."""
    dates = [p[0] for p in points]
    i = bisect_left(dates, d)
    best = None
    for j in (i - 1, i):
        if 0 <= j < len(points) and abs((points[j][0] - d).days) <= tol:
            if best is None or abs((points[j][0] - d).days) < abs((best[0] - d).days):
                best = points[j]
    return None if best is None else best[1]


def well_change(points, end: date, days: int):
    """Depth change (m, positive = deeper) of a well over `days` ending near `end`; None if not covered."""
    a, b = value_near(points, end - timedelta(days=days)), value_near(points, end)
    return None if a is None or b is None else round(-(b - a), 3)


def change_spread(points, days: int):
    """Typical spread (std) of a well's depth changes over windows of `days`, from its whole record."""
    changes = []
    for d, _ in points[::3]:
        c = well_change(points, d, days)
        if c is not None:
            changes.append(c)
    return pstdev(changes) if len(changes) >= 8 else None


def check(depth_m: float, day: date, previous: tuple[date, float] | None, lat: float, lon: float,
          outlook: dict | None = None, n_wells: int = 3) -> dict:
    if not (0 < depth_m <= MAX_DEPTH_M):
        raise ReadingInvalid(f"depth must be between 0 and {MAX_DEPTH_M:.0f} m below ground")
    if previous is None:
        return {"status": "baseline", "z": None, "reasons": [], "detail": {"note": "first reading sets the baseline"}}
    prev_day, prev_depth = previous
    days = max(1, (day - prev_day).days)
    delta = round(depth_m - prev_depth, 3)

    # prefer wells still reporting near the reading date; a well that stopped months ago says little about this week
    wells = nearest_wells(lat, lon, n=8, live_since=(day - timedelta(days=LIVE_WITHIN_DAYS)).isoformat()) \
        or nearest_wells(lat, lon, n=8)
    used, spreads = [], []
    for w in wells:
        pts = series(w)
        if not pts:
            continue
        end = min(day, pts[-1][0])
        c = well_change(pts, end, days)
        if c is None:
            continue
        sp = change_spread(pts, days)
        used.append({"code": w["code"], "name": w["name"], "agency": w["agency"], "km": w["km"],
                     "change_m": c, "window_end": end.isoformat()})
        if sp is not None:
            spreads.append(sp)
        if len(used) == n_wells:
            break

    reasons, detail = [], {"window_days": days, "change_m": delta, "wells": used}
    z = None
    if used:
        expected = median(u["change_m"] for u in used)
        sigma = max(SIGMA_FLOOR_M, median(spreads) if spreads else SIGMA_FLOOR_M)
        z = round((delta - expected) / sigma, 2)
        detail.update({"expected_change_m": round(expected, 3), "sigma_m": round(sigma, 3)})
        if abs(z) > Z_LIMIT:
            reasons.append("unlike_nearby_wells")
    else:
        detail["note"] = "no nearby sensor well covers this window"

    if outlook and not outlook.get("stale"):
        issue = date.fromisoformat(outlook["issue_date"])
        h = next((outlook["horizons"][k] for k in ("t+7", "t+14", "t+30")
                  if k in outlook["horizons"] and days <= int(k[2:])), outlook["horizons"].get("t+30"))
        if h and day >= issue:
            lo = -h["change_q90_m"] - FORECAST_SLACK_M     # depth change: deeper is positive
            hi = -h["change_q10_m"] + FORECAST_SLACK_M
            detail["forecast_change_range_m"] = [round(lo, 2), round(hi, 2)]
            if not (lo <= delta <= hi):
                reasons.append("outside_forecast_range")
    return {"status": "flagged" if reasons else "accepted", "z": z, "reasons": reasons, "detail": detail}
