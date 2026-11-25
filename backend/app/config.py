"""Settings from environment variables (backend/.env is read if present; empty values count as unset)."""
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND / ".env")


def env(name, default=None):
    v = os.getenv(name)
    return v if v not in (None, "") else default


def _groq_keys():
    keys = [env("GROQ_API_KEY")] + [env(f"GROQ_API_KEY_{i}") for i in range(2, 10)]
    return tuple(k for k in keys if k)


@dataclass(frozen=True)
class Settings:
    data_dir: Path = Path(env("JALSETU_DATA_DIR", BACKEND / "data"))
    database_url: str = env("DATABASE_URL", f"sqlite:///{(BACKEND / 'jalsetu.db').as_posix()}")
    secret_key: str = env("JALSETU_SECRET", "dev-only-change-me")
    uploads_dir: Path = Path(env("UPLOADS_DIR", BACKEND / "uploads"))
    frontend_dist: Path = BACKEND.parent / "frontend" / "dist"
    serve_frontend: bool = env("SERVE_FRONTEND", "0") == "1"
    cors_origins: tuple = ("http://localhost:5180", "http://127.0.0.1:5180")
    languages: tuple = ("en", "mr", "hi")

    # site-guide chat (Groq, OpenAI-compatible); without keys the offline FAQ guide answers
    groq_api_keys: tuple = field(default_factory=_groq_keys)
    groq_model: str = env("GROQ_MODEL", "qwen/qwen3.8-27b")
    groq_url: str = "https://api.groq.com/openai/v1/chat/completions"

    # read-aloud (Gnani Vachana); without a key the browser's own voice is used
    gnani_api_key: str | None = env("GNANI_API_KEY")
    gnani_tts_url: str = env("GNANI_TTS_URL", "https://api.vachana.ai/api/v1/tts/inference")
    gnani_tts_model: str = env("GNANI_TTS_MODEL", "timbre-v2.5")
    gnani_tts_voice: str = env("GNANI_TTS_VOICE", "Nalini")
    gnani_tts_voices: dict = field(default_factory=lambda: {l: env(f"GNANI_TTS_VOICE_{l.upper()}") for l in ("en", "mr", "hi")})
    gnani_tts_sample_rate: int = int(env("GNANI_TTS_SAMPLE_RATE", "16000"))
    tts_cache_dir: Path = Path(env("TTS_CACHE_DIR", BACKEND / ".cache" / "tts"))

    # WhatsApp alerts (Twilio). Without these, alerts are kept in the outbox as "simulated".
    twilio_sid: str | None = env("TWILIO_ACCOUNT_SID")
    twilio_token: str | None = env("TWILIO_AUTH_TOKEN")
    twilio_whatsapp_from: str | None = env("TWILIO_WHATSAPP_FROM")     # e.g. whatsapp:+14155238886 (sandbox)
    alert_test_to: str | None = env("ALERT_TEST_TO")                   # e.g. whatsapp:+91XXXXXXXXXX (joined sandbox)

    # Open-Meteo for the rainwater calculator (free, no key); CHIRPS district mean is the offline fallback
    open_meteo_url: str = "https://archive-api.open-meteo.com/v1/archive"
    offline: bool = env("JALSETU_OFFLINE", "0") == "1"


settings = Settings()
