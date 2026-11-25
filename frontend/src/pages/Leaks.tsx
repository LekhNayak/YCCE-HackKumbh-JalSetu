import { FormEvent, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import { Camera, CheckCircle2, Crosshair, Droplets, Plus, TriangleAlert, Unplug, Waves, Wrench, GlassWater } from "lucide-react";
import { useApp } from "../context";
import { api, useApi } from "../lib/api";
import type { Ticket } from "../lib/types";
import { ago, fmtDate, fmtTime } from "../lib/format";
import { shrinkPhoto } from "../lib/photo";
import { DemoBadge, Loading, StatusChip, Tile } from "../components/Bits";
import MapView, { homePin } from "../components/MapView";

export const CATS = [
  { k: "pipe_burst", icon: Wrench }, { k: "overflow", icon: GlassWater }, { k: "open_tap", icon: Droplets },
  { k: "illegal", icon: Unplug }, { k: "drain", icon: Waves },
] as const;
const FLOW = ["open", "assigned", "in_progress", "resolved"] as const;

export function Timeline({ tk }: { tk: Ticket }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const reached = new Map(tk.history.map((h) => [h.status, h.at]));
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
      {FLOW.map((s) => (
        <li key={s} className={`flex items-center gap-1.5 ${reached.has(s) ? "text-ink" : "text-ink-faint"}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${reached.has(s) ? (s === "resolved" ? "bg-good" : "bg-brand") : "bg-slate-200"}`} />
          {t(`leaks.status.${s}`)}{reached.get(s) && <span className="text-ink-faint">{fmtDate(reached.get(s)!, lang, { day: "numeric", month: "short" })} {fmtTime(reached.get(s)!, lang)}</span>}
        </li>
      ))}
    </ol>
  );
}

export function LeakNew() {
  const { t } = useTranslation();
  const { lang } = useApp();
  const [cat, setCat] = useState<string>("pipe_burst");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Ticket | null>(null);

  const draw = useCallback((map: L.Map) => {
    if (!pos) return;
    const m = L.marker(pos, { icon: homePin() }).addTo(map);
    return () => { m.remove(); };
  }, [pos]);

  const gps = () => navigator.geolocation?.getCurrentPosition((p) => setPos([p.coords.latitude, p.coords.longitude]), () => setErr(t("leaks.need_location")));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pos) { setErr(t("leaks.need_location")); return; }
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.append("category", cat); fd.append("lat", String(pos[0])); fd.append("lon", String(pos[1])); fd.append("note", note);
    if (photo) {
      const small = await shrinkPhoto(photo);
      if (!small) { setErr(t("leaks.photo_bad")); setBusy(false); return; }
      fd.append("photo", small, "leak.jpg");
    }
    try { setDone(await api<Ticket>("/api/leaks", { method: "POST", body: fd })); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  };

  if (done) return (
    <div className="mx-auto max-w-xl">
      <Tile title={t("leaks.sent_title")} icon={CheckCircle2}>
        <p className="text-sm text-ink">{t("leaks.sent_lead", { id: done.id, utility: done.routed_to?.[lang] ?? done.routed_to?.en ?? "—" })}</p>
        {done.photo && <img src={done.photo} alt="" className="mt-3 max-h-60 w-full rounded-xl object-cover" />}
        <div className="mt-4"><Timeline tk={done} /></div>
        <div className="mt-4 flex gap-2"><Link to="/leaks" className="btn-primary">{t("leaks.mine")}</Link>
          <button className="btn-ghost" onClick={() => { setDone(null); setPhoto(null); setPreview(null); setNote(""); }}>{t("leaks.new_report")}</button></div>
      </Tile>
    </div>
  );

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5" data-guide="leak-form">
      <h1 className="text-2xl font-bold">{t("leaks.title")}</h1>
      <Tile title={t("leaks.category")} icon={TriangleAlert} tone="accent">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {CATS.map(({ k, icon: Icon }) => (
            <button type="button" key={k} onClick={() => setCat(k)} aria-pressed={cat === k}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm font-medium ${cat === k ? "border-brand bg-brand-sky text-brand" : "border-line"}`}>
              <Icon size={22} aria-hidden /> {t(`leaks.cat.${k}`)}
            </button>
          ))}
        </div>
      </Tile>
      <div className="grid gap-5 md:grid-cols-2">
        <Tile title={t("leaks.photo")} icon={Camera}>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-line bg-brand-sky/50 p-4 text-sm text-brand">
            {preview ? <img src={preview} alt="" className="max-h-48 rounded-lg object-cover" /> : <><Camera size={28} />{t("leaks.photo_hint")}</>}
            <input type="file" accept="image/*" capture="environment" className="sr-only"
                   onChange={(e) => { const f = e.target.files?.[0] ?? null; setPhoto(f); setPreview(f ? URL.createObjectURL(f) : null); }} />
          </label>
          <label className="mt-3 block text-sm"><span className="mb-1 block text-xs text-ink-muted">{t("leaks.note")}</span>
            <textarea className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </Tile>
        <Tile title={t("leaks.location")} icon={Crosshair}>
          <button type="button" className="btn-soft mb-2 w-full" onClick={gps}><Crosshair size={16} />{t("leaks.use_gps")}</button>
          <p className="mb-2 text-center text-xs text-ink-muted">{t("leaks.tap_map")}</p>
          <MapView center={[21.2717, 78.586]} zoom={15} height={240} draw={draw} onClick={(la, lo) => setPos([la, lo])} label={t("leaks.location")} />
          {pos && <p className="mt-1 text-xs text-ink-muted tabnum">{pos[0].toFixed(5)}, {pos[1].toFixed(5)}</p>}
        </Tile>
      </div>
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
      <button className="btn-accent w-full py-4 text-base" disabled={busy}>{t("leaks.submit")}</button>
    </form>
  );
}

export default function Leaks() {
  const { t } = useTranslation();
  const { lang } = useApp();
  const q = useApi<Ticket[]>("/api/leaks?mine=true");
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("leaks.mine")}</h1>
        <Link to="/leaks/new" className="btn-accent"><Plus size={16} />{t("leaks.title")}</Link>
      </div>
      {!q.data ? <Loading /> : q.data.length === 0 ? <p className="text-ink-muted">{t("leaks.none_yet")}</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((tk) => (
            <div key={tk.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">#{tk.id} · {t(`leaks.cat.${tk.category}`)}</div>
                  <div className="text-xs text-ink-muted">{ago(tk.created_at, lang)}</div>
                </div>
                <div className="flex gap-1"><DemoBadge show={tk.is_demo} /><StatusChip status={tk.status} label={t(`leaks.status.${tk.status}`)} /></div>
              </div>
              {tk.photo && <img src={tk.photo} alt="" className="mt-3 max-h-40 w-full rounded-xl object-cover" />}
              {tk.note && <p className="mt-2 text-sm text-ink-muted">{tk.note}</p>}
              <div className="mt-3"><Timeline tk={tk} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
