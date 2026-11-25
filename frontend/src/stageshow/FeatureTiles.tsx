import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Truck, Wrench } from "lucide-react";
import { Stage } from "./kit/stage";
import { useApp } from "../context";
import { fmtDate, fmtNum } from "../lib/format";
import "./look.css";
import "./tiles.css";

// Three stills under the hero, one kind each (references/bento.md): a chart on
// navy, one component, and a count. The copy is page text; each picture is its
// own Stage, drawn at the size it is shown.

// The district series and the run issued on 4 Jun 2026, from
// backend/data/forecast_run.json (depth in metres). Dated in the tile, as the
// app dates every forecast.
const ISSUED = "2026-06-04";
const OBSERVED: [string, number][] = [
  ["2026-03-22", 4.53], ["2026-03-29", 4.93], ["2026-04-05", 5.03], ["2026-04-12", 5.05], ["2026-04-19", 5.24], ["2026-04-26", 5.44],
  ["2026-05-03", 5.64], ["2026-05-10", 5.69], ["2026-05-17", 5.89], ["2026-05-24", 6.0], ["2026-05-31", 6.23], [ISSUED, 6.31],
];
const FORECAST: { day: string; lo: number; mid: number; hi: number }[] = [
  { day: ISSUED, lo: 6.31, mid: 6.31, hi: 6.31 },
  { day: "2026-06-11", lo: 5.85, mid: 6.35, hi: 6.54 },
  { day: "2026-06-18", lo: 5.71, mid: 6.28, hi: 6.64 },
  { day: "2026-07-04", lo: 4.29, mid: 5.47, hi: 5.91 },
];

// The calculator's own rule: area x rainfall x runoff factor, 10,000 L a load.
// Rainfall is the Nagpur default in backend/data/rain_nagpur.json.
const ROOF_M2 = 250;
const RAIN_MM = 1336;
const RUNOFF = 0.8;
const LITRES = Math.round(ROOF_M2 * RAIN_MM * RUNOFF);
const LOADS = Math.round(LITRES / 10000);

const PIC = { width: 400, height: 220 };
const NARROW = { below: 400, width: 350, height: 220 };

function Tile({ title, body, tone, children }: { title: string; body: string; tone?: "navy" | "sky"; children: ReactNode }) {
  return (
    <article className="ft-tile" data-tone={tone}>
      <div className="ft-copy">
        <h2 className="ft-title">{title}</h2>
        <p className="ft-body">{body}</p>
      </div>
      <div className="ft-pic" aria-hidden>{children}</div>
    </article>
  );
}

function ForecastPicture() {
  const { t } = useTranslation();
  const { lang } = useApp();
  return (
    <Stage {...PIC} compact={NARROW} className="js-look ft ft-gw">
      {(_s, _r, layout) => {
        const W = layout === "compact" ? NARROW.width : PIC.width;
        const left = 24, right = W - 112, top = 34, bottom = 168;
        const t0 = Date.parse(OBSERVED[0][0]), t1 = Date.parse(FORECAST[3].day);
        const x = (d: string) => left + ((Date.parse(d) - t0) / (t1 - t0)) * (right - left);
        const y = (m: number) => top + ((m - 4.1) / (6.8 - 4.1)) * (bottom - top);      // deeper is lower
        const line = (p: [string, number][]) => p.map(([d, m], i) => `${i ? "L" : "M"}${x(d).toFixed(1)} ${y(m).toFixed(1)}`).join("");
        const band = `${line(FORECAST.map((f) => [f.day, f.lo]))}${[...FORECAST].reverse().map((f) => `L${x(f.day).toFixed(1)} ${y(f.hi).toFixed(1)}`).join("")}Z`;
        const end = FORECAST[3];
        return (
          <>
            <svg className="ft-gw__plot" width={W} height={PIC.height} aria-hidden>
              {[4.5, 5.5, 6.5].map((m) => <line key={m} x1={left} x2={right} y1={Math.round(y(m)) + 0.5} y2={Math.round(y(m)) + 0.5} stroke="rgba(255,255,255,0.09)" />)}
              <path d={band} fill="#ff9a5c" fillOpacity={0.28} />
              <path d={line(OBSERVED)} fill="none" stroke="#fff" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
              <path d={line(FORECAST.map((f) => [f.day, f.mid]))} fill="none" stroke="#ff9a5c" strokeWidth={2.5} strokeDasharray="5 5" strokeLinecap="round" />
              <circle cx={x(ISSUED)} cy={y(6.31)} r={4.5} fill="#fff" />
              <circle cx={x(end.day)} cy={y(end.mid)} r={4.5} fill="#ff9a5c" />
            </svg>
            <span className="ft-gw__now" style={{ left: x(ISSUED), top: y(6.31) + 16 }}>{fmtNum(6.313, lang)} m</span>
            <span className="ft-gw__then" style={{ left: x(end.day) + 14, top: y(end.mid) }}>
              {fmtNum(5.473, lang)} m
              <span>{t("outlook.in_days", { n: 30 })}</span>
            </span>
            <span className="ft-gw__foot">{t("start.tile_gw_issued", { date: fmtDate(ISSUED, lang) })}</span>
          </>
        );
      }}
    </Stage>
  );
}

function LeakPicture() {
  const { t } = useTranslation();
  const steps = ["open", "assigned", "in_progress", "resolved"] as const;
  return (
    <Stage {...PIC} compact={NARROW} className="js-look ft ft-leak">
      {() => (
        <div className="ft-ticket">
          <div className="ft-ticket__head">
            <span className="ft-ticket__icon"><Wrench size={18} aria-hidden /></span>
            <span className="ft-ticket__title">{t("leaks.cat.pipe_burst")}</span>
            <span className="ft-ticket__id">#14</span>
          </div>
          <div className="ft-steps">
            {steps.map((s, i) => (
              <div key={s} className="ft-step" data-state={i < 2 ? "done" : i === 2 ? "now" : "next"}>
                <i>{i < 2 && <Check size={11} strokeWidth={3.2} aria-hidden />}</i>
                <span>{t(`leaks.status.${s}`)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Stage>
  );
}

function RainPicture() {
  const { lang } = useApp();
  return (
    <Stage {...PIC} compact={NARROW} className="js-look ft ft-rain">
      {() => (
        <>
          <span className="ft-rain__big">{fmtNum(LITRES, lang, 0)} L</span>
          <span className="ft-rain__sum">{ROOF_M2} m² × {fmtNum(RAIN_MM, lang, 0)} mm × {RUNOFF}</span>
          <span className="ft-rain__loads">
            {Array.from({ length: LOADS }, (_, i) => <Truck key={i} size={24} strokeWidth={2} aria-hidden />)}
          </span>
        </>
      )}
    </Stage>
  );
}

export default function FeatureTiles() {
  const { t } = useTranslation();
  return (
    <div className="ft-grid">
      <Tile title={t("home.outlook_title")} body={t("start.tile_gw")} tone="navy"><ForecastPicture /></Tile>
      <Tile title={t("leaks.title")} body={t("start.tile_leak")}><LeakPicture /></Tile>
      <Tile title={t("rwh.title")} body={t("start.tile_rwh", { n: LOADS })} tone="sky"><RainPicture /></Tile>
    </div>
  );
}
