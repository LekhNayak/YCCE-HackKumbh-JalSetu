"""Demo data: one ward in Katol (Nagpur district) with five fictional housing societies, dated relative to today.

Everything here is marked is_demo=True and labelled "Demo data" in the app. The groundwater sensor wells and the
forecast are NOT seeded: they are real (backend/data). Borewell readings are generated from the real nearby wells'
movement plus small noise, then pass through the same trust check as a real reading.

Run from backend/:
  python -m app.seed --refresh    renews the demo entries with today's dates; registered accounts and what they entered stay
  python -m app.seed --reset      wipes the whole database, accounts included, and loads the demo data
"""
import argparse
import random
from datetime import date, datetime, time, timedelta

from sqlalchemy import delete, or_, select

from . import clock
from .db import Base, SessionLocal, engine
from .models import (Alert, BorewellReading, ForumReply, ForumThread, LeakTicket, Photo, RwhCheck, RwhUnit, SavingLog,
                     Society, SupplyLog, TankerTrip, User, Vote, Ward)
from .routers.rwh import CHECKLIST
from .services import alerts, forecast, realdata, trust
from .services.community import SAVING_ACTIONS

CENTRE = (21.2717, 78.5860)            # Katol town, Nagpur district (dense live CGWB/GSDA wells around it)
WARD_RING = [[78.5700, 21.2580], [78.6030, 21.2590], [78.6040, 21.2840], [78.5710, 21.2850], [78.5700, 21.2580]]

SOCIETIES = [
    # name, lat, lon, households, roof m2, danger depth m, supply prob on supply days, tanker-dependent, borewell start m
    ("Sai Krupa Residency", 21.2745, 78.5832, 48, 900, 18.0, 0.50, True, 11.4),
    ("Gulmohar Housing Society", 21.2690, 78.5905, 36, 650, 16.0, 0.72, False, 9.8),
    ("Shivneri Apartments", 21.2768, 78.5921, 60, 1200, 20.0, 0.42, True, 13.2),
    ("Radha Krishna Nagar", 21.2652, 78.5809, 24, 1500, 15.0, 0.80, False, 8.6),
    ("Om Sai Colony", 21.2801, 78.5778, 30, 800, 17.0, 0.60, True, 12.1),
]
RESIDENTS = ["Sunita Joshi", "Mahesh Kale", "Kavita Thakre", "Vijay Bhoyar", "Neha Ingle", "Anil Meshram", "Pooja Dhote",
             "Ravi Gawande", "Meena Kolte", "Suresh Ambade", "Lata Chaudhari", "Deepak Burade", "Smita Wasnik",
             "Prakash Tayde", "Rekha Dongre"]


def at(d: date, hh: int, mm: int = 0) -> datetime:
    return datetime.combine(d, time(hh, mm))


def seeded(db) -> bool:
    return db.scalar(select(Ward.id).limit(1)) is not None


def existing_people(db):
    ward = db.scalars(select(Ward).where(Ward.is_demo).order_by(Ward.id)).first()
    socs = db.scalars(select(Society).where(Society.ward_id == ward.id, Society.is_demo).order_by(Society.id)).all()
    users = db.scalars(select(User).where(User.is_demo, User.ward_id == ward.id).order_by(User.id)).all()
    rajesh = next(u for u in users if u.persona and u.role == "society_admin")
    priya = next(u for u in users if u.persona and u.role == "ward_officer")
    return ward, socs, {s.id: [u for u in users if u.society_id == s.id] for s in socs}, rajesh, priya


