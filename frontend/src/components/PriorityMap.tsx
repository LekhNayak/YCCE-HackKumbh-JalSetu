import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import MapView from "./MapView";
import { useApi } from "../lib/api";
import { Loading } from "./Bits";

interface PRow { district: string; rank: number; score: number; flags: string[]; stage_pct: number | null; category: string | null;
  vs_usual_m: number | null; status: string; forecast_t30_direction: string | null }

const SHADES = ["#EEF3FF", "#C9D6FA", "#8FA6EC", "#4F6FD8", "#1A3383", "#0A1F66"];

/** Maharashtra districts coloured by the rule-based priority score (real district data). */
export default function PriorityMap({ highlight = "Nagpur", height = 360 }: { highlight?: string; height?: number }) {
  const { t } = useTranslation();
  const pri = useApi<{ districts: PRow[] }>("/api/districts/priority");
  const geo = useApi<GeoJSON.FeatureCollection>("/api/geo/districts");
  const rows = useMemo(() => new Map((pri.data?.districts ?? []).map((r) => [r.district, r])), [pri.data]);

  const draw = useCallback((map: L.Map) => {
    if (!geo.data) return;
    const layer = L.geoJSON(geo.data, {
      style: (f) => {
        const r = rows.get(f?.properties?.district);
        const isHi = f?.properties?.district === highlight;
        return { fillColor: SHADES[Math.min(5, r?.score ?? 0)], fillOpacity: 0.9, color: isHi ? "#FA5E00" : "#ffffff",
                 weight: isHi ? 3 : 1 };
      },
      onEachFeature: (f, l) => {
        const r = rows.get(f.properties?.district);
        const flags = (r?.flags ?? []).map((k) => t(`ward.flag.${k}`)).join(", ") || "—";
        l.bindTooltip(`<b>${f.properties?.district}</b> · #${r?.rank ?? "–"} · ${t("ward.score", { n: r?.score ?? 0 })}<br/>${flags}`, { sticky: true });
      },
    }).addTo(map);
    map.fitBounds(layer.getBounds(), { padding: [6, 6] });
    return () => { layer.remove(); };
  }, [geo.data, rows, highlight, t]);

  if (!geo.data || !pri.data) return <Loading h={height} />;
  const top = pri.data.districts.slice(0, 5);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
      <MapView center={[19.4, 76.6]} zoom={6} tiles={false} height={height} draw={draw} label={t("ward.priority")} />
      <div>
        <div className="eyebrow mb-2">{t("ward.top")}</div>
        <ol className="space-y-2">
          {top.map((r) => (
            <li key={r.district} className="rounded-xl border border-line p-2.5 text-sm">
              <div className="flex justify-between font-semibold"><span>{r.rank}. {r.district}</span><span className="text-brand">{r.score}</span></div>
              <div className="mt-1 text-xs text-ink-muted">{r.flags.map((k) => t(`ward.flag.${k}`)).join(" · ")}</div>
            </li>
          ))}
          {rows.get(highlight) && (
            <li className="rounded-xl border-2 border-accent/60 p-2.5 text-sm">
              <div className="flex justify-between font-semibold"><span>{rows.get(highlight)!.rank}. {highlight}</span><span className="text-brand">{rows.get(highlight)!.score}</span></div>
              <div className="mt-1 text-xs text-ink-muted">{rows.get(highlight)!.flags.map((k) => t(`ward.flag.${k}`)).join(" · ") || "—"}</div>
            </li>
          )}
        </ol>
        <div className="mt-3 flex items-center gap-1" aria-hidden>{SHADES.map((c, i) => <i key={i} className="h-3 flex-1 rounded-sm" style={{ background: c }} />)}</div>
        <div className="mt-1 flex justify-between text-[11px] text-ink-faint"><span>0</span><span>5+</span></div>
      </div>
    </div>
  );
}
