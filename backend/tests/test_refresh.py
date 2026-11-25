"""Renewing the demo entries keeps registered people and everything they entered."""
import io

from sqlalchemy import func, select

from app import clock
from app.db import SessionLocal
from app.models import (Account, Alert, BorewellReading, ForumReply, ForumThread, LeakTicket, Photo, RwhUnit, SavingLog,
                        Society, SupplyLog, TankerTrip, User, Ward)
from app.seed import seed

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 200


def count(db, model, *where):
    return db.scalar(select(func.count()).select_from(model).where(*where))


def test_refresh_keeps_people_and_renews_the_demo(client, tokens):
    soc = client.get("/api/auth/options").json()["societies"][0]["id"]
    reg = client.post("/api/auth/register", json={"username": "keeper", "email": "keeper@example.com", "password": "river-stone-5", "society_id": soc})
    h, asha = {"Authorization": "Bearer " + reg.json()["token"]}, tokens["resident"]
    me = reg.json()["user"]["id"]

    def leak(headers, note):
        r = client.post("/api/leaks", data={"category": "pipe_burst", "lat": "21.2712", "lon": "78.5875", "note": note},
                        files={"photo": ("l.png", io.BytesIO(PNG), "image/png")}, headers=headers)
        assert r.status_code == 200
        return r.json()

    mine, test_one = leak(h, "kept"), leak(asha, "a try-out with a demo account")
    client.post("/api/supply-logs", json={"came": True, "hours": 2, "client_id": "keeper-1"}, headers=h)
    client.post("/api/savings", json={"action": next(iter(__import__("app.services.community", fromlist=["x"]).SAVING_ACTIONS))}, headers=h)
    asha_thread = client.post("/api/forum/threads", json={"title": "Try-out thread", "body": "test post", "tag": "general"}, headers=asha).json()
    seeded_thread = [t for t in client.get("/api/forum/threads", headers=h).json() if t["is_demo"]][0]["id"]
    assert client.post(f"/api/forum/threads/{seeded_thread}/replies", json={"body": "kept reply"}, headers=h).status_code == 200

    with SessionLocal() as db:
        wards, socs, users = count(db, Ward), count(db, Society), count(db, User)
        accounts = count(db, Account)
        db.query(SupplyLog).filter(SupplyLog.is_demo).delete()                 # as if the demo had gone stale
        db.commit()

    assert seed(refresh=True)["mode"] == "refreshed"

    with SessionLocal() as db:
        assert (count(db, Ward), count(db, Society), count(db, User), count(db, Account)) == (wards, socs, users, accounts)
        assert count(db, SupplyLog, SupplyLog.user_id == me) == 1 and count(db, SavingLog, SavingLog.user_id == me) == 1
        assert count(db, SupplyLog, SupplyLog.is_demo) > 400 and count(db, TankerTrip, TankerTrip.scheduled_at > clock.now()) > 0
        assert count(db, LeakTicket, LeakTicket.is_demo) == 9 and count(db, RwhUnit) == 7
        assert db.get(LeakTicket, mine["id"]).note == "kept"
        assert count(db, LeakTicket, LeakTicket.note == "a try-out with a demo account") == 0
        assert db.get(Photo, mine["photo"].split("/")[-1]) and not db.get(Photo, test_one["photo"].split("/")[-1])
        assert count(db, Alert, Alert.dedupe_key == f"leak_new:{mine['id']}") == 1
        assert count(db, ForumThread, ForumThread.id == asha_thread["id"]) == 0 and count(db, ForumThread, ForumThread.is_demo) == 4
        assert count(db, ForumReply, ForumReply.body == "kept reply") == 1
        pairs = db.execute(select(BorewellReading.society_id, BorewellReading.day, func.count()).group_by(BorewellReading.society_id, BorewellReading.day)).all()
        assert all(n == 1 for *_, n in pairs)                                    # never two readings for one borewell and day

    assert client.get("/api/me", headers=h).status_code == 200                    # still signed in
    assert client.post("/api/auth/login", json={"identifier": "keeper", "password": "river-stone-5"}).status_code == 200
    assert client.get("/api/me", headers=asha).status_code == 200
    first = seed(refresh=True)
    assert first["mode"] == "refreshed" and seed(refresh=True) == first            # safe to run again and again
