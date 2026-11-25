import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, BellRing, CalendarDays, CloudRain, Droplet, Gauge, HandHeart, Truck, Waves } from "lucide-react";
import { useApp } from "../context";
import { api, useApi } from "../lib/api";
import type { Alert, Dashboard, Reading, SupplyDay, Trip, WellLite } from "../lib/types";
import { fmtDate, fmtNum, fmtTime } from "../lib/format";
import { DemoBadge, ErrorBox, Kpi, Loading, RealBadge, StatusChip, Tile } from "../components/Bits";
import { SupplyCalendar, WellsChart } from "../components/Charts";
import BorewellPanel from "../components/BorewellPanel";
import { RwhCalculator, RwhChecklist } from "../components/RwhPanel";
import AlertBubble from "../components/AlertBubble";

export function useHashScroll() {
  const loc = useLocation();
  useEffect(() => {
    if (!loc.hash) return;
    const id = loc.hash.slice(1);
    const tm = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    return () => window.clearTimeout(tm);
  }, [loc.hash]);
}

/** Wells that reported within 45 days of the newest reading (stopped wells say little about this season). */
export function liveWells(wells: WellLite[], lastDate?: string) {
  if (!lastDate) return wells;
  const cutoff = new Date(new Date(lastDate + "T00:00:00").getTime() - 45 * 86400e3).toISOString().slice(0, 10);
  return wells.filter((w) => w.last >= cutoff);
}

function ScheduleTanker({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [when, setWhen] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await api("/api/tankers", { method: "POST", json: { scheduled_at: when, capacity_l: 10000, source: "municipal" } });
    setWhen(""); onDone();
  };
  return (
    <form onSubmit={submit} className="mt-4 rounded-xl bg-brand-sky p-3">
      <div className="mb-2 text-sm font-semibold">{t("society.schedule")}</div>
      <div className="flex gap-2">
        <input className="input" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} aria-label={t("society.when")} />
        <button className="btn-primary">{t("society.schedule_btn")}</button>
      </div>
    </form>
  );
}

