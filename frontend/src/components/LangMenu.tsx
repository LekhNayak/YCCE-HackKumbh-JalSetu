import { useTranslation } from "react-i18next";
import { LANGS, Lang } from "../lib/langs";
import { setLang } from "../i18n";
import { useApp } from "../context";

export default function LangMenu({ big = false }: { big?: boolean }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const at = Math.max(0, LANGS.findIndex((l) => l.code === lang));
  return (
    <div role="radiogroup" aria-label={t("common.language")} data-guide="lang-switch"
         className={`relative grid grid-cols-3 rounded-xl border border-line bg-white p-1 ${big ? "w-full" : ""}`}>
      <span aria-hidden className="seg-thumb absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-brand" style={{ transform: `translateX(${at * 100}%)` }} />
      {LANGS.map((l) => (
        <button key={l.code} role="radio" aria-checked={lang === l.code} lang={l.code}
                onClick={() => setLang(l.code as Lang)}
                className={`relative rounded-lg ${big ? "px-3 py-3 text-base" : "px-1.5 py-1.5 text-[13px] sm:px-3 sm:text-sm"} font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 ${
                  lang === l.code ? "text-white" : "text-ink-muted hover:text-brand"}`}>
          {l.native}
        </button>
      ))}
    </div>
  );
}
