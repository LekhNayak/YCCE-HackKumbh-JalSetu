"""Tables for community data. Real sensor and forecast data are not stored here (they are files in backend/data).

Every seeded row has is_demo=True so the UI can label it "Demo data".
"""
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .clock import now
from .db import Base


class Ward(Base):
    __tablename__ = "ward"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[dict] = mapped_column(JSON)                  # {"en": ..., "mr": ..., "hi": ...}
    town: Mapped[str] = mapped_column(String(80))
    utility: Mapped[dict] = mapped_column(JSON)               # {"en": "Katol Municipal Council - Water Supply", ...}
    polygon: Mapped[list] = mapped_column(JSON)               # [[lon, lat], ...] closed ring
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)


class Society(Base):
    __tablename__ = "society"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    ward_id: Mapped[int] = mapped_column(ForeignKey("ward.id"))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    households: Mapped[int] = mapped_column(Integer)
    roof_area_m2: Mapped[float] = mapped_column(Float)
    danger_depth_m: Mapped[float] = mapped_column(Float)      # borewell runs dry below this depth (m below ground)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    ward: Mapped[Ward] = relationship()


class User(Base):
    __tablename__ = "user"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20))              # resident | society_admin | ward_officer
    society_id: Mapped[int | None] = mapped_column(ForeignKey("society.id"), nullable=True)
    ward_id: Mapped[int] = mapped_column(ForeignKey("ward.id"))
    lang: Mapped[str] = mapped_column(String(5), default="en")
    persona: Mapped[bool] = mapped_column(Boolean, default=False)   # shown on the demo sign-in screen
    blurb: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    society: Mapped[Society | None] = relationship()


class SupplyLog(Base):
    __tablename__ = "supply_log"
    __table_args__ = (UniqueConstraint("client_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    society_id: Mapped[int] = mapped_column(ForeignKey("society.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    day: Mapped[date] = mapped_column(Date, index=True)
    came: Mapped[bool] = mapped_column(Boolean)
    hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    pressure: Mapped[str | None] = mapped_column(String(8), nullable=True)   # low | ok | good
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # offline queue id, so a retry is not a duplicate
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class TankerTrip(Base):
    __tablename__ = "tanker_trip"
    id: Mapped[int] = mapped_column(primary_key=True)
    society_id: Mapped[int] = mapped_column(ForeignKey("society.id"), index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime)
    capacity_l: Mapped[int] = mapped_column(Integer, default=10000)
    source: Mapped[str] = mapped_column(String(12), default="municipal")    # municipal | private
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    checked_in_by: Mapped[int | None] = mapped_column(ForeignKey("user.id"), nullable=True)
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class BorewellReading(Base):
    __tablename__ = "borewell_reading"
    id: Mapped[int] = mapped_column(primary_key=True)
    society_id: Mapped[int] = mapped_column(ForeignKey("society.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    day: Mapped[date] = mapped_column(Date)
    depth_m: Mapped[float] = mapped_column(Float)              # metres below ground (positive)
    status: Mapped[str] = mapped_column(String(10))            # accepted | flagged | baseline
    z: Mapped[float | None] = mapped_column(Float, nullable=True)
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class RwhUnit(Base):
    __tablename__ = "rwh_unit"
    id: Mapped[int] = mapped_column(primary_key=True)
    society_id: Mapped[int] = mapped_column(ForeignKey("society.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))              # recharge_pit | storage_tank
    label: Mapped[str] = mapped_column(String(80))
    catchment_m2: Mapped[float] = mapped_column(Float)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    checks: Mapped[list["RwhCheck"]] = relationship(back_populates="unit", order_by="RwhCheck.id")


class RwhCheck(Base):
    __tablename__ = "rwh_check"
    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("rwh_unit.id"), index=True)
    item: Mapped[str] = mapped_column(String(40))              # key into the checklist (i18n in the frontend)
    done_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    done_by: Mapped[int | None] = mapped_column(ForeignKey("user.id"), nullable=True)
    unit: Mapped[RwhUnit] = relationship(back_populates="checks")


class LeakTicket(Base):
    __tablename__ = "leak_ticket"
    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    society_id: Mapped[int | None] = mapped_column(ForeignKey("society.id"), nullable=True)
    ward_id: Mapped[int | None] = mapped_column(ForeignKey("ward.id"), nullable=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    category: Mapped[str] = mapped_column(String(20))          # pipe_burst | overflow | open_tap | illegal | drain
    note: Mapped[str] = mapped_column(Text, default="")
    photo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="open")   # open | assigned | in_progress | resolved
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    history: Mapped[list] = mapped_column(JSON, default=list)  # [{status, at, by}]
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Photo(Base):
    """A leak photo. Served at /uploads/<name>."""
    __tablename__ = "photo"
    name: Mapped[str] = mapped_column(String(40), primary_key=True)
    mime: Mapped[str] = mapped_column(String(20))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class ForumThread(Base):
    __tablename__ = "forum_thread"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    tag: Mapped[str] = mapped_column(String(20))               # saving | rwh | borewell | tanker | general
    lang: Mapped[str] = mapped_column(String(5), default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    author: Mapped[User] = relationship()
    replies: Mapped[list["ForumReply"]] = relationship(order_by="ForumReply.id")


class ForumReply(Base):
    __tablename__ = "forum_reply"
    id: Mapped[int] = mapped_column(primary_key=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("forum_thread.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    author: Mapped[User] = relationship()


class Vote(Base):
    __tablename__ = "vote"
    __table_args__ = (UniqueConstraint("thread_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("forum_thread.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))


class SavingLog(Base):
    __tablename__ = "saving_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    society_id: Mapped[int] = mapped_column(ForeignKey("society.id"), index=True)
    day: Mapped[date] = mapped_column(Date)
    action: Mapped[str] = mapped_column(String(30))            # key into SAVING_ACTIONS
    litres: Mapped[float] = mapped_column(Float)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Alert(Base):
    __tablename__ = "alert"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(30))              # forecast_falling | danger_depth | tanker_arrived | tanker_late | leak_update | reading_flagged
    society_id: Mapped[int | None] = mapped_column(ForeignKey("society.id"), nullable=True, index=True)
    ward_id: Mapped[int | None] = mapped_column(ForeignKey("ward.id"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("user.id"), nullable=True)
    level: Mapped[str] = mapped_column(String(8), default="info")     # info | warn | good
    text: Mapped[dict] = mapped_column(JSON)                   # {"en": ..., "mr": ..., "hi": ...}
    channel: Mapped[str] = mapped_column(String(10), default="whatsapp")
    status: Mapped[str] = mapped_column(String(10), default="simulated")   # simulated | sent | failed
    provider_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dedupe_key: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
