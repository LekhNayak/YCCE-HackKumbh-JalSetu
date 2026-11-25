"""Unit tests for the decision rules."""
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.services import forecast, trust
from app.services.alerts import render
from app.services.community import on_time_pct, point_in_polygon, rwh_yield, sla_state, tanker_status

NOW = datetime(2026, 11, 25, 12, 0)


def test_tanker_status():
    s = NOW - timedelta(hours=1)
    assert tanker_status(s, s + timedelta(minutes=20), False, NOW) == "on_time"
    assert tanker_status(s, s - timedelta(minutes=40), False, NOW) == "on_time"        # early is fine
    assert tanker_status(s, s + timedelta(minutes=45), False, NOW) == "late"
    assert tanker_status(NOW - timedelta(hours=4), None, False, NOW) == "missed"
    assert tanker_status(NOW + timedelta(hours=1), None, False, NOW) == "scheduled"
    assert tanker_status(s, None, True, NOW) == "cancelled"
    assert on_time_pct(["on_time", "late", "missed", "on_time", "scheduled"]) == 50
    assert on_time_pct(["scheduled"]) is None


def test_point_in_polygon():
    ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    assert point_in_polygon(5, 5, ring)
    assert not point_in_polygon(15, 5, ring)


def test_rwh_yield_matches_deck_example():
    r = rwh_yield(500, 1000, 0.8)
    assert r["litres_per_year"] == 400_000 and r["tanker_loads"] == 40.0


def test_sla():
    assert sla_state(NOW - timedelta(hours=50), "open", NOW)["escalated"]
    assert not sla_state(NOW - timedelta(hours=50), "resolved", NOW)["escalated"]


def h(change, lo, hi):
    return {"change_m": change, "change_q10_m": lo, "change_q90_m": hi}


def test_direction():
    assert forecast.direction(h(-0.6, -1.0, -0.2)) == "falling"
    assert forecast.direction(h(0.6, 0.2, 1.0)) == "rising"
    assert forecast.direction(h(0.05, -0.3, 0.4)) == "steady"
    assert forecast.direction(h(-0.3, -0.9, 0.2)) == "uncertain"


def run(fall=-0.6, lo=-1.2, hi=-0.2, issue="2026-11-01"):
    level = -8.0
    hs = {k: {"target_date": (date.fromisoformat(issue) + timedelta(days=int(k[2:]))).isoformat(),
              "q10": level + lo, "q50": level + fall, "q90": level + hi,
              "change_m": fall, "change_q10_m": lo, "change_q90_m": hi} for k in ("t+7", "t+14", "t+30")}
    return {"district": "Nagpur", "engine": "x", "issue_date": issue, "data_version": "test", "level_now_m": level,
            "horizons": hs, "metrics": []}


def test_early_warnings():
    soc = SimpleNamespace(danger_depth_m=14.0)
    today = date(2026, 11, 10)
    kinds = {w["kind"] for w in forecast.early_warnings(soc, today, run(), latest_reading_depth=13.0)}
    assert kinds == {"forecast_falling", "danger_depth"}
    assert {w["kind"] for w in forecast.early_warnings(soc, today, run(), latest_reading_depth=8.0)} == {"forecast_falling"}
    assert forecast.early_warnings(soc, today, run(0.5, 0.2, 1.0), latest_reading_depth=8.0) == []
    # an expired forecast gives no advice
    assert forecast.early_warnings(soc, date(2027, 2, 1), run(), latest_reading_depth=13.0) == []


KATOL = (21.2745, 78.5832)


def test_trust_baseline_and_range():
    assert trust.check(10.0, date(2026, 10, 20), None, *KATOL)["status"] == "baseline"
    with pytest.raises(trust.ReadingInvalid):
        trust.check(400.0, date(2026, 10, 20), None, *KATOL)


def test_trust_flags_a_jump_but_accepts_normal_movement():
    prev = (date(2026, 10, 13), 11.0)
    normal = trust.check(11.15, date(2026, 10, 20), prev, *KATOL)
    jump = trust.check(15.5, date(2026, 10, 20), prev, *KATOL)
    assert normal["status"] == "accepted" and normal["detail"]["wells"]
    assert jump["status"] == "flagged" and "unlike_nearby_wells" in jump["reasons"]
    # only wells that were still reporting near the reading date are used
    assert all(w["window_end"] >= "2026-08-21" for w in normal["detail"]["wells"])


def test_trust_uses_forecast_range_when_current():
    prev = (date(2026, 11, 3), 11.0)
    out = trust.check(11.1, date(2026, 11, 10), prev, *KATOL, outlook=forecast.outlook(date(2026, 11, 10), run(0.5, 0.2, 1.0)))
    # forecast says rising (shallower), the reading got slightly deeper: inside the widened range
    assert "forecast_change_range_m" in out["detail"]


def test_alert_texts_in_three_languages():
    t = render("leak_update", {"id": 4, "category": "pipe_burst", "status": "resolved"})
    assert set(t) == {"en", "mr", "hi"}
    assert "#4" in t["mr"] and "दुरुस्त" in t["mr"] and "ठीक" in t["hi"]
    d = render("forecast_falling", {"society": "X", "fall_m": 0.6, "date": "2026-12-01"})
    assert "1 Dec" in d["en"] and "डिसेंबर" in d["mr"] and "दिसंबर" in d["hi"]
