"""Demo sign-in: pick a persona, get a signed token. Roles are enforced on the server.

A real deployment would swap this for phone OTP (e.g. Supabase Auth); the role checks stay the same.
"""
import hashlib
import hmac

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User

ROLES = ("resident", "society_admin", "ward_officer")


def make_token(user_id: int) -> str:
    sig = hmac.new(settings.secret_key.encode(), str(user_id).encode(), hashlib.sha256).hexdigest()[:32]
    return f"{user_id}.{sig}"


def read_token(token: str) -> int | None:
    try:
        uid, sig = token.split(".", 1)
    except ValueError:
        return None
    return int(uid) if uid.isdigit() and hmac.compare_digest(make_token(int(uid)), token) else None


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    token = (authorization or "").removeprefix("Bearer ").strip()
    uid = read_token(token)
    user = db.get(User, uid) if uid else None
    if user is None:
        raise HTTPException(401, "sign in first")
    return user


def require(*roles):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, f"needs role: {', '.join(roles)}")
        return user
    return dep


def can_see_society(user: User, society_id: int, db: Session):
    from .models import Society
    soc = db.get(Society, society_id)
    if soc is None:
        raise HTTPException(404, "society not found")
    if user.role == "ward_officer":
        if soc.ward_id != user.ward_id:
            raise HTTPException(403, "not your ward")
    elif user.society_id != society_id:
        raise HTTPException(403, "not your society")
    return soc
