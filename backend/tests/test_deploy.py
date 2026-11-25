"""Settings that matter once the app is public."""
import os
import subprocess
import sys
from dataclasses import replace
from datetime import datetime, timedelta, timezone

import pytest

from app import clock, config
from app.config import BACKEND


def test_clock_is_indian_time_whatever_the_server_zone():
    utc = datetime.now(timezone.utc).replace(tzinfo=None)
    assert abs((clock.now() - utc) - timedelta(hours=5, minutes=30)) < timedelta(seconds=3)
    assert clock.today() == clock.now().date()


@pytest.mark.parametrize("url", ["postgres://u:p@h/db?sslmode=require", "postgresql://u:p@h/db?sslmode=require"])
def test_postgres_urls_use_the_psycopg_driver(monkeypatch, url):
    monkeypatch.setenv("DATABASE_URL", url)
    assert config._database_url() == "postgresql+psycopg://u:p@h/db?sslmode=require"


def test_production_refuses_unsafe_settings():
    good = replace(config.settings, secret_key="x" * 32, database_url="postgresql+psycopg://u:p@h/db")
    config.check_production(good)
    for bad in (replace(good, secret_key=config.DEV_SECRET), replace(good, secret_key="short"), replace(good, database_url="sqlite:///a.db")):
        with pytest.raises(RuntimeError):
            config.check_production(bad)


def test_api_answers_are_kept_per_user(client, tokens):
    res = client.get("/api/me", headers=tokens["resident"])
    assert res.headers["cache-control"] == "private, no-store" and "Authorization" in res.headers["vary"]


def test_single_process_mode_serves_only_the_built_site(tmp_path):
    """SERVE_FRONTEND=1 in a fresh process: an encoded ../ must not reach files outside frontend/dist."""
    site = tmp_path / "frontend" / "dist"
    (site / "assets").mkdir(parents=True)
    (site / "index.html").write_text("INDEX")
    (tmp_path / "secret.txt").write_text("SECRET")
    code = """
import dataclasses, pathlib, sys
from app import config
config.settings = dataclasses.replace(config.settings, serve_frontend=True, frontend_dist=pathlib.Path(sys.argv[1]))
from fastapi.testclient import TestClient
from app.main import app
c = TestClient(app)
print([c.get(p).text for p in ("/", "/ward", "/..%2f..%2fsecret.txt", "/..%5c..%5csecret.txt")])
"""
    out = subprocess.run([sys.executable, "-c", code, str(site)], cwd=BACKEND, capture_output=True, text=True, env={**os.environ})
    assert out.stdout.strip() == str(["INDEX"] * 4), out.stderr[-800:]


def test_values_the_database_cannot_hold_are_refused_not_a_crash(client, tokens):
    r = tokens["resident"]
    for path in ("/api/forum/threads/99999999999", "/api/societies/99999999999/dashboard", "/api/societies/99999999999999999999999/dashboard"):
        assert client.get(path, headers=r).status_code in (403, 404, 422), path
    res = client.post("/api/forum/threads", json={"title": "a nul \u0000 here", "body": "text", "tag": "general"}, headers=r)
    assert res.status_code in (200, 422)