def clear_demo_entries(db):
    """Remove the demo ward's entries, and whatever people tried out with the demo accounts."""
    demo = select(User.id).where(User.is_demo)
    for m, by in ((SupplyLog, SupplyLog.user_id), (BorewellReading, BorewellReading.user_id), (SavingLog, SavingLog.user_id),
                  (LeakTicket, LeakTicket.reporter_id)):
        db.execute(delete(m).where(or_(m.is_demo, by.in_(demo))))
    db.execute(delete(TankerTrip).where(or_(TankerTrip.checked_in_by.is_(None), TankerTrip.checked_in_by.in_(demo))))
    db.execute(delete(RwhCheck))
    db.execute(delete(RwhUnit))
    db.execute(delete(Photo).where(Photo.name.not_in(select(LeakTicket.photo).where(LeakTicket.photo.is_not(None)))))
    tickets = {str(i) for i in db.scalars(select(LeakTicket.id))}
    for a in db.scalars(select(Alert)).all():
        kind, _, rest = (a.dedupe_key or "").partition(":")
        if not (kind.startswith("leak_") and rest.split(":")[0] in tickets):
            db.delete(a)
    # forum: the seeded threads stay; test posts made with a demo account go, unless a registered person replied
    db.execute(delete(ForumReply).where(ForumReply.is_demo.is_(False), ForumReply.author_id.in_(demo)))
    db.flush()
    old = list(db.scalars(select(ForumThread.id).where(ForumThread.is_demo.is_(False), ForumThread.author_id.in_(demo),
                                                       ForumThread.id.not_in(select(ForumReply.thread_id)))))
    db.execute(delete(Vote).where(Vote.thread_id.in_(old)))
    db.execute(delete(ForumThread).where(ForumThread.id.in_(old)))
    db.flush()


def seed(reset: bool = False, refresh: bool = False, rnd_seed: int = 7):
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        return _seed(db, refresh and seeded(db), rnd_seed)
    finally:
        db.close()


def new_people(db, rnd):
    ward = Ward(name={"en": "Katol Ward 3 (demo)", "mr": "काटोल प्रभाग 3 (डेमो)", "hi": "काटोल वार्ड 3 (डेमो)"},
                town="Katol, Nagpur district", polygon=WARD_RING,
                utility={"en": "Municipal water supply office (demo routing)",
                         "mr": "नगरपरिषद पाणीपुरवठा कार्यालय (डेमो)", "hi": "नगर परिषद जल-आपूर्ति कार्यालय (डेमो)"})
    db.add(ward)
    db.flush()

    socs = []
    for name, lat, lon, hh, roof, danger, *_ in SOCIETIES:
        s = Society(name=name, ward_id=ward.id, lat=lat, lon=lon, households=hh, roof_area_m2=roof, danger_depth_m=danger)
        db.add(s)
        socs.append(s)
    db.flush()

    asha = User(name="Asha Patil", role="resident", society_id=socs[0].id, ward_id=ward.id, lang="mr", persona=True,
                blurb={"en": "Resident, Sai Krupa Residency. Logs water every day, in Marathi.",
                       "mr": "साई कृपा रेसिडेन्सीमधील रहिवासी. रोज मराठीत पाण्याची नोंद करतात.",
                       "hi": "साईं कृपा रेसिडेंसी की निवासी। रोज़ मराठी में पानी की एंट्री करती हैं।"})
    rajesh = User(name="Rajesh Deshmukh", role="society_admin", society_id=socs[0].id, ward_id=ward.id, lang="en", persona=True,
                  blurb={"en": "Secretary, Sai Krupa Residency. Books tankers, looks after the borewell and recharge pits.",
                         "mr": "सचिव, साई कृपा रेसिडेन्सी. टँकर मागवतात, बोअरवेल आणि पुनर्भरण खड्ड्यांची काळजी घेतात.",
                         "hi": "सचिव, साईं कृपा रेसिडेंसी। टैंकर मँगवाते हैं, बोरवेल और रिचार्ज गड्ढों की देखभाल करते हैं।"})
    priya = User(name="Priya Wankhede", role="ward_officer", society_id=None, ward_id=ward.id, lang="en", persona=True,
                 blurb={"en": "Ward water officer, Katol Ward 3. Handles leak tickets and tanker planning.",
                        "mr": "प्रभाग पाणी अधिकारी, काटोल प्रभाग 3. गळती तक्रारी आणि टँकर नियोजन पाहतात.",
                        "hi": "वार्ड जल अधिकारी, काटोल वार्ड 3। रिसाव शिकायतें और टैंकर योजना देखती हैं।"})
    db.add_all([asha, rajesh, priya])
    residents = {s.id: [] for s in socs}
    residents[socs[0].id] += [asha, rajesh]
    for i, nm in enumerate(RESIDENTS):
        s = socs[i % len(socs)]
        u = User(name=nm, role="resident", society_id=s.id, ward_id=ward.id, lang=rnd.choice(["mr", "mr", "hi", "en"]))
        db.add(u)
        residents[s.id].append(u)
    db.flush()
    return ward, socs, residents, rajesh, priya


