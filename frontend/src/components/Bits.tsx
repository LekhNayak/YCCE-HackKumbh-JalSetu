import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, FlaskConical, ShieldCheck } from "lucide-react";

type Tone = "brand" | "accent" | "navy" | "plain";

export function IconChip({ icon: Icon, tone = "brand", size = 40 }: { icon: LucideIcon; tone?: Tone; size?: number }) {
  const cls = tone === "accent" ? "bg-accent-soft text-accent-text" : tone === "navy" ? "bg-white/10 text-white" : "bg-brand-sky text-brand";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl ${cls}`} style={{ width: size, height: size }}>
      <Icon size={size * 0.5} strokeWidth={2} aria-hidden />
    </span>
  );
}

export function Tile({ title, icon, tone = "brand", right, children, className = "", guide, sub, variant = "card" }: {
  title?: ReactNode; icon?: LucideIcon; tone?: Tone; right?: ReactNode; children: ReactNode; className?: string;
  guide?: string; sub?: ReactNode; variant?: "card" | "navy" | "sky";
}) {
  const base = variant === "navy" ? "card-navy" : variant === "sky" ? "card-sky" : "card";
  return (
    <section className={`${base} fade-in ${className}`} data-guide={guide}>
      {(title || right) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {icon && <IconChip icon={icon} tone={variant === "navy" ? "navy" : tone} />}
            <div>
              {title && <h2 className={`text-base font-semibold leading-tight ${variant === "navy" ? "text-white" : ""}`}>{title}</h2>}
              {sub && <p className={`mt-0.5 text-xs ${variant === "navy" ? "text-blue-100/80" : "text-ink-muted"}`}>{sub}</p>}
            </div>
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function DemoBadge({ show = true }: { show?: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <span className="chip bg-accent-soft text-accent-text" title="Seeded sample entries for the demo">
      <FlaskConical size={12} aria-hidden /> {t("common.demo_data")}
    </span>
  );
}

export function RealBadge() {
  const { t } = useTranslation();
  return (
    <span className="chip bg-emerald-50 text-good">
      <ShieldCheck size={12} aria-hidden /> {t("common.real_data")}
    </span>
  );
}

export function Kpi({ label, value, sub, tone = "brand", icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: LucideIcon }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="flex min-h-[34px] items-center justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {icon && <IconChip icon={icon} tone={tone} size={30} />}
      </div>
      <span className={`kpi-value ${tone === "accent" ? "text-accent-text" : "text-brand"}`}>{value}</span>
      {sub && <span className="text-xs text-ink-muted">{sub}</span>}
    </div>
  );
}

export function Loading({ h = 160 }: { h?: number }) {
  return <div className="skeleton w-full" style={{ height: h }} aria-busy="true" />;
}

export function ErrorBox({ msg, retry }: { msg: string; retry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-bad" role="alert">
      <AlertTriangle size={16} aria-hidden /> <span className="flex-1">{t("common.error")} {msg}</span>
      {retry && <button className="btn-ghost py-1" onClick={retry}>{t("common.retry")}</button>}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  on_time: "bg-emerald-50 text-good", resolved: "bg-emerald-50 text-good", accepted: "bg-emerald-50 text-good",
  late: "bg-accent-soft text-accent-text", assigned: "bg-brand-sky text-brand", in_progress: "bg-amber-50 text-amber-700",
  missed: "bg-red-50 text-bad", open: "bg-red-50 text-bad", flagged: "bg-red-50 text-bad",
  scheduled: "bg-slate-100 text-slate-600", baseline: "bg-slate-100 text-slate-600", cancelled: "bg-slate-100 text-slate-500",
};

export function StatusChip({ status, label }: { status: string; label: string }) {
  return <span className={`chip ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600"}`}>{label}</span>;
}
