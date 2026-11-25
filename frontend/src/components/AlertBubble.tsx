import { useTranslation } from "react-i18next";
import { CheckCheck, MessageCircle } from "lucide-react";
import type { Alert } from "../lib/types";
import { fmtDate, fmtTime } from "../lib/format";
import { useApp } from "../context";
import { DemoBadge } from "./Bits";

const TONE = { warn: "bg-accent", good: "bg-good", info: "bg-brand" } as const;

/** One alert as it would look on WhatsApp, in the reader's language. */
export default function AlertBubble({ a, showStatus = false }: { a: Alert; showStatus?: boolean }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  return (
    <div className="rounded-xl border border-[#CFE9D6] bg-[#F1FBF3] p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="chip gap-1.5 bg-white text-ink"><i className={`h-2 w-2 shrink-0 rounded-full ${TONE[a.level]}`} aria-hidden />{t(`alert.${a.kind}`)}</span>
        {showStatus && (
          <span className="flex items-center gap-1 text-emerald-700"><MessageCircle size={12} aria-hidden />
            {t(a.status === "sent" ? "ward.wa_sent" : a.status === "failed" ? "ward.wa_failed" : "ward.wa_simulated")}</span>
        )}
        <DemoBadge show={a.is_demo} />
      </div>
      <p className="text-sm leading-snug text-ink">{a.text[lang] ?? a.text.en}</p>
      <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-ink-muted">
        {fmtDate(a.created_at, lang, { day: "numeric", month: "short" })} {fmtTime(a.created_at, lang)}
        <CheckCheck size={13} strokeWidth={2.4} className="text-sky-600" aria-hidden />
      </div>
    </div>
  );
}
