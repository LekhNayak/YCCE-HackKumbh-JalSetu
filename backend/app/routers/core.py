"""Meta, demo personas, sign-in."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import clock
from ..auth import current_user, make_token
from ..config import settings
from ..db import get_db
from ..models import User
from ..services import realdata
from ..services.speech import gnani

router = APIRouter(prefix="/api", tags=["core"])


def user_out(u: User):
    return {"id": u.id, "name": u.name, "role": u.role, "lang": u.lang, "society_id": u.society_id,
            "society": u.society.name if u.society else None, "ward_id": u.ward_id, "blurb": u.blurb, "is_demo": u.is_demo}


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/meta")
def meta():
    try:
        data = realdata.load("manifest")
    except realdata.DataMissing:
        data = None
    return {"app": "JalSetu", "today": clock.today().isoformat(), "languages": list(settings.languages),
            "features": {"chat": "groq" if settings.groq_api_keys else "guide", "speech": gnani.enabled(),
                         "speech_languages": ["en", "mr", "hi"] if gnani.enabled() else [],
                         "whatsapp": "twilio" if settings.twilio_sid and settings.alert_test_to else "simulated"},
            "data": data}


@router.get("/personas")
def personas(db: Session = Depends(get_db)):
    users = db.scalars(select(User).where(User.persona.is_(True)).order_by(User.id)).all()
    return [user_out(u) for u in users]


class Login(BaseModel):
    user_id: int


@router.post("/login")
def login(body: Login, db: Session = Depends(get_db)):
    u = db.get(User, body.user_id)
    if u is None or not u.persona:
        raise HTTPException(404, "unknown persona")
    return {"token": make_token(u.id), "user": user_out(u)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)
