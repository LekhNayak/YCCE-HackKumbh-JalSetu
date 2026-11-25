import { useTranslation } from "react-i18next";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Truck } from "lucide-react";
import type { Outlook, Reading, SupplyDay, WellLite } from "../lib/types";
import { fmtDate, fmtNum } from "../lib/format";
import { useApp } from "../context";

const ts = (d: string) => new Date(d + "T00:00:00").getTime();
const WELL_COLORS = ["#0039D3", "#5B7BE0", "#8FA6EC", "#1A3383"];
const axisStyle = { fontSize: 11, fill: "#56617F" };

function DateTick({ lang }: { lang: "en" | "mr" | "hi" }) {
  return (v: number) => fmtDate(new Date(v).toISOString().slice(0, 10), lang, { month: "short", year: "2-digit" });
}

/** District level (depth) over time, then the forecast median with its 80% range. Deeper water is lower. */
export function DistrictChart({ observed, outlook, months = 18 }: {
  observed: { weekly: [string, number][]; daily_recent: [string, number][] }; outlook: Outlook; months?: number;
}) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const since = ts(outlook.issue_date) - months * 30.4 * 86400e3;
  const recentStart = observed.daily_recent[0]?.[0] ?? "9999";
  const obs = [...observed.weekly.filter(([d]) => d < recentStart), ...observed.daily_recent]
    .filter(([d, v]) => v !== null && ts(d) >= since).map(([d, v]) => ({ x: ts(d), obs: Math.round(-v * 100) / 100 }));
  const fc = [{ x: ts(outlook.issue_date), med: outlook.depth_now_m, band: [outlook.depth_now_m, outlook.depth_now_m] as [number, number] },
    ...(["t+7", "t+14", "t+30"] as const).filter((k) => outlook.horizons[k]).map((k) => {
      const h = outlook.horizons[k]!;
      return { x: ts(h.target_date), med: h.depth_q50, band: [h.depth_q10, h.depth_q90] as [number, number] };
    })];
  const data = [...obs, ...fc].sort((a, b) => a.x - b.x);
  return (
    <div className="h-72 w-full lg:h-[21rem]">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E7ECF7" vertical={false} />
          <XAxis dataKey="x" type="number" scale="time" domain={["dataMin", "dataMax"]} tick={axisStyle} tickFormatter={DateTick({ lang })} />
          <YAxis reversed tick={axisStyle} width={44} domain={["auto", "auto"]} tickFormatter={(v) => fmtNum(v, lang)} unit=" m" />
          <Tooltip labelFormatter={(v) => fmtDate(new Date(v as number).toISOString().slice(0, 10), lang)}
                   formatter={(v: number | number[], n) => [Array.isArray(v) ? `${fmtNum(v[0], lang)}–${fmtNum(v[1], lang)} m` : `${fmtNum(v, lang)} m`, n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area dataKey="band" name={t("gw.band")} stroke="none" fill="#FA5E00" fillOpacity={0.18} isAnimationActive={false} connectNulls />
          <Line dataKey="obs" name={t("gw.observed")} stroke="#0A1F66" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="med" name={t("gw.forecast")} stroke="#FA5E00" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Real nearby sensor wells (depth) + the society's own borewell readings (flagged ones in red). */
export function WellsChart({ wells, readings = [], months = 12 }: { wells: WellLite[]; readings?: Reading[]; months?: number }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const end = Math.max(...wells.map((w) => ts(w.last)), ...readings.map((r) => ts(r.day)));
  const since = end - months * 30.4 * 86400e3;
  const series = wells.slice(0, 4).map((w) => {
    const start = w.daily_recent[0]?.[0] ?? "9999";
    return { w, data: [...w.weekly.filter(([d]) => d < start), ...w.daily_recent].filter(([d]) => ts(d) >= since)
      .map(([d, v]) => ({ x: ts(d), y: Math.round(-v * 100) / 100 })) };
  });
  const ok = readings.filter((r) => r.status !== "flagged").map((r) => ({ x: ts(r.day), y: r.depth_m }));
  const bad = readings.filter((r) => r.status === "flagged").map((r) => ({ x: ts(r.day), y: r.depth_m }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <ComposedChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E7ECF7" vertical={false} />
          <XAxis dataKey="x" type="number" scale="time" domain={[since, end]} allowDuplicatedCategory={false} tick={axisStyle} tickFormatter={DateTick({ lang })} />
          <YAxis dataKey="y" reversed tick={axisStyle} width={44} domain={["auto", "auto"]} unit=" m" tickFormatter={(v) => fmtNum(v, lang)} />
          <Tooltip labelFormatter={(v) => fmtDate(new Date(v as number).toISOString().slice(0, 10), lang)} formatter={(v: number, n) => [`${fmtNum(v, lang)} m`, n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map(({ w, data }, i) => (
            <Line key={w.code} data={data} dataKey="y" name={`${w.name} (${w.agency}, ${fmtNum(w.km, lang)} km)`} stroke={WELL_COLORS[i]}
                  strokeWidth={1.6} dot={false} isAnimationActive={false} />
          ))}
          {ok.length > 0 && <Scatter data={ok} dataKey="y" name={t("gw.our_borewell")} fill="#FA5E00" isAnimationActive={false} />}
          {bad.length > 0 && <Scatter data={bad} dataKey="y" name={t("gw.flagged")} fill="#C62F2F" shape="diamond" isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Past 30-day forecasts against what actually happened (walk-forward tests). */
export function ProofChart({ rows }: { rows: (string | number | null)[][] }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const data = rows.map((r) => ({ x: ts(r[1] as string), actual: -(r[2] as number), fc: -(r[4] as number),
    band: [-(r[5] as number), -(r[3] as number)] as [number, number] }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E7ECF7" vertical={false} />
          <XAxis dataKey="x" type="number" scale="time" domain={["dataMin", "dataMax"]} tick={axisStyle} tickFormatter={DateTick({ lang })} />
          <YAxis reversed tick={axisStyle} width={44} domain={["auto", "auto"]} unit=" m" tickFormatter={(v) => fmtNum(v, lang)} />
          <Tooltip labelFormatter={(v) => fmtDate(new Date(v as number).toISOString().slice(0, 10), lang)}
                   formatter={(v: number | number[], n) => [Array.isArray(v) ? `${fmtNum(v[0], lang)}–${fmtNum(v[1], lang)} m` : `${fmtNum(v, lang)} m`, n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area dataKey="band" name={t("gw.band")} stroke="none" fill="#5B7BE0" fillOpacity={0.15} isAnimationActive={false} />
          <Line dataKey="actual" name={t("gw.proof_actual")} stroke="#0A1F66" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="fc" name={t("gw.proof_fc")} stroke="#FA5E00" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 60-day calendar: one square per day, weeks as columns (Mon at top). */
export function SupplyCalendar({ days }: { days: SupplyDay[] }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  if (!days.length) return null;
  const first = new Date(days[0].day + "T00:00:00");
  const offset = (first.getDay() + 6) % 7;
  const cells: (SupplyDay | null)[] = [...Array(offset).fill(null), ...days];
  const color = (s: SupplyDay) => (s.state === "came" ? "bg-brand" : s.state === "none" ? "bg-[#FFB27F]" : "bg-slate-200");
  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 justify-start gap-1" style={{ gridAutoColumns: "minmax(0, 28px)" }}>
        {cells.map((c, i) => c ? (
          <div key={i} className={`aspect-square w-full rounded-[6px] ${color(c)}`}
               title={`${fmtDate(c.day, lang)} · ${t(c.state === "came" ? "society.cal_came" : c.state === "none" ? "society.cal_none" : "society.cal_unknown")}${c.hours ? ` · ${c.hours} h` : ""}`} />
        ) : <div key={i} className="aspect-square w-full" />)}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-brand" />{t("society.cal_came")}</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-[#FFB27F]" />{t("society.cal_none")}</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-slate-200" />{t("society.cal_unknown")}</span>
      </div>
    </div>
  );
}

/** Tanker loads as trucks: one truck = 10 loads of 10,000 L. */
export function TruckPictogram({ loads, size = 22 }: { loads: number; size?: number }) {
  const trucks = Math.min(20, loads / 10);
  const full = Math.floor(trucks);
  return (
    <div className="flex flex-wrap gap-1.5" aria-hidden>
      {Array.from({ length: Math.ceil(trucks) }, (_, i) => (
        <Truck key={i} size={size} className={i === 0 ? "text-accent" : "text-brand"} style={{ opacity: i < full ? 1 : 0.35 }} />
      ))}
    </div>
  );
}
