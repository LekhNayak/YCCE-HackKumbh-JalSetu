"""Site-guide chat: helps people use JalSetu and explains the numbers on their screen.

- "groq":  GROQ_API_KEY (and optionally _2, _3, ...) set. Groq's OpenAI-compatible API in JSON mode -> {reply, actions}.
           Keys are used in turn; a rate-limited or failing key passes the request to the next one.
- "guide": no key, or Groq failed. An offline intent matcher over app/chat/faq.json (en / mr / hi).
Actions (navigate / highlight) are checked against an allowlist before they reach the browser.
"""
import itertools
import json
import re
from functools import lru_cache
from pathlib import Path

import httpx

from ..config import settings

CHAT_DIR = Path(__file__).resolve().parents[1] / "chat"
LANG_NAME = {"en": "English", "mr": "Marathi (मराठी)", "hi": "Hindi (हिन्दी)"}
ELEMENTS = {"lang-switch", "persona-switch", "chat-button", "log-supply", "tanker-card", "outlook-card", "alerts-card",
            "supply-calendar", "tanker-stats", "groundwater-chart", "borewell-form", "wells-map", "proof-chart",
            "rwh-checklist", "rwh-calculator", "leak-form", "ticket-board", "hotspot-map", "priority-map",
            "outbox", "savings-card", "forum", "tips"}
ROUTE_RE = re.compile(r"^/(home|society|groundwater|leaks(/new)?|ward|community)?$")
ROLE_NAME = {"resident": "a resident", "society_admin": "a housing-society secretary", "ward_officer": "a ward water officer"}
MAX_CONTEXT_CHARS = 4000
RETRY_STATUS = {401, 403, 429, 500, 502, 503, 504}
_next_key = itertools.count()
_client = None


@lru_cache(maxsize=1)
def site_guide():
    return (CHAT_DIR / "site_guide.md").read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def faq():
    return json.loads((CHAT_DIR / "faq.json").read_text(encoding="utf-8"))


def get_client() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=20.0, limits=httpx.Limits(max_keepalive_connections=4, keepalive_expiry=120))
    return _client


def clean_actions(actions):
    out = []
    for a in actions or []:
        if not isinstance(a, dict):
            continue
        if a.get("type") == "navigate" and isinstance(a.get("route"), str) and ROUTE_RE.match(a["route"]):
            out.append({"type": "navigate", "route": a["route"]})
        elif a.get("type") == "highlight" and a.get("element") in ELEMENTS:
            out.append({"type": "highlight", "element": a["element"]})
    return out[:3]


def guide_reply(message, lang):
    text = f" {message.lower()} "
    best, best_score = None, 0
    for intent in faq()["intents"]:
        score = 0
        for lk in (lang, "en"):
            for kw in intent["keywords"].get(lk, []):
                if kw.lower() in text:
                    score += 2 if lk == lang else 1
        if score > best_score:
            best, best_score = intent, score
    if best is None:
        return {"reply": faq()["fallback"].get(lang, faq()["fallback"]["en"]), "actions": [], "mode": "guide"}
    return {"reply": best["answer"].get(lang, best["answer"]["en"]), "actions": clean_actions(best.get("actions")),
            "mode": "guide", "intent": best["id"]}


def system_prompt(lang, role, page, visible_context):
    ctx = json.dumps(visible_context or {}, ensure_ascii=False)[:MAX_CONTEXT_CHARS]
    return f"""You are the JalSetu guide. JalSetu is a community water portal for a residential area. You are talking
to {ROLE_NAME.get(role, "a resident")}. Help them use the site and explain what is on their screen.
Reply in {LANG_NAME.get(lang, "English")}, in at most 4 short, plain sentences.

Rules:
- Only explain this website and the numbers in VISIBLE_CONTEXT. Never invent numbers, dates or places; if a value is not
  in VISIBLE_CONTEXT, say where on the site to find it.
- The groundwater forecast is for the whole district, not one borewell; say so when it matters. Forecasts are uncertain.
- No medical, legal or drilling advice; for repairs and supply complaints point to the leak report or the ward office.
- Do not ask for or repeat personal information. Never show element ids, routes or JSON in the reply text.

You may propose up to 3 actions: {{"type":"navigate","route":"/home|/society|/groundwater|/leaks|/leaks/new|/ward|/community"}},
{{"type":"highlight","element":"<element id from the guide>"}}.
Answer ONLY with JSON: {{"reply": "...", "actions": [...]}}.

SITE GUIDE:
{site_guide()}

CURRENT PAGE: {page or "/"}
VISIBLE_CONTEXT (what the user sees now): {ctx}"""


def groq_reply(req):
    msgs = [{"role": "system", "content": system_prompt(req.lang, req.role, req.page, req.visible_context)}]
    for m in (req.history or [])[-8:]:
        if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str):
            msgs.append({"role": m["role"], "content": m["content"][:1000]})
    msgs.append({"role": "user", "content": req.message[:1000]})
    payload = {"model": settings.groq_model, "messages": msgs, "temperature": 0.2, "max_tokens": 400,
               "response_format": {"type": "json_object"}}
    keys = settings.groq_api_keys
    start = next(_next_key) % len(keys)
    resp = None
    for i in range(len(keys)):
        resp = get_client().post(settings.groq_url, json=payload,
                                 headers={"Authorization": f"Bearer {keys[(start + i) % len(keys)]}"})
        if resp.status_code not in RETRY_STATUS:
            break
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    try:
        data = json.loads(content)
        reply, actions = str(data.get("reply", "")).strip(), data.get("actions", [])
    except (json.JSONDecodeError, AttributeError):
        reply, actions = content.strip(), []
    return {"reply": reply or guide_reply(req.message, req.lang)["reply"], "actions": clean_actions(actions), "mode": "groq"}


def chat(req):
    if not settings.groq_api_keys:
        return guide_reply(req.message, req.lang)
    try:
        return groq_reply(req)
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        out = guide_reply(req.message, req.lang)
        out["note"] = "assistant unavailable, answered from the offline guide"
        return out
