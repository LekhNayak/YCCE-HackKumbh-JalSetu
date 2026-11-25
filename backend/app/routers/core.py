"""Meta and the signed-in user."""
from fastapi import APIRouter, Depends

from .. import clock
from ..auth import current_user
from ..config import settings
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


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)
