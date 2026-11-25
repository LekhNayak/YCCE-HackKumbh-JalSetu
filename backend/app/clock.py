"""The app's clock is always Indian time, wherever the server runs (Vercel runs in UTC and does not allow TZ to be set).

Times are stored and returned without an offset, as Indian wall-clock time. India has no daylight saving, so a fixed
offset is exact.
"""
from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def now() -> datetime:
    return datetime.now(IST).replace(tzinfo=None, microsecond=0)


def today() -> date:
    return now().date()
