import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Square, Volume2 } from "lucide-react";
import { useApp } from "../context";
import { bcp47 } from "../lib/langs";
import { splitForSpeech } from "../lib/speech";
import { getToken } from "../lib/api";

const clipCache = new Map<string, string>();     // "lang|text" -> object URL, kept for this tab

async function clip(text: string, lang: string): Promise<string> {
  const key = `${lang}|${text}`;
  const hit = clipCache.get(key);
  if (hit) return hit;
  const res = await fetch("/api/speech/tts", {
    method: "POST", headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  clipCache.set(key, url);
  return url;
}

/** Reads a card aloud: Gnani voice from the server when configured, otherwise the browser's own voice. */
export default function ListenButton({ text, className = "", dark = false }: { text: string; className?: string; dark?: boolean }) {
  const { t } = useTranslation();
  const { meta, lang } = useApp();
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const stopRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const server = !!meta?.features.speech && meta.features.speech_languages.includes(lang);
  const browser = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => () => { stopRef.current = true; audioRef.current?.pause(); window.speechSynthesis?.cancel(); }, []);
  if (!server && !browser) return null;

  const stop = () => {
    stopRef.current = true;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setState("idle");
  };

  const playBrowser = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47(lang);
    u.onend = () => setState("idle");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setState("playing");
  };

  const play = async () => {
    if (state !== "idle") return stop();
    stopRef.current = false;
    if (!server) return playBrowser();
    const parts = splitForSpeech(text);
    setState("loading");
    try {
      let next = clip(parts[0], lang);
      for (let i = 0; i < parts.length; i++) {
        const url = await next;
        if (stopRef.current) return;
        if (i + 1 < parts.length) next = clip(parts[i + 1], lang);   // fetch the next piece while this one plays
        const audio = new Audio(url);
        audioRef.current = audio;
        setState("playing");
        await new Promise<void>((resolve) => { audio.onended = () => resolve(); audio.onerror = () => resolve(); void audio.play(); });
      }
      setState("idle");
    } catch {
      if (!stopRef.current && browser) playBrowser(); else setState("idle");
    }
  };

  const warm = () => { if (server && state === "idle") void clip(splitForSpeech(text)[0], lang).catch(() => undefined); };
  const Icon = state === "loading" ? Loader2 : state === "playing" ? Square : Volume2;
  return (
    <button type="button" onClick={play} onPointerEnter={warm} onFocus={warm}
            className={`btn ${dark ? "bg-white/10 text-white hover:bg-white/20" : "btn-soft"} px-3 py-1.5 text-xs ${className}`}
            aria-label={state === "idle" ? t("common.listen") : t("common.stop")}>
      <Icon size={14} className={state === "loading" ? "animate-spin" : ""} aria-hidden />
      {state === "idle" ? t("common.listen") : t("common.stop")}
    </button>
  );
}
