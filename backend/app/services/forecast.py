"""District groundwater outlook from the forecasting engine (TFT + LightGBM ensemble) and the early-warning rules.

Levels are metres relative to ground (negative = below ground); depth = -level. The forecast is DISTRICT level, so the
society sees it labelled as a district outlook, with its issue date, next to its own borewell readings.
"""
from datetime import date

from .. import clock
from .realdata import load

FALL_M = 0.3          # a 30-day median fall of this much (with the whole 80% range below today) counts as "falling"
HORIZONS = ("t+7", "t+14", "t+30")


def direction(h):
    """'falling' | 'rising' | 'steady' | 'uncertain' from the median and the 80% range (same rule as the engine's UI)."""
    if not h:
        return None
    if h["change_q90_m"] is not None and h["change_q90_m"] < 0:
        return "falling"
    if h["change_q10_m"] is not None and h["change_q10_m"] > 0:
        return "rising"
    if h["change_m"] is not None and abs(h["change_m"]) < 0.1:
        return "steady"
    return "uncertain"


def outlook(today: date | None = None, run: dict | None = None) -> dict:
    run = run or load("forecast_run")
    today = today or clock.today()
    hs = {}
    for k in HORIZONS:
        h = run["horizons"].get(k)
        if not h:
            continue
        hs[k] = {**h, "depth_q10": round(-h["q90"], 2), "depth_q50": round(-h["q50"], 2), "depth_q90": round(-h["q10"], 2),
                 "direction": direction(h)}
    last_target = max((date.fromisoformat(h["target_date"]) for h in hs.values()), default=None)
    locked = [m for m in run.get("metrics", []) if m["test_set"].startswith("locked")]
    return {
        "district": run["district"], "engine": run["engine"], "issue_date": run["issue_date"],
        "data_version": run["data_version"], "level_now_m": run["level_now_m"], "depth_now_m": round(-run["level_now_m"], 2),
        "horizons": hs, "stale": bool(last_target and last_target < today),
        "accuracy": {m["horizon"]: {"error_vs_no_change": m["error_vs_no_change"], "mae_m": m["mae_m"],
                                    "coverage_pct": m["coverage_pct"]} for m in locked},
    }


def early_warnings(society, today: date | None = None, run: dict | None = None, latest_reading_depth: float | None = None):
    """Rules that turn the forecast into a society alert. Returns a list of {kind, level, params}.

    falling: the 30-day forecast is falling by >= FALL_M with the whole 80% range below today.
    danger:  the society's own borewell is within the forecast's expected fall of its danger depth.
    A forecast whose dates have passed raises nothing (no advice from an expired forecast).
    """
    o = outlook(today, run)
    if o["stale"]:
        return []
    h30 = o["horizons"].get("t+30")
    if not h30:
        return []
    out = []
    if h30["direction"] == "falling" and h30["change_m"] <= -FALL_M:
        out.append({"kind": "forecast_falling", "level": "warn",
                    "params": {"fall_m": round(-h30["change_m"], 1), "date": h30["target_date"]}})
    if latest_reading_depth is not None and h30["change_q10_m"] is not None:
        worst_fall = max(0.0, -h30["change_q10_m"])          # the deeper end of the 80% range
        if latest_reading_depth + worst_fall >= society.danger_depth_m:
            out.append({"kind": "danger_depth", "level": "warn",
                        "params": {"depth_m": round(latest_reading_depth, 1), "danger_m": society.danger_depth_m,
                                   "date": h30["target_date"]}})
    return out
