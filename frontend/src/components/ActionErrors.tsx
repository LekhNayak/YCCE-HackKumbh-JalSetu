import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert, X } from "lucide-react";
import { ApiError } from "../lib/api";

const networkDown = (r: unknown) => r instanceof TypeError && /fetch|network|load failed/i.test(r.message);

/** Any button whose request fails says so, instead of doing nothing. */
export default function ActionErrors() {
  const { t } = useTranslation();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let timer = 0;
    const failed = (e: PromiseRejectionEvent) => {
      const r: unknown = e.reason;
      if (!(r instanceof ApiError) && !networkDown(r)) return;             // a fault in the app itself: leave it to the console
      e.preventDefault();
      if (r instanceof ApiError && r.status === 401) return;               // the sign-in page explains that one
      setMsg(r instanceof ApiError && !r.unreachable ? t("common.action_failed") : t("common.unreachable"));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 7000);
    };
    window.addEventListener("unhandledrejection", failed);
    return () => { window.removeEventListener("unhandledrejection", failed); window.clearTimeout(timer); };
  }, [t]);

  return (
    <div role="alert" className="pointer-events-none fixed inset-x-0 top-20 z-[1200] flex justify-center px-4">
      {msg && (
        <p className="fade-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-red-200 bg-white py-2 pl-4 pr-2 text-sm font-medium text-bad shadow-pop">
          <TriangleAlert size={18} className="shrink-0" aria-hidden />{msg}
          <button type="button" className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
                  onClick={() => setMsg(null)} aria-label={t("common.close")}><X size={16} aria-hidden /></button>
        </p>
      )}
    </div>
  );
}
