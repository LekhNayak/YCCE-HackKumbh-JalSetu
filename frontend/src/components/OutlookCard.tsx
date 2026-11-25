import { useTranslation } from "react-i18next";
import { Clock, TrendingDown, TrendingUp, Waves, Minus, HelpCircle } from "lucide-react";
import type { Outlook } from "../lib/types";
import { fmtDate, fmtNum } from "../lib/format";
import { useApp } from "../context";
import { RealBadge, Tile } from "./Bits";
import ListenButton from "./ListenButton";

const DIR_ICON = { falling: TrendingDown, rising: TrendingUp, steady: Minus, uncertain: HelpCircle } as const;
const KEYS = ["t+7", "t+14", "t+30"] as const;

/** District groundwater outlook: depth now, then 7/14/30 days ahead with the 80% range on one shared depth scale. */
export default function OutlookCard({ o, compact = false }: { o: Outlook; compact?: boolean }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const rows = KEYS.filter((k) => o.horizons[k]).map((k) => ({ k, h: o.horizons[k]! }));
  const lo = Math.min(o.depth_now_m, ...rows.map((r) => r.h.depth_q10)) - 0.3;
  const hi = Math.max(o.depth_now_m, ...rows.map((r) => r.h.depth_q90)) + 0.3;
  const pos = (d: number) => `${((d - lo) / (hi - lo)) * 100}%`;
  const h30 = o.horizons["t+30"];
  const acc = o.accuracy["t+30"];
  const speak = [
    h30 ? t("outlook.speak", { district: t(`place.${o.district}`, { defaultValue: o.district }), now: fmtNum(o.depth_now_m, lang), d30: fmtNum(h30.depth_q50, lang),
                                lo: fmtNum(h30.depth_q10, lang), hi: fmtNum(h30.depth_q90, lang) }) : "",
    o.stale ? t("outlook.speak_stale", { date: fmtDate(o.issue_date, lang) }) : "",
  ].join(" ");

  return (
    <Tile variant="navy" className="flex h-full flex-col" title={t("home.outlook_title")} icon={Waves} guide="outlook-card"
          sub={t("outlook.district_note", { district: t(`place.${o.district}`, { defaultValue: o.district }) })}
          right={<ListenButton text={speak} dark />}>
      <div className="flex items-end gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-blue-100/80">{t("outlook.now")}</div>
          <div className="text-4xl font-bold tabnum">{fmtNum(o.depth_now_m, lang)} <span className="text-lg font-medium">m</span></div>
        </div>
        {h30 && (() => { const Icon = DIR_ICON[h30.direction]; return (
          <span className="chip mb-2 bg-white/10 text-white"><Icon size={14} aria-hidden /> {t(`outlook.${h30.direction}`)}</span>); })()}
      </div>

      <div className="mt-4 space-y-3 lg:space-y-5">
        {rows.map(({ k, h }) => (
          <div key={k}>
            <div className="mb-1 flex justify-between text-xs text-blue-100/90">
              <span>{t("outlook.in_days", { n: k.slice(2) })} · {fmtDate(h.target_date, lang, { day: "numeric", month: "short" })}</span>
              <span className="tabnum font-semibold text-white">{fmtNum(h.depth_q50, lang)} m <span className="font-normal text-blue-100/80">{t("outlook.expected")}</span></span>
            </div>
            <div className="relative h-3 rounded-full bg-white/10" aria-label={t("outlook.range", { lo: fmtNum(h.depth_q10, lang), hi: fmtNum(h.depth_q90, lang) })}>
              <div className="absolute inset-y-0 rounded-full bg-[#FF9A5C]/60" style={{ left: pos(h.depth_q10), width: `calc(${pos(h.depth_q90)} - ${pos(h.depth_q10)})` }} />
              <div className="absolute -top-1 h-5 w-1 rounded bg-[#FF9A5C]" style={{ left: pos(h.depth_q50) }} />
              <div className="absolute -top-1.5 h-6 w-0.5 bg-white/80" style={{ left: pos(o.depth_now_m) }} title={t("outlook.now")} />
            </div>
            {!compact && <div className="mt-0.5 text-[11px] text-blue-100/70">{t("outlook.range", { lo: fmtNum(h.depth_q10, lang), hi: fmtNum(h.depth_q90, lang) })}</div>}
          </div>
        ))}
      </div>

      <div className="mt-auto">
      {o.stale && (
        <p className="mt-4 flex gap-2 rounded-xl bg-[#FF9A5C]/15 p-3 text-xs text-orange-100"><Clock size={14} className="mt-0.5 shrink-0" aria-hidden />{t("outlook.stale")}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-blue-100/80">
        <RealBadge />
        <span>{t("outlook.issued", { date: fmtDate(o.issue_date, lang), engine: o.engine })}</span>
        {acc && !compact && <span>{t("outlook.accuracy", { pct: Math.round((1 - acc.error_vs_no_change) * 100) })}</span>}
      </div>
      </div>
    </Tile>
  );
}
