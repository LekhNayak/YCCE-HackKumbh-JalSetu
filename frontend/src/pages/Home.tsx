import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, CloudRain, Droplet, Gauge, HandHeart, Truck, TriangleAlert, Check, X } from "lucide-react";
import { useApp } from "../context";
import { useApi } from "../lib/api";
import type { Dashboard } from "../lib/types";
import { fmtDate, fmtTime, uid } from "../lib/format";
import { sendOrQueue } from "../lib/offline";
import OutlookCard from "../components/OutlookCard";
import AlertBubble from "../components/AlertBubble";
import ListenButton from "../components/ListenButton";
import { DemoBadge, ErrorBox, Loading, Tile } from "../components/Bits";

export default function Home() {
  const { t } = useTranslation();
  const { user, lang, setVisible } = useApp();
  const dash = useApi<Dashboard>(user?.society_id ? `/api/societies/${user.society_id}/dashboard` : null);
  const [pickHours, setPickHours] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = dash.data;

  useEffect(() => {
    if (d) setVisible({ page: "home", society: d.society.name, my_log_today: d.my_log_today, next_tanker: d.tankers.next,
                        tanker_on_time_pct: d.tankers.on_time_pct, outlook: { depth_now_m: d.outlook.depth_now_m, issue_date: d.outlook.issue_date,
                        stale: d.outlook.stale, t30: d.outlook.horizons["t+30"] }, alerts: d.alerts.slice(0, 3).map((a) => a.text.en) });
  }, [d, setVisible]);

  if (dash.error) return <ErrorBox msg={dash.error} retry={dash.reload} />;
  if (!d) return <div className="grid gap-4 md:grid-cols-2"><Loading h={220} /><Loading h={220} /><Loading h={300} /></div>;

  const log = async (came: boolean, hours?: number) => {
    setBusy(true);
    try {
      const r = await sendOrQueue("/api/supply-logs", { came, hours: hours ?? null, client_id: uid() });
      setNote(r === "queued" ? t("common.offline_saved") : t("common.synced"));
      setPickHours(false);
      if (r === "sent") dash.reload();
      else dash.setData({ ...d, my_log_today: { came, hours: hours ?? null } });
    } finally { setBusy(false); }
  };

  const arrived = async () => {
    if (!d.tankers.next) return;
    setBusy(true);
    try {
      const r = await sendOrQueue(`/api/tankers/${d.tankers.next.id}/arrived`, { client_id: uid() });
      setNote(r === "queued" ? t("common.offline_saved") : t("home.tanker_marked", { time: fmtTime(new Date().toISOString(), lang) }));
      dash.reload();
    } finally { setBusy(false); }
  };

  const mine = d.my_log_today;
  const nt = d.tankers.next;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{t("home.greeting", { name: user?.name.split(" ")[0] })}</h1>
          <p className="text-sm text-ink-muted">{d.society.name} · {fmtDate(d.today, lang, { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <DemoBadge show={d.society.is_demo} />
      </div>
      {note && <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-medium text-good" role="status">{note}</p>}

      <div className="grid gap-5 lg:grid-cols-12">
        <Tile className="flex flex-col lg:col-span-7" title={t("home.water_today")} icon={Droplet} guide="log-supply"
              right={<ListenButton text={mine ? (mine.came ? t("home.logged_came_nohours") : t("home.logged_none")) : t("home.water_today")} />}>
          {mine && !pickHours ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className={`chip py-2 text-sm ${mine.came ? "bg-brand-sky text-brand" : "bg-accent-soft text-accent-text"}`}>
                {mine.came ? <Check size={16} /> : <X size={16} />}
                {mine.came ? (mine.hours ? t("home.logged_came", { hours: t("home.hours_n", { n: mine.hours }) }) : t("home.logged_came_nohours")) : t("home.logged_none")}
              </span>
              <button className="btn-ghost" onClick={() => setPickHours(true)}>{t("home.change")}</button>
            </div>
          ) : pickHours ? (
            <div>
              <div className="mb-2 text-sm font-medium">{t("home.how_long")}</div>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((h) => (
                  <button key={h} disabled={busy} className="btn-soft py-4 text-base" onClick={() => void log(true, h)}>
                    {h === 4 ? t("home.hours_more") : t("home.hours_n", { n: h })}
                  </button>
                ))}
              </div>
              <button className="btn-ghost mt-3 w-full" disabled={busy} onClick={() => void log(false)}>{t("home.none")}</button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <button disabled={busy} className="btn-primary py-6 text-lg" onClick={() => setPickHours(true)}><Droplet size={22} />{t("home.came")}</button>
              <button disabled={busy} className="btn-ghost py-6 text-lg text-accent-text" onClick={() => void log(false)}><X size={22} />{t("home.none")}</button>
            </div>
          )}
          <div className="mt-auto pt-5">
            <div className="eyebrow mb-2">{t("home.this_week")}</div>
            <div className="grid grid-cols-7 gap-2">
              {d.supply.last_30.slice(-7).map((x) => (
                <div key={x.day} className="text-center" title={x.hours ? `${x.hours} h` : undefined}>
                  <div className={`h-9 w-full rounded-xl ${x.state === "came" ? "bg-brand" : x.state === "none" ? "bg-[#FFB27F]" : "bg-slate-200"}`} />
                  <div className="mt-1 text-[11px] text-ink-muted">{fmtDate(x.day, lang, { weekday: "short" })}</div>
                </div>
              ))}
            </div>
          </div>
        </Tile>

        <Tile className="lg:col-span-5" title={t("home.next_tanker")} icon={Truck} tone="accent" guide="tanker-card">
          {nt ? (
            <div className="space-y-3">
              <div className="text-3xl font-bold tabnum">{fmtTime(nt.scheduled_at, lang)}</div>
              <div className="text-sm text-ink-muted">{fmtDate(nt.scheduled_at, lang, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                {t("home.tanker_capacity", { litres: nt.capacity_l.toLocaleString("en-IN"), source: t(`home.source_${nt.source}`) })}</div>
              <button disabled={busy} className="btn-accent w-full py-4 text-base" onClick={() => void arrived()}><Truck size={20} />{t("home.tanker_arrived")}</button>
            </div>
          ) : <p className="text-sm text-ink-muted">{t("home.no_tanker")}</p>}
          {d.tankers.on_time_pct !== null && <p className="mt-3 text-xs text-ink-muted">{t("home.on_time", { pct: d.tankers.on_time_pct })}</p>}
        </Tile>

        <div className="lg:col-span-7"><OutlookCard o={d.outlook} /></div>

        <Tile className="lg:col-span-5" title={t("home.alerts_title")} icon={Bell} guide="alerts-card">
          <div className="space-y-2">
            {d.alerts.length === 0 && <p className="text-sm text-ink-muted">{t("home.no_alerts")}</p>}
            {d.alerts.slice(0, 4).map((a) => <AlertBubble key={a.id} a={a} />)}
          </div>
        </Tile>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-12">
          {[{ to: "/society#borewell", icon: Gauge, label: t("home.quick_reading") },
            { to: "/society#rwh", icon: CloudRain, label: t("home.quick_rwh") },
            { to: "/leaks/new", icon: TriangleAlert, label: t("home.quick_leak") },
            { to: "/community#savings", icon: HandHeart, label: t("home.quick_save") }].map((q) => (
            <Link key={q.to} to={q.to} className="card flex items-center gap-3 p-4 font-medium transition hover:border-brand hover:bg-brand-sky">
              <q.icon size={20} className="shrink-0 text-brand" aria-hidden /> {q.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
