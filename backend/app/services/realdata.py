"""Real data files built by scripts/build_data.py (wells, district series, forecast run, rain, priority map)."""
import json
import math
from datetime import date
from functools import lru_cache

from ..config import settings


class DataMissing(RuntimeError):
    pass


@lru_cache(maxsize=None)
def load(name: str) -> dict:
    path = settings.data_dir / f"{name}.json"
    if not path.exists():
        raise DataMissing(f"{path.name} not found; run: python scripts/build_data.py")
    return json.loads(path.read_text(encoding="utf-8"))


def clear_cache():
    load.cache_clear()


def km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km."""
    p = math.radians
    a = math.sin(p(lat2 - lat1) / 2) ** 2 + math.cos(p(lat1)) * math.cos(p(lat2)) * math.sin(p(lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def nearest_wells(lat, lon, n=5, live_since: str | None = None):
    """The n closest real wells (optionally only those reporting since a date), each with its distance."""
    wells = load("wells_nagpur")["wells"]
    if live_since:
        wells = [w for w in wells if w["last"] >= live_since]
    ranked = sorted(wells, key=lambda w: km(lat, lon, w["lat"], w["lon"]))[:n]
    return [{**w, "km": round(km(lat, lon, w["lat"], w["lon"]), 1)} for w in ranked]


def series(well) -> list[tuple[date, float]]:
    """A well's readings as (date, level m), weekly history followed by the recent daily values."""
    recent = [(date.fromisoformat(d), v) for d, v in well["daily_recent"] if v is not None]
    start = recent[0][0] if recent else date.max
    old = [(date.fromisoformat(d), v) for d, v in well["weekly"] if v is not None and date.fromisoformat(d) < start]
    return old + recent
