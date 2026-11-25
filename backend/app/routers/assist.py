"""Read-aloud (text-to-speech) and the site-guide chat."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..services import chat as chat_service
from ..services.speech import gnani

router = APIRouter(prefix="/api", tags=["assist"])


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    lang: str = Field(default="en", pattern="^(en|mr|hi)$")


@router.post("/speech/tts")
def tts(body: TtsIn):
    if not gnani.enabled():
        raise HTTPException(501, "speech not configured")
    try:
        audio, mime = gnani.synthesize(body.text, body.lang)
    except gnani.GnaniError:
        raise HTTPException(502, "speech service failed")
    return Response(content=audio, media_type=mime, headers={"Cache-Control": "private, max-age=86400"})


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    lang: str = "en"
    role: str = "resident"
    page: str | None = None
    visible_context: dict | None = None
    history: list[dict] | None = None


@router.post("/chat")
def chat(body: ChatIn):
    if body.lang not in ("en", "mr", "hi"):
        body.lang = "en"
    return chat_service.chat(body)
