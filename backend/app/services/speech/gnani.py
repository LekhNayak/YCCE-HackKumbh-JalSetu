"""Read-aloud with Gnani Vachana text-to-speech (one API key; Marathi, Hindi, English).

API (docs.gnani.ai quick start): POST https://api.vachana.ai/api/v1/tts/inference, header `X-API-Key-ID`, JSON
{text, voice, model, language, speed, audio_config{...}} -> WAV bytes. Without GNANI_API_KEY the frontend falls back
to the browser's built-in voice.
"""
import hashlib
import threading
import time

import httpx

from ...config import settings

LANG_CODES = {"en": "en-IN", "mr": "mr-IN", "hi": "hi-IN"}
TIMEOUT = httpx.Timeout(30.0, connect=10.0)
RETRIES = 4
MAX_CLIPS_IN_MEMORY = 200

# Gnani allows one active request per account (HTTP 429 otherwise): calls wait their turn, and a 429 is retried.
_lock = threading.Lock()
_clips: dict[str, bytes] = {}
_client = None


class GnaniError(RuntimeError):
    pass


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=TIMEOUT, limits=httpx.Limits(max_keepalive_connections=4, keepalive_expiry=120))
    return _client


def _post(*args, **kwargs):
    for attempt in range(RETRIES):
        r = _http().post(*args, **kwargs)
        if r.status_code != 429 or attempt == RETRIES - 1:
            return r
        time.sleep(0.6 * (attempt + 1))


def _cached(key):
    if key in _clips:
        return _clips[key]
    f = settings.tts_cache_dir / f"{key}.wav"
    try:
        if f.exists():
            _clips[key] = f.read_bytes()
            return _clips[key]
    except OSError:
        pass
    return None


def _store(key, clip):
    _clips[key] = clip
    while len(_clips) > MAX_CLIPS_IN_MEMORY:
        _clips.pop(next(iter(_clips)))
    try:
        settings.tts_cache_dir.mkdir(parents=True, exist_ok=True)
        (settings.tts_cache_dir / f"{key}.wav").write_bytes(clip)
    except OSError:
        pass


def enabled() -> bool:
    return bool(settings.gnani_api_key)


def synthesize(text: str, lang: str) -> tuple[bytes, str]:
    """Text -> WAV. Identical text/language/voice gives the identical clip, so clips are cached in memory and on disk."""
    if not settings.gnani_api_key:
        raise GnaniError("speech not configured")
    voice = settings.gnani_tts_voices.get(lang) or settings.gnani_tts_voice
    rate = settings.gnani_tts_sample_rate
    code = LANG_CODES.get(lang, "en-IN")
    key = hashlib.sha256("|".join([text, code, voice, settings.gnani_tts_model, str(rate)]).encode()).hexdigest()
    clip = _cached(key)
    if clip is not None:
        return clip, "audio/wav"
    payload = {"text": text, "voice": voice, "model": settings.gnani_tts_model, "language": code, "speed": 1.0,
               "audio_config": {"sample_rate": rate, "num_channels": 1, "sample_width": 2,
                                "encoding": "linear_pcm", "container": "wav"}}
    with _lock:
        clip = _cached(key)
        if clip is not None:
            return clip, "audio/wav"
        r = _post(settings.gnani_tts_url, json=payload,
                  headers={"X-API-Key-ID": settings.gnani_api_key, "Content-Type": "application/json"})
    if r.status_code != 200 or not r.content:
        raise GnaniError(f"TTS HTTP {r.status_code}: {r.text[:200]}")
    _store(key, r.content)
    return r.content, r.headers.get("content-type", "audio/wav").split(";")[0]
