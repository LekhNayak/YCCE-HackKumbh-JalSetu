"""Alerts: write to the outbox in all three languages, and send by WhatsApp (Twilio) when keys are configured.

Without Twilio keys an alert is stored as "simulated" and the app shows it as a WhatsApp-style preview.
"""
from datetime import date, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Alert

MONTHS = {
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "mr": ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"],
    "hi": ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
}
CATEGORY = {
    "pipe_burst": {"en": "burst pipe", "mr": "फुटलेली पाइपलाइन", "hi": "फटी पाइपलाइन"},
    "overflow": {"en": "overflowing tank", "mr": "ओसंडून वाहणारी टाकी", "hi": "ओवरफ़्लो होती टंकी"},
    "open_tap": {"en": "tap left running", "mr": "उघडा राहिलेला नळ", "hi": "खुला छोड़ा नल"},
    "illegal": {"en": "illegal connection", "mr": "बेकायदा नळजोडणी", "hi": "अवैध कनेक्शन"},
    "drain": {"en": "water in drain", "mr": "गटारात वाहणारे पाणी", "hi": "नाली में बहता पानी"},
}
STATUS = {
    "open": {"en": "received", "mr": "नोंदवली", "hi": "दर्ज"},
    "assigned": {"en": "assigned to the utility team", "mr": "पाणीपुरवठा पथकाकडे सोपवली", "hi": "जल-आपूर्ति टीम को सौंपी"},
    "in_progress": {"en": "being repaired", "mr": "दुरुस्ती सुरू", "hi": "मरम्मत जारी"},
    "resolved": {"en": "fixed", "mr": "दुरुस्त झाली", "hi": "ठीक हो गई"},
}
TEMPLATES = {
    "tanker_arrived": {
        "en": "Tanker has arrived at {society} ({time}). Please fill water now.",
        "mr": "{society} येथे टँकर आला आहे ({time}). आत्ताच पाणी भरून घ्या.",
        "hi": "{society} में टैंकर आ गया है ({time})। अभी पानी भर लें।"},
    "tanker_late": {
        "en": "Today's tanker for {society} is late (it was due at {time}).",
        "mr": "{society} साठी आजचा टँकर उशिरा येत आहे (वेळ होती {time}).",
        "hi": "{society} के लिए आज का टैंकर देर से आ रहा है (समय था {time})।"},
    "forecast_falling": {
        "en": "Groundwater alert for {society}: the district water table is likely to drop about {fall_m} m by {date}. Use water carefully and book tankers early.",
        "mr": "{society} साठी भूजल इशारा: {date} पर्यंत जिल्ह्यातील भूजल पातळी सुमारे {fall_m} मीटरने खाली जाण्याची शक्यता आहे. पाणी जपून वापरा आणि टँकर आधीच मागवा.",
        "hi": "{society} के लिए भूजल चेतावनी: {date} तक ज़िले का भूजल-स्तर लगभग {fall_m} मीटर नीचे जा सकता है। पानी सोच-समझकर इस्तेमाल करें और टैंकर पहले से मँगवाएँ।"},
    "danger_depth": {
        "en": "Borewell warning for {society}: water is at {depth_m} m and may reach the {danger_m} m danger depth by {date}.",
        "mr": "{society} बोअरवेल इशारा: पाणी सध्या {depth_m} मीटरवर आहे आणि {date} पर्यंत {danger_m} मीटरच्या धोक्याच्या खोलीपर्यंत जाऊ शकते.",
        "hi": "{society} बोरवेल चेतावनी: पानी अभी {depth_m} मीटर पर है और {date} तक {danger_m} मीटर की ख़तरे वाली गहराई तक पहुँच सकता है।"},
    "leak_new": {
        "en": "New leak report #{id} in {ward}: {category}.",
        "mr": "{ward} मध्ये नवी गळती तक्रार #{id}: {category}.",
        "hi": "{ward} में नई रिसाव शिकायत #{id}: {category}।"},
    "leak_update": {
        "en": "Your leak report #{id} ({category}) is now {status}.",
        "mr": "तुमची गळती तक्रार #{id} ({category}): {status}.",
        "hi": "आपकी रिसाव शिकायत #{id} ({category}): {status}।"},
    "reading_flagged": {
        "en": "A borewell reading from {society} ({depth_m} m) needs a check: it does not match nearby sensor wells.",
        "mr": "{society} मधील बोअरवेल नोंद ({depth_m} मी.) तपासावी लागेल: ती जवळच्या सेन्सर विहिरींशी जुळत नाही.",
        "hi": "{society} की बोरवेल रीडिंग ({depth_m} मी.) जाँचनी होगी: यह पास के सेंसर कुओं से मेल नहीं खाती।"},
}
LEVEL = {"tanker_arrived": "good", "tanker_late": "warn", "forecast_falling": "warn", "danger_depth": "warn",
         "leak_new": "info", "leak_update": "good", "reading_flagged": "warn"}


def fmt_date(iso: str, lang: str) -> str:
    d = date.fromisoformat(iso[:10])
    return f"{d.day} {MONTHS[lang][d.month - 1]}"


def render(kind: str, params: dict) -> dict:
    out = {}
    for lang in ("en", "mr", "hi"):
        p = dict(params)
        if "date" in p:
            p["date"] = fmt_date(p["date"], lang)
        if "category" in p:
            p["category"] = CATEGORY[p["category"]][lang]
        if "status" in p:
            p["status"] = STATUS[p["status"]][lang]
        if isinstance(p.get("ward"), dict):
            p["ward"] = p["ward"].get(lang) or p["ward"]["en"]
        out[lang] = TEMPLATES[kind][lang].format(**p)
    return out


def _send_whatsapp(body: str) -> tuple[str, str | None]:
    if not (settings.twilio_sid and settings.twilio_token and settings.twilio_whatsapp_from and settings.alert_test_to):
        return "simulated", None
    try:
        r = httpx.post(f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_sid}/Messages.json",
                       auth=(settings.twilio_sid, settings.twilio_token), timeout=10,
                       data={"From": settings.twilio_whatsapp_from, "To": settings.alert_test_to, "Body": body})
        r.raise_for_status()
        return "sent", r.json().get("sid")
    except httpx.HTTPError:
        return "failed", None


def emit(db: Session, kind: str, params: dict, *, society_id=None, ward_id=None, user_id=None, lang="en",
         dedupe_key: str | None = None, is_demo=False, created_at: datetime | None = None, send=True) -> Alert | None:
    """Create an alert once (dedupe_key) and send it. Returns None if it already existed."""
    if dedupe_key and db.scalar(select(Alert).where(Alert.dedupe_key == dedupe_key)):
        return None
    text = render(kind, params)
    status, sid = _send_whatsapp(text.get(lang) or text["en"]) if send else ("simulated", None)
    a = Alert(kind=kind, society_id=society_id, ward_id=ward_id, user_id=user_id, level=LEVEL[kind], text=text,
              status=status, provider_id=sid, dedupe_key=dedupe_key, is_demo=is_demo)
    if created_at:
        a.created_at = created_at
    db.add(a)
    db.flush()
    return a
