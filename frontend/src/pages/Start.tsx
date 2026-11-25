import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Droplets, FlaskConical, ShieldCheck } from "lucide-react";
import { useApp } from "../context";
import { useTitle } from "../lib/title";
import AuthCard from "../components/auth/AuthCard";
import TankerDemo from "../stageshow/TankerDemo";
import FeatureTiles from "../stageshow/FeatureTiles";

/** Sign in ("/", "/login") and create an account ("/register"): one page, so the demo beside the form never restarts. */
export default function Start() {
  const { t } = useTranslation();
  const { meta } = useApp();
  const mode = useLocation().pathname === "/register" ? "register" : "login";
  useTitle(t(mode === "login" ? "auth.sign_in" : "auth.create_title"));

  return (
    <main className="min-h-full bg-gradient-to-b from-white to-plane">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:py-12">
        <div className="start-grid">
          <div className="start-copy">
            <span className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white"><Droplets size={26} aria-hidden /></span>
              <span className="text-3xl font-bold tracking-tight text-brand-navy">Jal<span className="text-brand">Setu</span></span>
            </span>
            <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight text-ink sm:text-[2.5rem]">{t("start.title")}</h1>
            <p className="mt-1 text-lg font-semibold text-accent-text">{t("common.tagline")}</p>
            <p className="mt-3 max-w-2xl text-base text-ink-muted">{t("start.lead")}</p>
          </div>

          <div className="start-signin space-y-4">
            <AuthCard mode={mode} />
            <ul className="space-y-1.5 px-6 text-xs font-medium leading-5">
              {meta?.data && <li className="fade-in flex gap-2 text-good"><ShieldCheck size={14} strokeWidth={2.4} className="mt-[3px] shrink-0" aria-hidden />{t("start.real_badge", { wells: meta.data.wells.count })}</li>}
              <li className="flex gap-2 text-accent-text"><FlaskConical size={14} strokeWidth={2.4} className="mt-[3px] shrink-0" aria-hidden />{t("start.demo_badge")}</li>
            </ul>
          </div>

          <div className="start-demo"><TankerDemo /></div>
        </div>

        <FeatureTiles />
      </div>
    </main>
  );
}
