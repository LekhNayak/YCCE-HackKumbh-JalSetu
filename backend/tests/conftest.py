"""Tests run on a throwaway SQLite file and never call Groq, Gnani, Twilio or Open-Meteo."""
import os
import tempfile
from dataclasses import replace

import pytest

_tmp = tempfile.mkdtemp(prefix="jalsetu-test-")
# TEST_DATABASE_URL=postgresql://... runs the same tests on Postgres. They DROP every table there: use a throwaway database.
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp}/test.db"
os.environ["JALSETU_OFFLINE"] = "1"
os.environ["UPLOADS_DIR"] = os.path.join(_tmp, "uploads")
os.environ["TTS_CACHE_DIR"] = os.path.join(_tmp, "tts")

from app.routers import core  # noqa: E402
from app.services import alerts, chat, rain  # noqa: E402
from app.services.speech import gnani  # noqa: E402


@pytest.fixture(autouse=True)
def no_external_services(monkeypatch):
    off = dict(groq_api_keys=(), gnani_api_key=None, twilio_sid=None, twilio_token=None, offline=True)
    for mod in (chat, gnani, alerts, rain, core):
        monkeypatch.setattr(mod, "settings", replace(mod.settings, **off))


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed import seed
    seed(reset=True)
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def tokens(client):
    out = {}
    for p in client.get("/api/personas").json():
        tok = client.post("/api/login", json={"user_id": p["id"]}).json()["token"]
        out[p["role"]] = {"Authorization": f"Bearer {tok}"}
    return out
