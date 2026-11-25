import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, MessageCircle, SendHorizontal, X } from "lucide-react";
import { useApp } from "../context";
import { api } from "../lib/api";
import type { ChatAction } from "../lib/types";
import ListenButton from "./ListenButton";

type Msg = { role: "user" | "assistant"; content: string; actions?: ChatAction[]; mode?: string };

/** Site guide: answers in the chosen language, explains what is on screen, can point at or open a part of the site. */
export default function ChatWidget() {
  const { t } = useTranslation();
  const { lang, user, visible, highlight } = useApp();
  const loc = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);

  const ask = async (message: string) => {
    if (!message.trim() || busy) return;
    const history = msgs.map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setText("");
    setBusy(true);
    try {
      const r = await api<{ reply: string; actions: ChatAction[]; mode: string }>("/api/chat", {
        method: "POST", json: { message, lang, role: user?.role ?? "resident", page: loc.pathname, visible_context: visible, history },
      });
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, actions: r.actions, mode: r.mode }]);
      r.actions.filter((a) => a.type === "highlight").forEach((a) => a.type === "highlight" && highlight(a.element));
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: t("chat.error") }]);
    } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(text); };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} data-guide="chat-button"
                aria-label={t("chat.open")} title={t("chat.open")} className="group fixed bottom-20 right-4 z-[1100] flex items-center rounded-full bg-brand-navy p-4 text-sm font-semibold text-white shadow-pop focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/40 lg:bottom-6">
          <MessageCircle size={20} aria-hidden />
          {/* Closed up at rest: the open label used to cover the buttons under it */}
          <span className="max-w-0 overflow-hidden whitespace-nowrap transition-[max-width,padding] duration-300 group-hover:max-w-[14rem] group-hover:pl-2 group-focus-visible:max-w-[14rem] group-focus-visible:pl-2">{t("chat.open")}</span>
        </button>
      )}
      {open && (
        <div className="fixed bottom-20 right-4 z-[1100] flex h-[32rem] max-h-[75vh] w-[23rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-pop lg:bottom-6"
             role="dialog" aria-label={t("chat.title")}>
          <div className="flex items-center gap-2 bg-brand-navy px-4 py-3 text-white">
            <MessageCircle size={16} aria-hidden />
            <span className="font-semibold">{t("chat.title")}</span>
            <button className="ml-auto rounded-lg p-1 hover:bg-white/10" onClick={() => setOpen(false)} aria-label={t("common.close")}><X size={18} /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            <p className="rounded-xl bg-brand-sky p-3 text-ink">{t("chat.hello")}</p>
            {msgs.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {["s1", "s2", "s3"].map((k) => (
                  <button key={k} className="chip border border-brand-line bg-white py-1 text-brand" onClick={() => void ask(t(`chat.${k}`))}>{t(`chat.${k}`)}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-8 rounded-xl bg-brand p-3 text-white" : "mr-4 space-y-2 rounded-xl border border-line p-3"}>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === "assistant" && (
                  <div className="flex flex-wrap items-center gap-2">
                    {m.actions?.filter((a) => a.type === "navigate").map((a, j) => (
                      <button key={j} className="btn-soft px-2.5 py-1 text-xs" onClick={() => a.type === "navigate" && navigate(a.route)}>
                        {t("chat.go")} <ArrowRight size={12} />
                      </button>
                    ))}
                    {m.actions?.filter((a) => a.type === "highlight").map((a, j) => (
                      <button key={`h${j}`} className="btn-ghost px-2.5 py-1 text-xs" onClick={() => a.type === "highlight" && highlight(a.element)}>{t("chat.show")}</button>
                    ))}
                    <ListenButton text={m.content} />
                    {m.mode && <span className="text-[11px] text-ink-faint">{m.mode === "groq" ? t("chat.mode_groq") : t("chat.mode_guide")}</span>}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="skeleton h-10 w-2/3" />}
            <div ref={end} />
          </div>
          <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("chat.placeholder")} maxLength={1000} />
            <button className="btn-primary px-3" disabled={!text.trim() || busy} aria-label={t("common.send")}><SendHorizontal size={16} /></button>
          </form>
        </div>
      )}
    </>
  );
}
