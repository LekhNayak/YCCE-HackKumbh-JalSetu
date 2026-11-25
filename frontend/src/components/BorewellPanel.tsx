import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Gauge, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Reading } from "../lib/types";
import { fmtDate, fmtNum } from "../lib/format";
import { useApp } from "../context";
import { DemoBadge, StatusChip, Tile } from "./Bits";

export function Verdict({ r }: { r: Reading }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const ok = r.status !== "flagged";
  const sign = (x?: number) => (x === undefined ? "–" : `${x > 0 ? "+" : ""}${fmtNum(x, lang, 2)}`);
  return (
    <div className={`rounded-xl border p-3 text-sm ${ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`} role="status">
      <div className="flex items-center gap-2 font-semibold">
        {ok ? <ShieldCheck size={16} className="text-good" /> : <ShieldAlert size={16} className="text-bad" />}
        {t(`borewell.${r.status}`)} · {fmtNum(r.depth_m, lang, 2)} m
      </div>
      <p className="mt-1 text-ink-muted">
        {r.status === "baseline" ? t("borewell.explain_baseline") : t("borewell.explain", {
          change: sign(r.detail.change_m), days: r.detail.window_days, expected: sign(r.detail.expected_change_m), z: fmtNum(r.z, lang, 1) })}
      </p>
      {r.reasons.map((x) => <p key={x} className="mt-1 font-medium text-bad">• {t(`borewell.reason_${x}`)}</p>)}
      {!!r.detail.wells?.length && (
        <p className="mt-2 text-xs text-ink-muted">{t("borewell.compared_with")}: {r.detail.wells.map((w) =>
          `${w.name} (${w.agency}, ${fmtNum(w.km, lang)} km, ${sign(w.change_m)} m)`).join(" · ")}</p>
      )}
    </div>
  );
}

export default function BorewellPanel({ readings, dangerM, onSaved, canAdd }: {
  readings: Reading[]; dangerM: number; onSaved: () => void; canAdd: boolean;
}) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const [depth, setDepth] = useState("");
  const [last, setLast] = useState<Reading | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api<Reading>("/api/borewell-readings", { method: "POST", json: { depth_m: Number(depth) } });
      setLast(r); setDepth(""); onSaved();
    } catch (x) {
      setErr(x instanceof ApiError && x.status === 409 ? t("borewell.duplicate") : (x as Error).message);
    } finally { setBusy(false); }
  };

  const recent = [...readings].reverse().slice(0, 5);
  return (
    <Tile title={t("borewell.title")} icon={Gauge} guide="borewell-form" sub={t("society.kpi_borewell_sub", { m: fmtNum(dangerM, lang) })}
          right={<DemoBadge show={readings.some((r) => r.is_demo)} />}>
      <p className="mb-3 text-sm text-ink-muted">{t("borewell.lead")}</p>
      {canAdd && (
        <form onSubmit={submit} className="flex gap-2">
          <label className="sr-only" htmlFor="depth">{t("borewell.depth")}</label>
          <input id="depth" className="input" type="number" inputMode="decimal" step="0.01" min="0.1" max="150" required
                 placeholder={t("borewell.depth")} value={depth} onChange={(e) => setDepth(e.target.value)} />
          <button className="btn-primary whitespace-nowrap" disabled={busy || !depth}>{t("borewell.submit")}</button>
        </form>
      )}
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}
      {last && <div className="mt-3"><Verdict r={last} /></div>}
      <div className="mt-4">
        <div className="eyebrow mb-2">{t("borewell.history")}</div>
        <ul className="divide-y divide-line text-sm">
          {recent.map((r) => (
            <li key={r.id} className="grid grid-cols-[4rem_1fr_auto] items-center gap-2 py-2">
              <span className="text-ink-muted">{fmtDate(r.day, lang, { day: "numeric", month: "short" })}</span>
              <span className="tabnum font-semibold">{fmtNum(r.depth_m, lang, 2)} m</span>
              <StatusChip status={r.status} label={t(`borewell.${r.status}`)} />
            </li>
          ))}
        </ul>
      </div>
    </Tile>
  );
}
