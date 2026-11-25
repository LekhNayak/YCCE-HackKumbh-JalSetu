import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import { ArrowRight, BellRing, Building2, Clock, Flame, Map as MapIcon, RefreshCw, Ticket as TicketIcon } from "lucide-react";
import { useApp } from "../context";
import { api, useApi } from "../lib/api";
import type { Alert, Text3, Ticket } from "../lib/types";
import { ago, fmtNum } from "../lib/format";
import { DemoBadge, ErrorBox, Kpi, Loading, StatusChip, Tile } from "../components/Bits";
import MapView, { named, pin } from "../components/MapView";
import PriorityMap from "../components/PriorityMap";
import AlertBubble from "../components/AlertBubble";

interface Overview {
  ward: { id: number; name: Text3; town: string; utility: Text3; polygon: [number, number][] };
  societies: { id: number; name: string; households: number; water_days_pct: number | null; on_time_pct: number | null;
               borewell_m: number | null; danger_depth_m: number; has_flagged_reading: boolean; is_demo: boolean; lat: number; lon: number }[];
  tickets: Record<string, number>; escalated: number; median_hours_to_fix: number | null;
}
const FLOW = ["open", "assigned", "in_progress", "resolved"] as const;
const NEXT: Record<string, string> = { open: "assigned", assigned: "in_progress", in_progress: "resolved" };
const STATUS_COLOR: Record<string, string> = { open: "#C62F2F", assigned: "#0039D3", in_progress: "#D97706", resolved: "#0E8A5F" };