def _seed(db, again: bool, rnd_seed: int):
    rnd = random.Random(rnd_seed)
    today = clock.today()
    nowt = clock.now().replace(second=0)
    if again:
        ward, socs, residents, rajesh, priya = existing_people(db)
        clear_demo_entries(db)
    else:
        ward, socs, residents, rajesh, priya = new_people(db, rnd)
    read_on = {(s, d) for s, d in db.execute(select(BorewellReading.society_id, BorewellReading.day))}

    # --- supply logs: alternate-day supply, some days it does not come; 1-3 people log per day; today left empty ---
    for s, (*_, p_supply, _tank, _bw) in zip(socs, SOCIETIES):
        for back in range(59, 0, -1):
            d = today - timedelta(days=back)
            scheduled = (d.toordinal() + s.id) % 2 == 0
            came = rnd.random() < (p_supply if scheduled else 0.04)
            for u in rnd.sample(residents[s.id], k=min(len(residents[s.id]), rnd.choice([1, 2, 2, 3]))):
                c = came if rnd.random() > 0.05 else not came
                db.add(SupplyLog(society_id=s.id, user_id=u.id, day=d, came=c, is_demo=True,
                                 hours=round(rnd.choice([1, 1.5, 2, 2, 2.5, 3]), 1) if c else None,
                                 pressure=rnd.choice(["low", "ok", "ok", "good"]) if c else None))

    # --- tanker trips: tanker-dependent societies get one every ~3 days; today's trip is still to come ---
    for s, (*_, tanker_dep, _bw) in zip(socs, SOCIETIES):
        step = 3 if tanker_dep else 7
        for back in range(45, 0, -step):
            d = today - timedelta(days=back + s.id % 2)
            sched = at(d, rnd.choice([9, 11, 15]))
            r = rnd.random()
            arrived = None if r < 0.12 else sched + timedelta(minutes=rnd.randint(-20, 25) if r < 0.72 else rnd.randint(45, 180))
            t = TankerTrip(society_id=s.id, scheduled_at=sched, arrived_at=arrived, source="municipal" if tanker_dep else "private",
                           checked_in_by=residents[s.id][0].id if arrived else None, is_demo=True)
            db.add(t)
            db.flush()
            if arrived and back < 12:
                alerts.emit(db, "tanker_arrived", {"society": s.name, "time": arrived.strftime("%H:%M")}, society_id=s.id,
                            ward_id=ward.id, dedupe_key=f"tanker_arrived:{t.id}", is_demo=True, created_at=arrived, send=False)
        if tanker_dep:
            nxt = max(nowt + timedelta(minutes=75), at(today, 9))
            nxt = min(nxt.replace(minute=(nxt.minute // 15) * 15), at(today, 23))
            db.add(TankerTrip(society_id=s.id, scheduled_at=nxt if s.id == socs[0].id else at(today + timedelta(days=1), 10),
                              source="municipal", is_demo=True))
            db.add(TankerTrip(society_id=s.id, scheduled_at=at(today + timedelta(days=3), 15), source="municipal", is_demo=True))

    # --- borewell readings: weekly, following the real nearby wells' movement (+ small noise); one outlier ---
    outlook = forecast.outlook(today)
    for s, (*_, start_depth) in zip(socs, SOCIETIES):
        wells = [w for w in realdata.nearest_wells(s.lat, s.lon, n=6)]
        days = [today - timedelta(days=7 * k + 2) for k in range(10, -1, -1)]
        depth, prev = start_depth, None
        for i, d in enumerate(days):
            if prev is not None:
                moves = []
                for w in wells:
                    pts = realdata.series(w)
                    if pts:
                        c = trust.well_change(pts, min(d, pts[-1][0]), (d - prev[0]).days)
                        if c is not None:
                            moves.append(c)
                moves.sort()
                depth = round(depth + (moves[len(moves) // 2] if moves else 0.1) + rnd.gauss(0, 0.06), 2)
            value = depth
            if s.id == socs[1].id and i == 8:          # a typo-like jump the trust check should catch
                value = round(depth + 4.2, 2)
            if (s.id, d) in read_on:                   # a registered person already entered this borewell that day
                prev = (d, value)
                continue
            verdict = trust.check(value, d, prev, s.lat, s.lon, outlook)
            r = BorewellReading(society_id=s.id, user_id=residents[s.id][-1].id, day=d, depth_m=value, is_demo=True, **verdict)
            db.add(r)
            db.flush()
            if verdict["status"] == "flagged":
                alerts.emit(db, "reading_flagged", {"society": s.name, "depth_m": value}, society_id=s.id, ward_id=ward.id,
                            dedupe_key=f"reading_flagged:{r.id}", is_demo=True, created_at=at(d, 19), send=False)
            prev = (d, value)

    # --- rainwater units and their maintenance checklist ---
    unit_plan = {0: [("recharge_pit", "Recharge pit, Block A roof", 600, 5), ("storage_tank", "Rooftop storage tank, Block B", 300, 2)],
                 1: [("recharge_pit", "Recharge pit near gate", 650, 7)],
                 2: [("recharge_pit", "Recharge pit, Wing C", 700, 3), ("storage_tank", "Storage tank, Wing A", 500, 8)],
                 3: [("recharge_pit", "Open-ground recharge trench", 900, 4)],
                 4: [("recharge_pit", "Recharge pit, community hall", 800, 1)]}
    for i, s in enumerate(socs):
        for kind, label, area, n_done in unit_plan[i]:
            u = RwhUnit(society_id=s.id, kind=kind, label=label, catchment_m2=area, is_demo=True)
            db.add(u)
            db.flush()
            done = set(rnd.sample(CHECKLIST, n_done))
            for item in CHECKLIST:
                db.add(RwhCheck(unit_id=u.id, item=item,
                                done_at=at(today - timedelta(days=rnd.randint(2, 40)), 10) if item in done else None))

    # --- leak tickets in every status; three repeat reports near the market road make a hotspot ---
    plan = [("pipe_burst", 21.2712, 78.5875, "open", 3, "Main line burst near the vegetable market, water on the road."),
            ("drain", 21.2715, 78.5879, "open", 60, "पाणी गटारात वाहत आहे, सकाळपासून."),
            ("pipe_burst", 21.2709, 78.5871, "assigned", 20, "Same spot again, pressure very low in the lane."),
            ("overflow", 21.2770, 78.5925, "assigned", 9, "Overhead tank overflowing every morning."),
            ("open_tap", 21.2655, 78.5812, "in_progress", 30, "सार्वजनिक नळाला तोटी नाही, पाणी वाया जाते."),
            ("illegal", 21.2803, 78.5781, "resolved", 400, "Suspected illegal connection on the main line."),
            ("pipe_burst", 21.2747, 78.5836, "resolved", 220, "Leak at the valve chamber outside Sai Krupa."),
            ("overflow", 21.2692, 78.5908, "resolved", 130, "टंकी भरकर बह रही है, फ़्लोट वाल्व खराब है।"),
            ("drain", 21.2711, 78.5873, "resolved", 520, "Water flowing into the drain near the market.")]
    order = ["open", "assigned", "in_progress", "resolved"]
    for cat, lat, lon, status, hours_ago, note in plan:
        reporter = rnd.choice([u for us in residents.values() for u in us if u.role == "resident"])
        created = nowt - timedelta(hours=hours_ago)
        hist, tstamp = [{"status": "open", "at": created.isoformat(), "by": reporter.id}], created
        for st in order[1:order.index(status) + 1]:
            tstamp = tstamp + timedelta(hours=rnd.randint(2, 14) if st != "resolved" else rnd.randint(4, 30))
            hist.append({"status": st, "at": tstamp.isoformat(), "by": priya.id})
        t = LeakTicket(reporter_id=reporter.id, society_id=reporter.society_id, ward_id=ward.id, lat=lat, lon=lon,
                       category=cat, note=note, status=status, created_at=created, updated_at=tstamp,
                       resolved_at=tstamp if status == "resolved" else None, history=hist, is_demo=True)
        db.add(t)
        db.flush()
        if status == "resolved":
            alerts.emit(db, "leak_update", {"id": t.id, "category": cat, "status": "resolved"}, user_id=reporter.id,
                        society_id=reporter.society_id, ward_id=ward.id, dedupe_key=f"leak_update:{t.id}:resolved",
                        is_demo=True, created_at=tstamp, send=False)

    # --- forum (kept on a refresh: people may have replied) ---
    threads = [] if again else [
        (rajesh, "How often should we desilt the recharge pit?", "We cleaned ours in May and the water still soaked in slowly by August. Do others desilt twice a year?", "rwh", "en",
         [(residents[socs[2].id][0], "We do it in May and again after Diwali. The top sand layer clogs fastest; replace just that."),
          (residents[socs[3].id][0], "Also fit a first-flush pipe. Since we added one, much less silt reaches the pit.")]),
        (residents[socs[0].id][2], "टँकर नेहमी उशिरा येतो, तुमचा अनुभव काय?", "आमच्याकडे दुपारी 3 चा टँकर बऱ्याचदा 5 वाजता येतो. जलसेतूमध्ये नोंद करायला सुरुवात केल्यापासून प्रभाग कार्यालयात आकडे दाखवता येतात.", "tanker", "mr",
         [(residents[socs[2].id][1], "आमच्याकडेही असेच. आता आम्ही आगमनाची वेळ रोज नोंदवतो, मागच्या आठवड्यात दोनदा वेळेवर आला."),
          (priya, "नोंदी उपयोगी पडत आहेत. उशिराच्या फेऱ्यांबद्दल पुरवठादाराशी बोललो आहोत.")]),
        (residents[socs[4].id][0], "आरओ का बेकार पानी कैसे इस्तेमाल करें?", "हमारे घर में आरओ से रोज़ करीब 15 लीटर पानी निकलता है। आप लोग उसका क्या करते हैं?", "saving", "hi",
         [(residents[socs[1].id][0], "हम एक बाल्टी में जमा करके पोछा और फ़्लश में डालते हैं। पौधों के लिए थोड़ा साफ़ पानी मिला लेते हैं।")]),
        (residents[socs[2].id][2], "Our borewell went dry at 17 m last May", "Pump ran dry for three weeks in May. What did other societies do: deepen, or depend on tankers?", "borewell", "en",
         [(rajesh, "We started weekly readings in JalSetu. Seeing the trend early let us book tankers before the pump failed.")]),
    ]
    all_users = [u for us in residents.values() for u in us] + [priya]
    for k, (author, title, body, tag, lang, replies) in enumerate(threads):
        created = nowt - timedelta(days=12 - 3 * k, hours=rnd.randint(0, 10))
        th = ForumThread(author_id=author.id, title=title, body=body, tag=tag, lang=lang, created_at=created, is_demo=True)
        db.add(th)
        db.flush()
        for j, (ru, rb) in enumerate(replies):
            db.add(ForumReply(thread_id=th.id, author_id=ru.id, body=rb, created_at=created + timedelta(hours=5 + 7 * j), is_demo=True))
        for u in rnd.sample(all_users, k=rnd.randint(3, 9)):
            db.add(Vote(thread_id=th.id, user_id=u.id))

    # --- water-saving log ---
    engagement = {0: 26, 1: 18, 2: 22, 3: 12, 4: 15}
    for i, s in enumerate(socs):
        for _ in range(engagement[i]):
            action = rnd.choice(list(SAVING_ACTIONS))
            db.add(SavingLog(user_id=rnd.choice(residents[s.id]).id, society_id=s.id, day=today - timedelta(days=rnd.randint(0, 29)),
                             action=action, litres=SAVING_ACTIONS[action] * rnd.choice([1, 1, 2, 3]), is_demo=True))

    db.commit()
    return {"ward": ward.id, "societies": len(socs), "mode": "refreshed" if again else "loaded"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="renew the demo entries; keep registered accounts and their entries")
    ap.add_argument("--reset", action="store_true", help="drop all tables, accounts included, and load the demo data")
    ap.add_argument("--erase-hosted", action="store_true", help="needed with --reset when the database is not the local SQLite file")
    a = ap.parse_args()
    if a.reset and engine.dialect.name != "sqlite" and not a.erase_hosted:
        ap.error("DATABASE_URL is a hosted database, and --reset would erase the registered accounts in it. Use --refresh.")
    Base.metadata.create_all(engine)
    with SessionLocal() as check:
        if not (a.reset or a.refresh) and seeded(check):
            ap.error("the demo data is already there. Use --refresh to renew it.")
    print(seed(reset=a.reset, refresh=a.refresh))
