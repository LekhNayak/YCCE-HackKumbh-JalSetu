"""Create an account, sign in, sign out. Error answers carry codes; the app shows them in the reader's language."""
import re
import unicodedata
from datetime import timedelta

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import (FAILURE_WINDOW, bearer, clear_failures, end_session, failures_left, hash_password, note_failure,
                    start_session, verify_password)
from ..config import settings
from ..db import get_db
from ..models import Account, Society, User, now
from .core import user_out

router = APIRouter(prefix="/api/auth", tags=["accounts"])

USERNAME_RE = re.compile(r"[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?", re.IGNORECASE | re.ASCII)
RESERVED = {"admin", "administrator", "jalsetu", "official", "officer", "support", "ward", "ward-officer", "secretary"}
COMMON = {"password", "password1", "password12", "password123", "passw0rd", "12345678", "123456789", "1234567890", "87654321",
          "123123123", "11223344", "qwertyui", "qwertyuiop", "qwerty123", "asdfghjk", "asdfghjkl", "1q2w3e4r", "1qaz2wsx",
          "abcd1234", "abc12345", "abcdefgh", "admin123", "welcome1", "welcome123", "iloveyou", "letmein1", "sunshine",
          "princess", "football", "cricket1", "india123", "india1234", "jalsetu1", "jalsetu123", "jalsetu2026"}
MIN_PASSWORD, MAX_PASSWORD = 8, 128
MAX_NEW_PER_HOUR = 100          # everyone together: a bot cannot fill the database


def clean(s: str) -> str:
    return unicodedata.normalize("NFKC", s).strip()


def username_problem(name: str) -> str | None:
    if not name:
        return "required"
    if len(name) < 3:
        return "username_short"
    if len(name) > 30 or not USERNAME_RE.fullmatch(name):
        return "username_chars"
    return "username_taken" if name.lower() in RESERVED else None


def normal_email(email: str) -> str | None:
    try:
        return validate_email(email, check_deliverability=False).normalized.lower()
    except (EmailNotValidError, ValueError):
        return None


def password_problem(password: str, username: str = "", email: str = "") -> str | None:
    p = password.lower()
    if not password:
        return "required"
    if len(password) < MIN_PASSWORD:
        return "password_short"
    if len(password) > MAX_PASSWORD:
        return "password_long"
    if p in {x.lower() for x in (username, email, email.split("@")[0]) if x}:
        return "password_same"
    return "password_common" if p in COMMON or len(set(p)) < 3 else None


def fields(problems: dict, status: int = 422):
    return HTTPException(status, {"code": "fields", "fields": problems})


def taken(db: Session, username: str, email: str) -> dict:
    out = {}
    for u, e in db.execute(select(Account.username, Account.email).where(or_(Account.username == username, Account.email == email))):
        out |= ({"username": "username_taken"} if u == username else {}) | ({"email": "email_taken"} if e == email else {})
    return out


class RegisterIn(BaseModel):
    username: str = Field(max_length=200)
    email: str = Field(max_length=400)
    password: str = Field(max_length=1000)
    society_id: int | None = None
    lang: str = Field(default="en", pattern="^(en|mr|hi)$")


class LoginIn(BaseModel):
    identifier: str = Field(max_length=400)
    password: str = Field(max_length=1000)


class DemoIn(BaseModel):
    user_id: int


def signed_in(db: Session, user: User, days: int = 30) -> dict:
    token = start_session(db, user, days)
    db.commit()
    return {"token": token, "user": user_out(user)}


@router.get("/options")
def options(db: Session = Depends(get_db)):
    """What the sign-in page needs: the societies a new account can join, and the demo accounts."""
    socs = db.execute(select(Society.id, Society.name).order_by(Society.name)).all()
    demo = db.scalars(select(User).where(User.persona.is_(True)).order_by(User.id)).all() if settings.demo_login else []
    return {"societies": [{"id": i, "name": n} for i, n in socs], "demo": [user_out(u) for u in demo]}


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    name, typed = clean(body.username), clean(body.email)
    username, email = name.lower(), normal_email(typed)
    soc = db.get(Society, body.society_id) if body.society_id else None
    problems = {"username": username_problem(name), "email": None if email else ("email_invalid" if typed else "required"),
                "password": password_problem(body.password, name, email or typed), "society_id": None if soc else "society_missing"}
    problems = {k: v for k, v in problems.items() if v}
    if email and "username" not in problems:
        problems |= taken(db, username, email)
    if problems:
        raise fields(problems, 409 if set(problems.values()) <= {"username_taken", "email_taken"} else 422)
    fresh = db.scalar(select(func.count()).select_from(Account).where(Account.created_at > now() - timedelta(hours=1)))
    if fresh >= MAX_NEW_PER_HOUR:
        raise HTTPException(429, {"code": "busy"})
    user = User(name=name, role="resident", society_id=soc.id, ward_id=soc.ward_id, lang=body.lang, persona=False, is_demo=False)
    db.add(user)
    try:
        db.flush()
        db.add(Account(user_id=user.id, username=username, email=email, password_hash=hash_password(body.password)))
        db.flush()
        return signed_in(db, user)
    except IntegrityError:                      # two people took the same name at the same moment
        db.rollback()
        raise fields(taken(db, username, email) or {"username": "username_taken"}, 409)


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    ident = clean(body.identifier).lower()
    blank = {k: "required" for k, v in (("identifier", ident), ("password", body.password)) if not v}
    if blank:
        raise fields(blank)
    if failures_left(db, ident) == 0:
        raise HTTPException(429, {"code": "too_many", "minutes": int(FAILURE_WINDOW.total_seconds() // 60)})
    acc = None
    if ident.isprintable() and len(ident) <= 254:
        acc = db.scalar(select(Account).where((Account.email if "@" in ident else Account.username) == ident))
    if not verify_password(body.password, acc.password_hash if acc else None):
        note_failure(db, ident)
        db.commit()
        raise HTTPException(401, {"code": "wrong"})
    clear_failures(db, ident)
    return signed_in(db, db.get(User, acc.user_id))


@router.post("/demo")
def demo(body: DemoIn, db: Session = Depends(get_db)):
    user = db.get(User, body.user_id) if settings.demo_login else None
    if user is None or not user.persona:
        raise HTTPException(404, {"code": "no_demo"})
    return signed_in(db, user, days=7)


@router.post("/logout", status_code=204)
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    token = bearer(authorization)
    if token:
        end_session(db, token)
        db.commit()
    return Response(status_code=204)
