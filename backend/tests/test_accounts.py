"""Create an account, sign in, sign out; what is refused; what is never shown."""
from dataclasses import replace
from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app import auth, manage
from app.db import SessionLocal
from app.models import Account, AuthSession, SignInFailure, User, now
from app.routers import accounts

GOOD = {"username": "Meera.Kulkarni", "email": "Meera@Example.com", "password": "pond-lily-42", "lang": "mr"}


def society(client):
    return client.get("/api/auth/options").json()["societies"][0]["id"]


def make(client, **over):
    return client.post("/api/auth/register", json={**GOOD, "society_id": society(client), **over})


def login(client, identifier, password):
    return client.post("/api/auth/login", json={"identifier": identifier, "password": password})


def head(res):
    return {"Authorization": "Bearer " + res.json()["token"]}


@pytest.fixture(scope="module")
def meera(client):
    res = make(client)
    assert res.status_code == 201, res.text
    return res


def test_register_makes_a_resident_who_can_use_the_app(client, meera):
    u = meera.json()["user"]
    assert u["role"] == "resident" and u["name"] == "Meera.Kulkarni" and u["is_demo"] is False and u["lang"] == "mr"
    h = head(meera)
    assert client.get("/api/me", headers=h).json()["id"] == u["id"]
    assert client.get(f"/api/societies/{u['society_id']}/dashboard", headers=h).status_code == 200
    r = client.post("/api/supply-logs", json={"came": True, "hours": 1, "client_id": "meera-1"}, headers=h)
    assert r.json()["created"]
    assert client.get("/api/wards/mine/overview", headers=h).status_code == 403          # nobody can register as an officer


@pytest.mark.parametrize("who", ["meera.kulkarni", "MEERA.Kulkarni", " meera@example.com ", "MEERA@EXAMPLE.COM"])
def test_sign_in_with_username_or_email_in_any_case(client, meera, who):
    res = login(client, who, GOOD["password"])
    assert res.status_code == 200 and res.json()["user"]["name"] == "Meera.Kulkarni"


def test_the_same_letters_typed_differently_are_the_same_password(client):
    res = make(client, username="nfc.user", email="nfc@example.com", password="café-पाणी-9")
    assert res.status_code == 201
    assert login(client, "nfc.user", "café-पाणी-9").status_code == 200


def test_wrong_password_and_unknown_person_look_the_same(client, meera):
    a, b = login(client, "meera.kulkarni", "not-it-at-all"), login(client, "nobody.here", "not-it-at-all")
    assert a.status_code == b.status_code == 401 and a.json() == b.json() == {"detail": {"code": "wrong"}}
    assert login(client, "bad\x00name", "x" * 9).status_code == 401
    assert login(client, "", "").json()["detail"]["fields"] == {"identifier": "required", "password": "required"}


def test_password_is_not_stored_and_email_is_never_returned(client, meera):
    with SessionLocal() as db:
        acc = db.scalar(select(Account).where(Account.username == "meera.kulkarni"))
        assert acc.email == "meera@example.com" and acc.password_hash.startswith("scrypt$") and GOOD["password"] not in acc.password_hash
        token = meera.json()["token"]
        assert db.get(AuthSession, token) is None and token not in {s.token_hash for s in db.scalars(select(AuthSession))}
    h = head(meera)
    client.post("/api/forum/threads", json={"title": "Hello from Meera", "body": "Testing the forum", "tag": "general"}, headers=h)
    for path in ("/api/me", "/api/forum/threads", "/api/savings/leaderboard", "/api/auth/options", "/api/leaks", "/api/alerts"):
        assert "example.com" not in client.get(path, headers=h).text, path


@pytest.mark.parametrize("over, field, code", [
    ({"username": ""}, "username", "required"),
    ({"username": "ab"}, "username", "username_short"),
    ({"username": "has space"}, "username", "username_chars"),
    ({"username": "me@home"}, "username", "username_chars"),
    ({"username": ".dot"}, "username", "username_chars"),
    ({"username": "x" * 31}, "username", "username_chars"),
    ({"username": "Admin"}, "username", "username_taken"),
    ({"email": ""}, "email", "required"),
    ({"email": "not-an-email"}, "email", "email_invalid"),
    ({"email": "a@b"}, "email", "email_invalid"),
    ({"password": ""}, "password", "required"),
    ({"password": "short7!"}, "password", "password_short"),
    ({"password": "x1" * 65}, "password", "password_long"),
    ({"password": "Password123"}, "password", "password_common"),
    ({"password": "aaaaaaaaaa"}, "password", "password_common"),
    ({"username": "someone.new", "password": "Someone.New"}, "password", "password_same"),
    ({"society_id": None}, "society_id", "society_missing"),
    ({"society_id": 99999}, "society_id", "society_missing"),
    ({"username": "meera.KULKARNI", "email": "other@example.com"}, "username", "username_taken"),
    ({"username": "other.name", "email": "MEERA@example.com"}, "email", "email_taken"),
])
def test_what_registration_refuses(client, meera, over, field, code):
    base = {"username": "fresh.name", "email": "fresh@example.com"}
    res = make(client, **{**base, **over})
    assert res.status_code in (409, 422) and res.json()["detail"]["fields"] == {field: code}


