import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import { FlaskConical, MapPin, Target, Waves } from "lucide-react";
import { useApp } from "../context";
import { useApi } from "../lib/api";
import type { Outlook, Reading, WellLite } from "../lib/types";
import { fmtDate, fmtNum } from "../lib/format";
import { ErrorBox, Loading, RealBadge, Tile } from "../components/Bits";
import { DistrictChart, ProofChart, WellsChart } from "../components/Charts";
import OutlookCard from "../components/OutlookCard";
import MapView, { homePin, named, pin } from "../components/MapView";
import { liveWells } from "./Society";

interface District { outlook: Outlook; observed: { weekly: [string, number][]; daily_recent: [string, number][]; last_date: string };
  latest_district: { data_version: string; last_date: string; level_m: number } }
interface Backtest { rows: (string | number | null)[][]; metrics: { test_set: string; mae_m: number; error_vs_no_change: number; coverage_pct: number }[] }
interface Wells { society: { id: number; name: string; lat: number; lon: number }; wells: WellLite[]; last_date: string; source: string }

export default function Groundwater() {
  const { t } = useTranslation();
  const { user, lang, setVisible } = useApp();
  const dist = useApi<District>("/api/groundwater/district");
  const bt = useApi<Backtest>("/api/groundwater/backtest?horizon=t%2B30&step=4");
  const socs = useApi<{ id: number }[]>(user && !user.society_id ? "/api/societies" : null);
  const sid = user?.society_id ?? socs.data?.[0]?.id;
  const wells = useApi<Wells>(sid ? `/api/groundwater/wells?society_id=${sid}&n=8` : null);
  const bw = useApi<{ readings: Reading[] }>(sid ? `/api/societies/${sid}/borewell` : null);
  const locked = bt.data?.metrics.find((m) => m.test_set.startsWith("locked"));

  useEffect(() => {
    if (dist.data) setVisible({ page: "groundwater", outlook: { depth_now_m: dist.data.outlook.depth_now_m, issue_date: dist.data.outlook.issue_date,
      stale: dist.data.outlook.stale, horizons: dist.data.outlook.horizons }, test_30d: locked,
      nearby_wells: wells.data?.wells.slice(0, 4).map((w) => ({ name: w.name, agency: w.agency, km: w.km, last: w.last, depth_m: -w.latest_m })) });
  }, [dist.data, locked, wells.data, setVisible]);

  const draw = useCallback((map: L.Map) => {
    if (!wells.data) return;
    const s = wells.data.society;
    const layers: L.Layer[] = [named(L.marker([s.lat, s.lon], { icon: homePin() }), `${s.name} · ${t("gw.you")}`)];
    for (const w of wells.data.wells) {
      const facts = `(${w.agency}) · ${fmtNum(w.km, lang)} km`, last = `${fmtNum(-w.latest_m, lang)} m · ${t("gw.well_last", { date: fmtDate(w.last, lang) })}`;
      layers.push(named(L.marker([w.lat, w.lon], { icon: pin(w.agency === "CGWB" ? "#0A1F66" : "#0039D3", 14) }),
        `<b>${w.name}</b> ${facts}<br/>${last}`, `${w.name} ${facts}, ${last}`));
    }
    const g = L.featureGroup(layers).addTo(map);
    map.fitBounds(g.getBounds(), { padding: [24, 24] });
    return () => { g.remove(); };
  }, [wells.data, lang, t]);

  if (dist.error) return <ErrorBox msg={dist.error} retry={dist.reload} />;
  const live = wells.data ? liveWells(wells.data.wells, wells.data.last_date) : [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("nav.groundwater")}</h1>
        <RealBadge />
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5">{dist.data ? <OutlookCard o={dist.data.outlook} /> : <Loading h={360} />}</div>
        <Tile className="lg:col-span-7" title={t("gw.chart_title", { district: dist.data ? t(`place.${dist.data.outlook.district}`, { defaultValue: dist.data.outlook.district }) : "" })} sub={t("gw.chart_sub")} icon={Waves} guide="groundwater-chart">
          {dist.data ? <DistrictChart observed={dist.data.observed} outlook={dist.data.outlook} /> : <Loading h={280} />}
          {dist.data && wells.data && (
            <p className="mt-2 text-xs text-ink-muted">{t("gw.data_note", { fv: dist.data.outlook.data_version, wd: fmtDate(wells.data.last_date, lang) })}</p>
          )}
        </Tile>

        <Tile className="lg:col-span-5" title={wells.data ? t("gw.map_title", { name: wells.data.society.name }) : t("gw.wells_title")} icon={MapPin} guide="wells-map">
          {wells.data ? <MapView center={[wells.data.society.lat, wells.data.society.lon]} zoom={11} height={400} draw={draw} label={t("gw.wells_title")} /> : <Loading h={340} />}
          <div className="mt-2 flex gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-brand-navy" />CGWB</span>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-brand" />GSDA</span>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-accent" />{t("gw.you")}</span>
          </div>
        </Tile>

        <Tile className="lg:col-span-7" title={t("gw.wells_title")} icon={Waves}
              sub={wells.data ? t("gw.wells_sub", { date: fmtDate(wells.data.last_date, lang) }) : undefined}
              right={bw.data?.readings.some((r) => r.is_demo) ? <span className="chip bg-accent-soft text-accent-text sm:shrink-0 sm:whitespace-nowrap"><FlaskConical size={12} />{t("gw.our_borewell")}: {t("common.demo_data")}</span> : null}>
          {wells.data && bw.data ? <WellsChart wells={live.length >= 2 ? live : wells.data.wells} readings={bw.data.readings} /> : <Loading h={280} />}
          {wells.data && (
            <ul className="mt-3 grid gap-1 text-xs text-ink-muted sm:grid-cols-2">
              {wells.data.wells.slice(0, 8).map((w) => (
                <li key={w.code} className="flex justify-between gap-2 rounded-lg bg-plane px-2 py-1">
                  <span className="truncate"><b className="text-ink">{w.name}</b> · {w.agency} · {fmtNum(w.km, lang)} km</span>
                  <span className="shrink-0">{fmtNum(-w.latest_m, lang)} m · {fmtDate(w.last, lang, { day: "numeric", month: "short" })}</span>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        <Tile className="lg:col-span-12" title={t("gw.proof_title")} sub={t("gw.proof_sub")} icon={Target} tone="accent" guide="proof-chart">
          <div className="grid gap-5 lg:grid-cols-[1fr_17rem]">
            {bt.data ? <ProofChart rows={bt.data.rows} /> : <Loading h={250} />}
            {locked && (
              <div className="card-sky flex flex-col justify-center">
                <div className="text-4xl font-bold text-brand">{t("gw.proof_stat", { pct: Math.round((1 - locked.error_vs_no_change) * 100) })}</div>
                <p className="mt-1 text-sm text-ink-muted">{t("gw.proof_stat_sub")}</p>
                <p className="mt-3 text-sm">{t("gw.proof_mae", { m: fmtNum(locked.mae_m, lang, 2) })}</p>
                <p className="text-sm">{t("gw.proof_cov", { pct: Math.round(locked.coverage_pct) })}</p>
                <p className="mt-3 text-xs text-ink-faint">{dist.data?.outlook.engine} · {dist.data?.outlook.district}</p>
              </div>
            )}
          </div>
        </Tile>
      </div>
    </div>
  );
}
