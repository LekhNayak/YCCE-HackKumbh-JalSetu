import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Calculator, CheckSquare, CloudRain, Square } from "lucide-react";
import { api, useApi } from "../lib/api";
import { fmtNum } from "../lib/format";
import { useApp } from "../context";
import { DemoBadge, Loading, Tile } from "./Bits";
import { TruckPictogram } from "./Charts";
import ListenButton from "./ListenButton";

interface Unit { id: number; kind: string; label: string; catchment_m2: number; done: number; total: number; is_demo: boolean;
  checks: { id: number; item: string; done: boolean; done_at: string | null }[]; estimate: { litres_per_year: number } }
interface Rwh { rain: { rain_mm: number; source: string; label: string }; runoff_factors: Record<string, number>; units: Unit[];
  society_roof_m2: number }

export function RwhChecklist({ societyId, canTick }: { societyId: number; canTick: boolean }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const q = useApi<Rwh>(`/api/societies/${societyId}/rwh`);
  if (!q.data) return <Loading h={280} />;
  const toggle = async (id: number, done: boolean) => {
    await api(`/api/rwh/checks/${id}`, { method: "POST", json: { done } });
    q.reload();
  };
  return (
    <Tile title={t("rwh.checklist")} icon={CloudRain} guide="rwh-checklist" right={<DemoBadge show={q.data.units.some((u) => u.is_demo)} />}>
      <div className="grid gap-4 md:grid-cols-2">
        {q.data.units.map((u) => (
          <div key={u.id} className="rounded-xl border border-line p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{u.label}</div>
                <div className="text-xs text-ink-muted">{t("rwh.estimate", { litres: fmtNum(u.estimate.litres_per_year, lang, 0) })}</div>
              </div>
              <span className="chip shrink-0 whitespace-nowrap bg-brand-sky text-brand">{t("rwh.done_n", { done: u.done, total: u.total })}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${(100 * u.done) / u.total}%` }} /></div>
            <ul className="mt-3 space-y-1">
              {u.checks.map((c) => (
                <li key={c.id}>
                  <button disabled={!canTick} onClick={() => void toggle(c.id, !c.done)}
                          className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm hover:bg-brand-sky disabled:cursor-default">
                    {c.done ? <CheckSquare size={18} className="shrink-0 text-good" /> : <Square size={18} className="shrink-0 text-ink-faint" />}
                    <span className={c.done ? "text-ink-muted line-through" : ""}>{t(`rwh.item.${c.item}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Tile>
  );
}

export function RwhCalculator({ societyId }: { societyId: number }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const q = useApi<Rwh>(`/api/societies/${societyId}/rwh`);
  const [area, setArea] = useState(500);
  const [rain, setRain] = useState(1000);
  const [surface, setSurface] = useState("concrete_roof");
  useEffect(() => { if (q.data) { setArea(q.data.society_roof_m2); setRain(q.data.rain.rain_mm); } }, [q.data]);
  if (!q.data) return <Loading h={280} />;
  const factor = q.data.runoff_factors[surface] ?? 0.8;
  const litres = Math.round(area * rain * factor);
  const loads = litres / 10000;
  const speak = `${t("rwh.result", { litres: fmtNum(litres, lang, 0) })}. ${t("rwh.tankers", { n: fmtNum(loads, lang, 0) })}.`;
  return (
    <Tile className="flex h-full flex-col" title={t("rwh.calc")} icon={Calculator} tone="accent" guide="rwh-calculator" right={<ListenButton text={speak} />}>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1.35fr]">
        <label className="text-sm"><span className="mb-1 block text-xs text-ink-muted">{t("rwh.area")}</span>
          <input className="input tabnum" type="number" min={1} max={100000} value={area} onChange={(e) => setArea(Number(e.target.value) || 0)} /></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-ink-muted">{t("rwh.rain")}</span>
          <input className="input tabnum" type="number" min={1} max={5000} value={rain} onChange={(e) => setRain(Number(e.target.value) || 0)} /></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-ink-muted">{t("rwh.surface")}</span>
          <select className="input" value={surface} onChange={(e) => setSurface(e.target.value)}>
            {Object.keys(q.data.runoff_factors).map((k) => <option key={k} value={k}>{t(`rwh.runoff.${k}`)}</option>)}
          </select></label>
      </div>
      <div className="mt-4 flex flex-1 flex-col rounded-2xl bg-brand-navy p-4 text-white">
        <div className="text-xs text-blue-100/80">{t("rwh.formula")}: {fmtNum(area, lang, 0)} × {fmtNum(rain, lang, 0)} × {factor}</div>
        <div className="mt-1 text-3xl font-bold tabnum text-[#FF9A5C] sm:text-4xl">{t("rwh.result", { litres: fmtNum(litres, lang, 0) })}</div>
        <div className="text-sm">≈ {t("rwh.tankers", { n: fmtNum(loads, lang, 0) })}</div>
        <div className="mt-auto pt-3"><div className="rounded-xl bg-white p-3"><TruckPictogram loads={loads} size={32} /></div></div>
        <div className="mt-1 text-[11px] text-blue-100/70">{t("rwh.truck_key")}</div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{t("rwh.rain_source", { label: q.data.rain.label })}</p>
    </Tile>
  );
}