def test_a_client_cannot_choose_its_own_role(client):
    res = make(client, username="sneaky", email="sneaky@example.com", role="ward_officer", persona=True)
    assert res.status_code == 201 and res.json()["user"]["role"] == "resident"
    assert "sneaky" not in [p["name"] for p in client.get("/api/auth/options").json()["demo"]]


def test_two_people_taking_one_name_at_once(client, monkeypatch):
    monkeypatch.setattr(accounts, "taken", lambda *a: {})            # both passed the first check
    assert make(client, username="race.name", email="race1@example.com").status_code == 201
    res = make(client, username="race.name", email="race2@example.com")
    assert res.status_code == 409 and res.json()["detail"]["fields"] == {"username": "username_taken"}
    with SessionLocal() as db:
        assert len(db.scalars(select(User).where(User.name == "race.name")).all()) == 1       # nothing half-made left behind


def test_signing_out_ends_only_that_session(client, meera):
    one, two = login(client, "meera.kulkarni", GOOD["password"]), login(client, "meera.kulkarni", GOOD["password"])
    assert client.post("/api/auth/logout", headers=head(one)).status_code == 204
    assert client.get("/api/me", headers=head(one)).status_code == 401
    assert client.get("/api/me", headers=head(two)).status_code == 200
    assert client.post("/api/auth/logout").status_code == 204                    # already signed out: not an error


def test_sessions_expire(client, meera):
    h = head(login(client, "meera.kulkarni", GOOD["password"]))
    with SessionLocal() as db:
        db.execute(update(AuthSession).where(AuthSession.token_hash == auth._keyed(h["Authorization"][7:])).values(expires_at=now() - timedelta(minutes=1)))
        db.commit()
    assert client.get("/api/me", headers=h).status_code == 401


@pytest.mark.parametrize("token", ["", "x", "1.deadbeef", "Bearer", "é", "'; drop table account; --"])
def test_made_up_tokens_are_refused(client, token):
    assert client.get("/api/me", headers={"Authorization": f"Bearer {token}".encode("utf-8")}).status_code == 401


def test_too_many_wrong_passwords_pause_that_account_only(client, meera):
    assert make(client, username="locked.one", email="locked@example.com").status_code == 201
    for _ in range(auth.MAX_FAILURES):
        assert login(client, "locked.one", "wrong-wrong").status_code == 401
    res = login(client, "Locked.One", GOOD["password"])                          # even the right one has to wait
    assert res.status_code == 429 and res.json()["detail"] == {"code": "too_many", "minutes": 15}
    assert login(client, "meera.kulkarni", GOOD["password"]).status_code == 200
    with SessionLocal() as db:
        db.execute(update(SignInFailure).values(at=now() - timedelta(minutes=16)))
        db.commit()
    assert login(client, "locked.one", GOOD["password"]).status_code == 200


def test_a_flood_of_new_accounts_is_stopped(client, monkeypatch):
    monkeypatch.setattr(accounts, "MAX_NEW_PER_HOUR", 0)
    res = make(client, username="one.more", email="one.more@example.com")
    assert res.status_code == 429 and res.json()["detail"] == {"code": "busy"}


def test_demo_sign_in_is_only_for_the_demo_accounts(client, meera, monkeypatch):
    assert client.post("/api/auth/demo", json={"user_id": meera.json()["user"]["id"]}).status_code == 404
    assert client.post("/api/auth/demo", json={"user_id": 10 ** 12}).status_code in (404, 422)
    persona = client.get("/api/auth/options").json()["demo"][0]["id"]
    monkeypatch.setattr(accounts, "settings", replace(accounts.settings, demo_login=False))
    assert client.get("/api/auth/options").json()["demo"] == []
    assert client.post("/api/auth/demo", json={"user_id": persona}).status_code == 404
    assert client.post("/api/login", json={"user_id": persona}).status_code in (404, 405)      # the old open door is gone


def test_looking_after_accounts(client):
    res = make(client, username="helper", email="helper@example.com")
    with SessionLocal() as db:
        manage.set_role(db, "Helper", "society_admin")
        manage.set_password(db, "helper", "new-secret-77")
        with pytest.raises(SystemExit):
            manage.set_password(db, "helper", "short")
    assert client.get("/api/me", headers=head(res)).status_code == 401            # a new password ends old sign-ins
    res = login(client, "helper", "new-secret-77")
    assert res.json()["user"]["role"] == "society_admin" and login(client, "helper", GOOD["password"]).status_code == 401
    with SessionLocal() as db:
        manage.delete_account(db, "helper")
        assert "helper@example.com" not in db.scalars(select(Account.email)).all()
    assert client.get("/api/me", headers=head(res)).status_code == 401 and login(client, "helper", "new-secret-77").status_code == 401
