"""API flow tests on the seeded demo ward (the six demo-video scenes, in order)."""
import io


def test_meta_and_personas(client):
    m = client.get("/api/meta").json()
    assert m["features"]["chat"] == "guide" and m["features"]["speech"] is False
    roles = [p["role"] for p in client.get("/api/personas").json()]
    assert roles == ["resident", "society_admin", "ward_officer"]
    assert client.get("/api/me").status_code == 401


def test_scene2_supply_and_tanker(client, tokens):
    r = tokens["resident"]
    sid = client.get("/api/me", headers=r).json()["society_id"]
    a = client.post("/api/supply-logs", json={"came": True, "hours": 2, "client_id": "offline-1"}, headers=r).json()
    b = client.post("/api/supply-logs", json={"came": True, "hours": 2, "client_id": "offline-1"}, headers=r).json()
    assert a["created"] and b["duplicate"] and a["id"] == b["id"]
    dash = client.get(f"/api/societies/{sid}/dashboard", headers=r).json()
    assert dash["my_log_today"] == {"came": True, "hours": 2.0}
    nxt = dash["tankers"]["next"]
    assert nxt["status"] == "scheduled"
    assert client.post(f"/api/tankers/{nxt['id']}/arrived", json={}, headers=r).json()["arrived_at"]
    kinds = [a["kind"] for a in client.get("/api/alerts", headers=r).json()]
    assert "tanker_arrived" in kinds


def test_scene3_groundwater(client, tokens):
    r = tokens["resident"]
    sid = client.get("/api/me", headers=r).json()["society_id"]
    wells = client.get(f"/api/groundwater/wells?society_id={sid}", headers=r).json()["wells"]
    assert len(wells) == 6 and all(w["agency"] in ("CGWB", "GSDA") for w in wells)
    d = client.get("/api/groundwater/district").json()
    assert set(d["outlook"]["horizons"]) == {"t+7", "t+14", "t+30"}
    assert d["observed"]["last_date"] <= d["outlook"]["issue_date"]
    bt = client.get("/api/groundwater/backtest").json()
    assert bt["rows"] and any(m["test_set"].startswith("locked") for m in bt["metrics"])
    readings = client.get(f"/api/societies/{sid}/borewell", headers=r).json()["readings"]
    assert readings and readings[0]["status"] == "baseline"
    bad = client.post("/api/borewell-readings", json={"depth_m": 999}, headers=r)
    assert bad.status_code == 422


def test_scene4_rwh(client, tokens):
    r = tokens["resident"]
    sid = client.get("/api/me", headers=r).json()["society_id"]
    data = client.get(f"/api/societies/{sid}/rwh", headers=r).json()
    assert data["rain"]["source"] == "chirps" and data["rain"]["rain_mm"] > 900
    item = next(c for c in data["units"][0]["checks"] if not c["done"])
    assert client.post(f"/api/rwh/checks/{item['id']}", json={"done": True}, headers=r).json()["done"]
    assert client.get("/api/rwh/calc?area_m2=500&rain_mm=1000&runoff=0.8").json()["litres_per_year"] == 400_000


def test_scene5_leak_lifecycle(client, tokens):
    r, w = tokens["resident"], tokens["ward_officer"]
    photo = ("leak.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64), "image/png")
    t = client.post("/api/leaks", data={"category": "pipe_burst", "lat": "21.2712", "lon": "78.5875", "note": "burst"},
                    files={"photo": photo}, headers=r).json()
    assert t["ward_id"] and t["photo"].startswith("/uploads/") and t["status"] == "open"
    img = client.get(t["photo"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/png" and img.content.startswith(b"\x89PNG")
    fake = ("leak.png", io.BytesIO(b"<svg onload=alert(1)>"), "image/png")
    bad = {"category": "pipe_burst", "lat": "21.2712", "lon": "78.5875"}
    assert client.post("/api/leaks", data=bad, files={"photo": fake}, headers=r).status_code == 422
    big = ("leak.jpg", io.BytesIO(b"\xff\xd8\xff" + b"0" * (4 * 1024 * 1024)), "image/jpeg")
    assert client.post("/api/leaks", data=bad, files={"photo": big}, headers=r).status_code == 413
    assert client.get("/uploads/../app/main.py").status_code == 404 and client.get("/uploads/nope.jpg").status_code == 404
    assert client.patch(f"/api/leaks/{t['id']}", json={"status": "assigned"}, headers=r).status_code == 403
    assert client.patch(f"/api/leaks/{t['id']}", json={"status": "resolved"}, headers=w).status_code == 422
    for st in ("assigned", "in_progress", "resolved"):
        assert client.patch(f"/api/leaks/{t['id']}", json={"status": st}, headers=w).json()["status"] == st
    mine = client.get("/api/alerts?scope=mine", headers=r).json()
    assert any(a["kind"] == "leak_update" and "#%d" % t["id"] in a["text"]["en"] for a in mine)


def test_scene6_ward_view(client, tokens):
    w = tokens["ward_officer"]
    ov = client.get("/api/wards/mine/overview", headers=w).json()
    assert len(ov["societies"]) == 5 and sum(ov["tickets"].values()) >= 9
    assert any(s["has_flagged_reading"] for s in ov["societies"])
    assert client.get("/api/leaks/hotspots", headers=w).json()[0]["count"] >= 3
    pr = client.get("/api/districts/priority").json()
    assert len(pr["districts"]) == 36 and pr["districts"][0]["rank"] == 1
    assert client.get("/api/wards/mine/overview", headers=tokens["resident"]).status_code == 403


def test_community(client, tokens):
    r = tokens["resident"]
    th = client.post("/api/forum/threads", json={"title": "Test thread", "body": "hello there", "tag": "saving"}, headers=r).json()
    assert client.post(f"/api/forum/threads/{th['id']}/vote", headers=r).json()["votes"] == 1
    assert client.post(f"/api/forum/threads/{th['id']}/replies", json={"body": "reply"}, headers=r).json()["replies"] == 1
    assert client.post("/api/savings", json={"action": "bucket_bath"}, headers=r).json()["litres"] == 40
    lb = client.get("/api/savings/leaderboard", headers=r).json()
    assert lb["mine_litres"] >= 40 and len(lb["societies"]) == 5
    assert len(client.get("/api/tips").json()["tips"]) >= 8


def test_chat_offline_guide_and_tts_off(client, tokens):
    r = tokens["resident"]
    assert client.post("/api/chat", json={"message": "hi"}).status_code == 401          # paid services: signed-in users only
    assert client.post("/api/speech/tts", json={"text": "hi"}).status_code == 401
    res = client.post("/api/chat", json={"message": "टँकर कधी येणार", "lang": "mr"}, headers=r)
    assert res.headers["cache-control"] == "private, no-store"
    out = res.json()
    assert out["mode"] == "guide" and out["intent"] == "tanker" and "टँकर" in out["reply"]
    assert client.post("/api/speech/tts", json={"text": "नमस्कार", "lang": "mr"}, headers=r).status_code == 501