export default function Society() {
  const { t } = useTranslation();
  const { user, lang, setVisible } = useApp();
  useHashScroll();
  const sid = user?.society_id;
  const dash = useApi<Dashboard>(sid ? `/api/societies/${sid}/dashboard` : null);
  const supply = useApi<{ days: SupplyDay[]; water_days_pct: number }>(sid ? `/api/societies/${sid}/supply?days=60` : null);
  const tk = useApi<{ trips: Trip[]; on_time_pct: number | null; counts: Record<string, number> }>(sid ? `/api/societies/${sid}/tankers` : null);
  const wells = useApi<{ wells: WellLite[]; last_date: string }>(sid ? `/api/groundwater/wells?society_id=${sid}&n=6` : null);
  const bw = useApi<{ readings: Reading[]; danger_depth_m: number }>(sid ? `/api/societies/${sid}/borewell` : null);
  const alerts = useApi<Alert[]>("/api/alerts?limit=8");
  const d = dash.data;

  useEffect(() => {
    if (d) setVisible({ page: "society", society: d.society.name, water_days_pct_30: d.supply.water_days_pct, tankers_on_time_pct: d.tankers.on_time_pct,
                        tanker_counts: d.tankers.counts, borewell_latest: d.borewell.latest, danger_depth_m: d.borewell.danger_depth_m,
                        rwh: d.rwh, savings_30d_l: d.savings_30d_l });
  }, [d, setVisible]);

  if (dash.error) return <ErrorBox msg={dash.error} retry={dash.reload} />;
  if (!d || !sid) return <div className="grid gap-4 md:grid-cols-3"><Loading /><Loading /><Loading /></div>;
  const isAdmin = user?.role === "society_admin";
  const refresh = () => { dash.reload(); bw.reload(); alerts.reload(); };
  const live = liveWells(wells.data?.wells ?? [], wells.data?.last_date);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{d.society.name}</h1>
          <p className="text-sm text-ink-muted">{t("society.households", { n: d.society.households })} · {fmtDate(d.today, lang)}</p>
        </div>
        <DemoBadge show={d.society.is_demo} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label={t("society.kpi_water")} value={`${d.supply.water_days_pct ?? "–"}%`} sub={t("society.kpi_water_sub")} icon={Droplet} />
        <Kpi label={t("society.kpi_tanker")} value={`${d.tankers.on_time_pct ?? "–"}%`} sub={t("society.kpi_tanker_sub")} icon={Truck} tone="accent" />
        <Kpi label={t("society.kpi_borewell")} value={d.borewell.latest ? `${fmtNum(d.borewell.latest.depth_m, lang)} m` : "–"}
             sub={t("society.kpi_borewell_sub", { m: fmtNum(d.borewell.danger_depth_m, lang) })} icon={Gauge} />
        <Kpi label={t("society.kpi_rwh")} value={`${d.rwh.checks_done}/${d.rwh.checks_total}`} sub={t("society.kpi_rwh_sub")} icon={CloudRain} />
        <Kpi label={t("society.kpi_saved")} value={fmtNum(d.savings_30d_l, lang, 0)} sub={t("society.kpi_saved_sub")} icon={HandHeart} tone="accent" />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Tile className="lg:col-span-5" title={t("society.calendar")} icon={CalendarDays} guide="supply-calendar"
              right={<DemoBadge show={supply.data?.days.some((x) => x.demo) ?? false} />}>
          {supply.data ? <SupplyCalendar days={supply.data.days} /> : <Loading h={150} />}
        </Tile>

        <Tile className="lg:col-span-7" title={t("society.tankers")} icon={Truck} tone="accent" guide="tanker-stats"
              sub={t("home.on_time", { pct: tk.data?.on_time_pct ?? "–" })}>
          {tk.data ? (
            <>
              <div className="mb-3 flex h-3 overflow-hidden rounded-full" aria-hidden>
                {(["on_time", "late", "missed"] as const).map((k) => (
                  <div key={k} className={k === "on_time" ? "bg-good" : k === "late" ? "bg-accent" : "bg-bad"}
                       style={{ width: `${(100 * (tk.data!.counts[k] ?? 0)) / Math.max(1, Object.values(tk.data!.counts).reduce((a, b) => a + b, 0))}%` }} />
                ))}
              </div>
              <div className="mb-3 flex gap-3 text-xs">
                {(["on_time", "late", "missed"] as const).map((k) => <StatusChip key={k} status={k} label={`${t(`society.trip.${k}`)} · ${tk.data!.counts[k] ?? 0}`} />)}
              </div>
              <div className="eyebrow mb-1">{t("society.recent_trips")}</div>
              <ul className="scroll-fade max-h-44 divide-y divide-line overflow-y-auto text-sm">
                {tk.data.trips.slice(0, 10).map((tr) => (
                  <li key={tr.id} className="grid grid-cols-[1fr_5rem_6.5rem] items-center gap-2 py-1.5">
                    <span>{fmtDate(tr.scheduled_at, lang, { day: "numeric", month: "short" })} · {fmtTime(tr.scheduled_at, lang)}</span>
                    <span className="text-xs text-ink-muted">{tr.arrived_at ? fmtTime(tr.arrived_at, lang) : ""}</span>
                    <span className="justify-self-end"><StatusChip status={tr.status} label={t(`society.trip.${tr.status}`)} /></span>
                  </li>
                ))}
              </ul>
              {isAdmin && <ScheduleTanker onDone={tk.reload} />}
            </>
          ) : <Loading h={150} />}
        </Tile>

        <Tile className="lg:col-span-8" title={t("gw.wells_title")} icon={Waves} guide="groundwater-chart"
              sub={wells.data ? t("gw.wells_sub", { date: fmtDate(wells.data.last_date, lang) }) : undefined}
              right={<div className="flex items-center gap-2"><RealBadge /><Link to="/groundwater" className="btn-soft px-3 py-1.5 text-xs">{t("nav.groundwater")} <ArrowRight size={12} /></Link></div>}>
          {wells.data && bw.data ? <WellsChart wells={live.length >= 2 ? live : wells.data.wells} readings={bw.data.readings} /> : <Loading h={280} />}
        </Tile>

        <div id="borewell" className="lg:col-span-4 scroll-mt-24">
          {bw.data ? <BorewellPanel readings={bw.data.readings} dangerM={bw.data.danger_depth_m} onSaved={refresh} canAdd /> : <Loading h={280} />}
        </div>

        <div id="rwh" className="lg:col-span-7 scroll-mt-24"><RwhChecklist societyId={sid} canTick /></div>
        <div className="lg:col-span-5"><RwhCalculator societyId={sid} /></div>

        <Tile className="lg:col-span-12" title={t("ward.outbox")} icon={BellRing} guide="outbox">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(alerts.data ?? []).slice(0, 8).map((a) => <AlertBubble key={a.id} a={a} showStatus />)}
          </div>
        </Tile>
      </div>
    </div>
  );
}
