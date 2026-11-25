import { bcp47, Lang } from "./langs";

/** Numbers and dates always use Latin digits (easier to compare across languages and with official data). */
export function fmtNum(x: number | null | undefined, lang: Lang, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  return new Intl.NumberFormat(bcp47(lang), { maximumFractionDigits: digits, minimumFractionDigits: 0, numberingSystem: "latn" } as Intl.NumberFormatOptions).format(x);
}

export function fmtDate(iso: string | null | undefined, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!iso) return "–";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return new Intl.DateTimeFormat(bcp47(lang), { ...opts, numberingSystem: "latn" } as Intl.DateTimeFormatOptions).format(d);
}

export function fmtTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat(bcp47(lang), { hour: "numeric", minute: "2-digit", numberingSystem: "latn" } as Intl.DateTimeFormatOptions).format(new Date(iso));
}

/** depth below ground (m, positive) from a level (m, negative below ground) */
export const depthOf = (level: number | null | undefined) => (level === null || level === undefined ? null : Math.round(-level * 100) / 100);

export function hoursSince(iso: string, now = Date.now()) {
  return (now - new Date(iso).getTime()) / 3_600_000;
}

export function ago(iso: string, lang: Lang, now = Date.now()): string {
  const h = hoursSince(iso, now);
  const rtf = new Intl.RelativeTimeFormat(bcp47(lang), { numeric: "auto", numberingSystem: "latn" } as Intl.RelativeTimeFormatOptions);
  if (Math.abs(h) < 1) return rtf.format(-Math.round(h * 60), "minute");
  if (Math.abs(h) < 48) return rtf.format(-Math.round(h), "hour");
  return rtf.format(-Math.round(h / 24), "day");
}

export function uid(): string {
  return (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
