"""Yearly rainfall for a society's location: Open-Meteo archive (last 365 days), else the CHIRPS district mean."""
from datetime import date, timedelta

import httpx

from .. import clock
from ..config import settings
from .realdata import load

_cache: dict = {}


def yearly_rain(lat: float, lon: float, today: date | None = None) -> dict:
    today = today or clock.today()
    key = (round(lat, 2), round(lon, 2), today.isoformat())
    if key in _cache:
        return _cache[key]
    fallback = load("rain_nagpur")
    result = {"rain_mm": fallback["default_annual_mm"], "source": "chirps",
              "label": f"CHIRPS, {fallback['district']} district average 2023-25"}
    if not settings.offline:
        end = today - timedelta(days=6)          # the archive lags a few days
        start = end - timedelta(days=364)
        try:
            r = httpx.get(settings.open_meteo_url, timeout=8, params={
                "latitude": lat, "longitude": lon, "start_date": start.isoformat(), "end_date": end.isoformat(),
                "daily": "precipitation_sum", "timezone": "Asia/Kolkata"})
            r.raise_for_status()
            vals = [v for v in r.json()["daily"]["precipitation_sum"] if v is not None]
            if len(vals) > 300:
                result = {"rain_mm": round(sum(vals)), "source": "open_meteo",
                          "label": f"Open-Meteo, {start.isoformat()} to {end.isoformat()}"}
        except (httpx.HTTPError, KeyError, ValueError):
            pass
    _cache[key] = result
    return result
