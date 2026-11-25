"""Small, testable rules: tanker punctuality, ward routing, the rainwater calculator, water-saving actions."""
from datetime import datetime, timedelta

ON_TIME_MIN = 30          # arrived within +-30 min of the scheduled time
MISSED_AFTER_H = 3        # no check-in 3 h after the scheduled time = missed
SLA_HOURS = 48            # a leak ticket older than this without resolution is escalated

RUNOFF = {"concrete_roof": 0.8, "tiled_roof": 0.75, "paved_ground": 0.6, "garden": 0.15}

# litres saved per action (conservative, rounded; shown to users as estimates)
SAVING_ACTIONS = {
    "fixed_tap_leak": 30,          # a slow-dripping tap fixed, per day
    "bucket_bath": 40,             # bucket instead of shower
    "ro_reject_reuse": 15,         # RO reject water reused for mopping/plants
    "car_bucket_wash": 100,        # bucket instead of hose
    "full_load_washing": 50,       # washing machine run only when full
    "garden_evening": 20,          # watering plants in the evening
}


def tanker_status(scheduled_at: datetime, arrived_at: datetime | None, cancelled: bool, now: datetime) -> str:
    """scheduled | on_time | late | missed | cancelled. Early arrivals count as on time."""
    if cancelled:
        return "cancelled"
    if arrived_at is None:
        return "missed" if now - scheduled_at > timedelta(hours=MISSED_AFTER_H) else "scheduled"
    return "on_time" if (arrived_at - scheduled_at).total_seconds() <= ON_TIME_MIN * 60 else "late"


def on_time_pct(statuses: list[str]) -> float | None:
    done = [s for s in statuses if s in ("on_time", "late", "missed")]
    return round(100 * sum(s == "on_time" for s in done) / len(done)) if done else None


def point_in_polygon(lon: float, lat: float, ring: list[list[float]]) -> bool:
    """Ray casting; ring is [[lon, lat], ...]."""
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > lat) != (y2 > lat):
            x = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lon < x:
                inside = not inside
    return inside


def sla_state(created_at: datetime, status: str, now: datetime) -> dict:
    age_h = (now - created_at).total_seconds() / 3600
    return {"age_hours": round(age_h, 1), "escalated": status != "resolved" and age_h > SLA_HOURS, "sla_hours": SLA_HOURS}


def rwh_yield(area_m2: float, rain_mm: float, runoff: float) -> dict:
    """Harvest (L/yr) = area (m2) x rainfall (mm) x runoff factor; 1 mm on 1 m2 = 1 litre."""
    litres = area_m2 * rain_mm * runoff
    return {"litres_per_year": round(litres), "tanker_loads": round(litres / 10_000, 1),
            "formula": {"area_m2": area_m2, "rain_mm": rain_mm, "runoff": runoff}}
