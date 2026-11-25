import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Building2, Droplets, FlaskConical, Landmark, ShieldCheck, User as UserIcon } from "lucide-react";
import { useApp } from "../context";
import { useApi } from "../lib/api";
import type { User } from "../lib/types";
import LangMenu from "../components/LangMenu";
import { Loading } from "../components/Bits";
import TankerDemo from "../stageshow/TankerDemo";
import FeatureTiles from "../stageshow/FeatureTiles";

const ROLE_ICON = { resident: UserIcon, society_admin: Building2, ward_officer: Landmark } as const;

export default function Start() {
  const { t } = useTranslation();
  const { lang, login, meta } = useApp();
  const navigate = useNavigate();
  const personas = useApi<User[]>("/api/personas");

  const go = async (u: User) => {
    const me = await login(u.id);
    navigate(me.role === "ward_officer" ? "/ward" : "/home");
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-white to-plane">
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
            <div className="card space-y-6 p-6">
              <div>
                <div className="eyebrow mb-2">{t("start.choose_lang")}</div>
                <LangMenu big />
              </div>
              <div>
                <div className="eyebrow mb-2">{t("start.choose_user")}</div>
                {personas.loading && <Loading h={318} />}
                <div className="space-y-3">
                  {personas.data?.map((u) => {
                    const Icon = ROLE_ICON[u.role];
                    return (
                      <button key={u.id} onClick={() => void go(u)}
                              className="group flex w-full items-center gap-4 rounded-2xl border border-line p-4 text-left transition hover:border-brand hover:bg-brand-sky focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30">
                        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white ${u.role === "ward_officer" ? "bg-brand-navy" : u.role === "society_admin" ? "bg-accent" : "bg-brand"}`}>
                          <Icon size={22} aria-hidden />
                        </span>
                        <span className="flex-1">
                          <span className="block font-semibold">{u.name}</span>
                          <span className="block text-sm text-ink-muted">{u.blurb?.[lang] ?? u.blurb?.en}</span>
                        </span>
                        <ArrowRight size={18} className="shrink-0 text-brand opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" aria-label={t("start.continue_as", { name: u.name })} />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-ink-muted">{t("start.demo_note")}</p>
              </div>
            </div>
            <ul className="space-y-1.5 px-6 text-xs font-medium leading-5">
              <li className="flex gap-2 text-good"><ShieldCheck size={14} strokeWidth={2.4} className="mt-[3px] shrink-0" aria-hidden />{t("start.real_badge", { wells: meta?.data?.wells.count ?? 100 })}</li>
              <li className="flex gap-2 text-accent-text"><FlaskConical size={14} strokeWidth={2.4} className="mt-[3px] shrink-0" aria-hidden />{t("start.demo_badge")}</li>
            </ul>
          </div>

          <div className="start-demo"><TankerDemo /></div>
        </div>

        <FeatureTiles />
      </div>
    </div>
  );
}
