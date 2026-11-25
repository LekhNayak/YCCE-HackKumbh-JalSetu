"""Tips, the best-practice forum and the community water-saving log."""
import json
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import current_user, require
from ..db import get_db
from ..models import ForumReply, ForumThread, SavingLog, Society, User, Vote
from ..services.community import SAVING_ACTIONS

router = APIRouter(prefix="/api", tags=["community"])
TAGS = ("saving", "rwh", "borewell", "tanker", "general")


@lru_cache(maxsize=1)
def tips_file():
    return json.loads((Path(__file__).resolve().parents[1] / "content" / "tips.json").read_text(encoding="utf-8"))


@router.get("/tips")
def tips():
    month = date.today().month
    season = "summer" if month in (3, 4, 5) else "monsoon" if month in (6, 7, 8, 9) else "post_monsoon"
    items = tips_file()["tips"]
    return {"season": season, "tips": sorted(items, key=lambda t: (season not in t["seasons"], t["id"]))}


def thread_out(t: ForumThread, votes: int, voted: bool, full=False):
    out = {"id": t.id, "title": t.title, "body": t.body if full else t.body[:220], "tag": t.tag, "lang": t.lang,
           "author": t.author.name, "society": t.author.society.name if t.author.society else None,
           "created_at": t.created_at.isoformat(), "replies": len(t.replies), "votes": votes, "voted": voted,
           "is_demo": t.is_demo}
    if full:
        out["reply_list"] = [{"id": r.id, "body": r.body, "author": r.author.name, "created_at": r.created_at.isoformat(),
                              "is_demo": r.is_demo} for r in t.replies]
    return out


def votes_for(db, ids, user_id):
    counts = dict(db.execute(select(Vote.thread_id, func.count()).where(Vote.thread_id.in_(ids)).group_by(Vote.thread_id)).all())
    mine = set(db.scalars(select(Vote.thread_id).where(Vote.thread_id.in_(ids), Vote.user_id == user_id)).all())
    return counts, mine


@router.get("/forum/threads")
def threads(tag: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(ForumThread).order_by(ForumThread.created_at.desc())
    if tag:
        q = q.where(ForumThread.tag == tag)
    rows = db.scalars(q).all()
    counts, mine = votes_for(db, [t.id for t in rows], user.id)
    return [thread_out(t, counts.get(t.id, 0), t.id in mine) for t in rows]


@router.get("/forum/threads/{thread_id}")
def thread(thread_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.get(ForumThread, thread_id)
    if t is None:
        raise HTTPException(404, "thread not found")
    counts, mine = votes_for(db, [t.id], user.id)
    return thread_out(t, counts.get(t.id, 0), t.id in mine, full=True)


class ThreadIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    body: str = Field(min_length=3, max_length=3000)
    tag: str = Field(default="general")
    lang: str = Field(default="en", pattern="^(en|mr|hi)$")


@router.post("/forum/threads")
def new_thread(body: ThreadIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.tag not in TAGS:
        raise HTTPException(422, f"tag must be one of {TAGS}")
    t = ForumThread(author_id=user.id, title=body.title.strip(), body=body.body.strip(), tag=body.tag, lang=body.lang)
    db.add(t)
    db.commit()
    return thread_out(t, 0, False, full=True)


class ReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


@router.post("/forum/threads/{thread_id}/replies")
def reply(thread_id: int, body: ReplyIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if db.get(ForumThread, thread_id) is None:
        raise HTTPException(404, "thread not found")
    db.add(ForumReply(thread_id=thread_id, author_id=user.id, body=body.body.strip()))
    db.commit()
    return thread(thread_id, user, db)


@router.post("/forum/threads/{thread_id}/vote")
def vote(thread_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    existing = db.scalar(select(Vote).where(Vote.thread_id == thread_id, Vote.user_id == user.id))
    if existing:
        db.delete(existing)
    else:
        db.add(Vote(thread_id=thread_id, user_id=user.id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return thread(thread_id, user, db)


@router.get("/savings/actions")
def saving_actions():
    return SAVING_ACTIONS


class SavingIn(BaseModel):
    action: str
    times: int = Field(default=1, ge=1, le=30)


@router.post("/savings")
def log_saving(body: SavingIn, user: User = Depends(require("resident", "society_admin")), db: Session = Depends(get_db)):
    if body.action not in SAVING_ACTIONS:
        raise HTTPException(422, "unknown action")
    s = SavingLog(user_id=user.id, society_id=user.society_id, day=date.today(), action=body.action,
                  litres=SAVING_ACTIONS[body.action] * body.times)
    db.add(s)
    db.commit()
    return {"id": s.id, "litres": s.litres}


@router.get("/savings/leaderboard")
def leaderboard(days: int = 30, user: User = Depends(current_user), db: Session = Depends(get_db)):
    since = date.today() - timedelta(days=days - 1)
    rows = db.execute(select(Society.id, Society.name, Society.households, func.coalesce(func.sum(SavingLog.litres), 0))
                      .join(SavingLog, SavingLog.society_id == Society.id, isouter=True)
                      .where(Society.ward_id == user.ward_id)
                      .where((SavingLog.day >= since) | (SavingLog.id.is_(None)))
                      .group_by(Society.id).order_by(func.coalesce(func.sum(SavingLog.litres), 0).desc())).all()
    mine = db.scalar(select(func.coalesce(func.sum(SavingLog.litres), 0)).where(SavingLog.user_id == user.id,
                                                                                 SavingLog.day >= since))
    recent = db.scalars(select(SavingLog).where(SavingLog.society_id == user.society_id).order_by(SavingLog.id.desc()).limit(8)).all() \
        if user.society_id else []
    return {"days": days, "societies": [{"id": r[0], "name": r[1], "households": r[2], "litres": round(r[3]),
                                         "per_household": round(r[3] / r[2]) if r[2] else None} for r in rows],
            "mine_litres": round(mine or 0),
            "recent": [{"action": s.action, "litres": s.litres, "day": s.day.isoformat(), "is_demo": s.is_demo} for s in recent]}
