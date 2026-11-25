"""Sign-in: a username or email with a password, or a demo account. Roles are enforced on the server.

Passwords are kept only as scrypt hashes. A sign-in is a random token, and the database keeps only a keyed hash of it: so
signing out really ends it, and a copy of the database cannot be used to sign in.
"""
import hashlib
import hmac
import os
import secrets
import unicodedata
from datetime import timedelta

from fastapi import Depends, Header, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import AuthSession, SignInFailure, User, now

ROLES = ("resident", "society_admin", "ward_officer")
SESSION_DAYS = 30
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2 ** 14, 8, 5          # OWASP's scrypt setting for 16 MB of memory
MAX_FAILURES, FAILURE_WINDOW = 8, timedelta(minutes=15)


# ---- passwords
def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    text = unicodedata.normalize("NFKC", password).encode("utf-8", "surrogatepass")      # same letters, same password on every keyboard
    return hashlib.scrypt(text, salt=salt, n=n, r=r, p=p, maxmem=64 * 1024 * 1024, dklen=32)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${_scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P).hex()}"


_NOBODY = f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${'00' * 16}${'00' * 32}"


def verify_password(password: str, stored: str | None) -> bool:
    """With no stored hash the same work is done, so the time taken does not tell whether an account exists."""
    _, n, r, p, salt, want = (stored or _NOBODY).split("$")
    same = hmac.compare_digest(_scrypt(password, bytes.fromhex(salt), int(n), int(r), int(p)), bytes.fromhex(want))
    return same and stored is not None


# ---- sessions
def _keyed(text: str) -> str:
    return hmac.new(settings.secret_key.encode(), text.encode("utf-8", "surrogatepass"), hashlib.sha256).hexdigest()


def bearer(authorization: str | None) -> str:
    return (authorization or "").removeprefix("Bearer ").strip()


def start_session(db: Session, user: User, days: int = SESSION_DAYS) -> str:
    """Add a session (the caller commits) and return its token."""
    token, at = secrets.token_urlsafe(32), now()
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= at))
    db.add(AuthSession(token_hash=_keyed(token), user_id=user.id, created_at=at, expires_at=at + timedelta(days=days)))
    return token


def end_session(db: Session, token: str) -> None:
    db.execute(delete(AuthSession).where(AuthSession.token_hash == _keyed(token)))


def end_all_sessions(db: Session, user_id: int) -> None:
    db.execute(delete(AuthSession).where(AuthSession.user_id == user_id))


# ---- too many wrong passwords for one username or email
def failures_left(db: Session, identifier: str) -> int:
    n = db.scalar(select(func.count()).select_from(SignInFailure)
                  .where(SignInFailure.key == _keyed(identifier), SignInFailure.at > now() - FAILURE_WINDOW))
    return max(0, MAX_FAILURES - n)


def note_failure(db: Session, identifier: str) -> None:
    db.execute(delete(SignInFailure).where(SignInFailure.at <= now() - FAILURE_WINDOW))
    db.add(SignInFailure(key=_keyed(identifier), at=now()))


def clear_failures(db: Session, identifier: str) -> None:
    db.execute(delete(SignInFailure).where(SignInFailure.key == _keyed(identifier)))


# ---- who is asking
def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    token = bearer(authorization)
    user = db.scalar(select(User).join(AuthSession, AuthSession.user_id == User.id)
                     .where(AuthSession.token_hash == _keyed(token), AuthSession.expires_at > now())) if token else None
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
