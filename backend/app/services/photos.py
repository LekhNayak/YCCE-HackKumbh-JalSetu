"""Leak photos, kept in the database so they survive on hosts without a permanent disk (Vercel)."""
import re
import uuid

from sqlalchemy.orm import Session

from ..models import Photo

MAX_PHOTO = 4 * 1024 * 1024          # below Vercel's 4.5 MB request limit; the app shrinks photos before sending
NAME_RE = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webp)$")
MIME = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def kind(data: bytes) -> str | None:
    """The image type from its first bytes (the declared type and the file name are not trusted)."""
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def store(db: Session, data: bytes) -> str | None:
    """Add the photo to the session and return its name, or None if it is not a supported image."""
    ext = kind(data)
    if ext is None:
        return None
    name = f"{uuid.uuid4().hex}.{ext}"
    db.add(Photo(name=name, mime=MIME[ext], data=data))
    return name