export default function Ward() {
  const { t } = useTranslation();
  const { lang, setVisible } = useApp();
  const ov = useApi<Overview>("/api/wards/mine/overview");
  const tickets = useApi<Ticket[]>("/api/leaks");
  const hot = useApi<{ lat: number; lon: number; count: number; open: number }[]>("/api/leaks/hotspots");
  const alerts = useApi<Alert[]>("/api/alerts?limit=12");
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ov.data) setVisible({ page: "ward", ward: ov.data.ward.name.en, tickets: ov.data.tickets, escalated: ov.data.escalated,
      median_hours_to_fix: ov.data.median_hours_to_fix, societies: ov.data.societies.map((s) => ({ name: s.name, water_days_pct: s.water_days_pct,
      tankers_on_time_pct: s.on_time_pct, borewell_m: s.borewell_m, flagged: s.has_flagged_reading })) });
  }, [ov.data, setVisible]);

  const move = async (tk: Ticket) => {
    await api(`/api/leaks/${tk.id}`, { method: "PATCH", json: { status: NEXT[tk.status] } });
    tickets.reload(); ov.reload(); hot.reload(); alerts.reload();
  };
  const runChecks = async () => {
    const r = await api<{ created: number[]; forecast_stale: boolean }>("/api/alerts/run-checks", { method: "POST" });
    setCheckMsg(`${t("ward.checks_done", { n: r.created.length })}${r.forecast_stale ? ` · ${t("ward.checks_stale")}` : ""}`);
    alerts.reload();
  };

  const draw = useCallback((map: L.Map) => {
    if (!ov.data || !tickets.data) return;
    const ring = ov.data.ward.polygon.map(([lo, la]) => [la, lo] as [number, number]);
    const layers: L.Layer[] = [L.polygon(ring, { color: "#0039D3", weight: 2, fillOpacity: 0.04, dashArray: "6 6" })];
    for (const h of hot.data ?? []) if (h.count >= 2) {
      layers.push(L.circle([h.lat, h.lon], { radius: 90 + 45 * h.count, color: "#FA5E00", weight: 1, fillColor: "#FA5E00", fillOpacity: 0.18 })
        .bindTooltip(t("ward.hotspot_n", { n: h.count })));
    }
    for (const s of ov.data.societies) layers.push(L.circleMarker([s.lat, s.lon], { radius: 5, color: "#0A1F66", weight: 1, fillOpacity: 0.6 }).bindTooltip(s.name));
    for (const tk of tickets.data) {
      layers.push(named(L.marker([tk.lat, tk.lon], { icon: pin(STATUS_COLOR[tk.status], 15) }),
        `#${tk.id} · ${t(`leaks.cat.${tk.category}`)} · ${t(`leaks.status.${tk.status}`)}`));
    }
    const g = L.featureGroup(layers).addTo(map);
    map.fitBounds(g.getBounds(), { padding: [20, 20] });
    return () => { g.remove(); };
  }, [ov.data, tickets.data, hot.data, t]);

  if (ov.error) return <ErrorBox msg={ov.error} retry={ov.reload} />;
  if (!ov.data) return <Loading h={300} />;
  const o = ov.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{o.ward.name[lang]}</h1>
          <p className="text-sm text-ink-muted">{o.ward.town} · {o.ward.utility[lang]}</p>
        </div>
        <DemoBadge />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label={t("ward.kpi_open")} value={o.tickets.open} tone="accent" />
        <Kpi label={t("ward.kpi_assigned")} value={o.tickets.assigned} />
        <Kpi label={t("ward.kpi_progress")} value={o.tickets.in_progress} />
        <Kpi label={t("ward.kpi_resolved")} value={o.tickets.resolved} />
        <Kpi label={t("ward.kpi_escalated")} value={o.escalated} tone="accent" icon={Flame} />
        <Kpi label={t("ward.kpi_median")} value={o.median_hours_to_fix !== null ? t("ward.hours", { n: fmtNum(o.median_hours_to_fix, lang, 0) }) : "–"} icon={Clock} />
      </div>

      <Tile title={t("ward.board")} icon={TicketIcon} tone="accent" guide="ticket-board">
        {!tickets.data ? <Loading h={200} /> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {FLOW.map((s) => (
              <div key={s} className="rounded-2xl bg-plane p-3">
                <div className="mb-2 flex items-center justify-between"><StatusChip status={s} label={t(`leaks.status.${s}`)} />
                  <span className="text-xs text-ink-muted">{tickets.data!.filter((x) => x.status === s).length}</span></div>
                <div className="space-y-2">
                  {tickets.data!.filter((x) => x.status === s).slice(0, 6).map((tk) => (
                    <div key={tk.id} className="rounded-xl border border-line bg-white p-3 text-sm shadow-sm">
                      <div className="flex justify-between gap-2"><b>#{tk.id} · {t(`leaks.cat.${tk.category}`)}</b>{tk.sla.escalated && <span className="chip bg-red-50 text-bad">{t("leaks.escalated")}</span>}</div>
                      <div className="text-xs text-ink-muted">{ago(tk.created_at, lang)}</div>
                      {tk.photo && <img src={tk.photo} alt="" className="mt-2 h-24 w-full rounded-lg object-cover" />}
                      {tk.note && <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{tk.note}</p>}
                      {NEXT[tk.status] && (
                        <button className="btn-soft mt-2 w-full py-1.5 text-xs" onClick={() => void move(tk)}>
                          {t("ward.move", { status: t(`leaks.status.${NEXT[tk.status]}`) })} <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Tile>

      <div className="grid gap-5 lg:grid-cols-12">
        <Tile className="lg:col-span-6" title={t("ward.hotspots")} icon={Flame} tone="accent" guide="hotspot-map">
          <MapView center={[21.2717, 78.586]} zoom={14} height={360} draw={draw} label={t("ward.hotspots")} />
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-muted">
            {FLOW.map((s) => <span key={s} className="flex items-center gap-1"><i className="h-3 w-3 rounded-full" style={{ background: STATUS_COLOR[s] }} />{t(`leaks.status.${s}`)}</span>)}
          </div>
        </Tile>

        <Tile className="lg:col-span-6" title={t("ward.societies")} icon={Building2}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-muted">
                <th className="py-2">{t("ward.col_society")}</th><th>{t("ward.col_water")}</th><th>{t("ward.col_tanker")}</th>
                <th>{t("ward.col_borewell")}</th><th>{t("ward.col_readings")}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {o.societies.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 font-medium">{s.name}</td>
                    <td className="tabnum">{s.water_days_pct ?? "–"}%</td>
                    <td className="tabnum">{s.on_time_pct ?? "–"}%</td>
                    <td className="tabnum">{s.borewell_m !== null ? `${fmtNum(s.borewell_m, lang)} / ${fmtNum(s.danger_depth_m, lang)} m` : "–"}</td>
                    <td><StatusChip status={s.has_flagged_reading ? "flagged" : "accepted"} label={t(s.has_flagged_reading ? "ward.flag_yes" : "ward.flag_no")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tile>

        <Tile className="lg:col-span-7" title={t("ward.priority")} sub={t("ward.priority_sub")} icon={MapIcon} guide="priority-map">
          <PriorityMap />
        </Tile>

        <Tile className="lg:col-span-5" title={t("ward.outbox")} icon={BellRing} guide="outbox"
              right={<button className="btn-soft px-3 py-1.5 text-xs" onClick={() => void runChecks()}><RefreshCw size={12} />{t("ward.run_checks")}</button>}>
          {checkMsg && <p className="mb-2 rounded-lg bg-brand-sky px-3 py-2 text-xs text-brand">{checkMsg}</p>}
          <div className="scroll-fade max-h-[34rem] space-y-2 overflow-y-auto rounded-lg pr-1 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30" tabIndex={0} role="region" aria-label={t("ward.outbox")}>
            {(alerts.data ?? []).map((a) => <AlertBubble key={a.id} a={a} showStatus />)}
          </div>
        </Tile>
      </div>
    </div>
  );
}
