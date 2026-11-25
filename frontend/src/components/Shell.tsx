import { ReactNode, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, CloudOff, Droplets, Home, Landmark, LogOut, MessagesSquare, TriangleAlert, Waves } from "lucide-react";
import { useApp } from "../context";
import LangMenu from "./LangMenu";
import ChatWidget from "./ChatWidget";
import { onQueueChange, readQueue } from "../lib/offline";

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white"><Droplets size={20} aria-hidden /></span>
      <span className="hidden text-lg font-bold tracking-tight text-brand-navy min-[385px]:inline">Jal<span className="text-brand">Setu</span></span>
    </span>
  );
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export default function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const online = useOnline();
  const [queued, setQueued] = useState(readQueue().length);
  useEffect(() => onQueueChange(setQueued), []);

  const links = user?.role === "ward_officer"
    ? [{ to: "/ward", icon: Landmark, label: t("nav.ward") }, { to: "/groundwater", icon: Waves, label: t("nav.groundwater") },
       { to: "/community", icon: MessagesSquare, label: t("nav.community") }]
    : [{ to: "/home", icon: Home, label: t("nav.home") }, { to: "/society", icon: Building2, label: t("nav.society") },
       { to: "/groundwater", icon: Waves, label: t("nav.groundwater") }, { to: "/leaks", icon: TriangleAlert, label: t("nav.leaks") },
       { to: "/community", icon: MessagesSquare, label: t("nav.community") }];

  return (
    <div className="min-h-full pb-24">
      <header className="sticky top-0 z-[1000] border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 sm:gap-3">
          <NavLink to={user?.role === "ward_officer" ? "/ward" : "/home"} aria-label="JalSetu home"><Logo /></NavLink>
          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-sky text-brand" : "text-ink-muted hover:bg-slate-50"}`}>
                <l.icon size={16} aria-hidden /> {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LangMenu />
            {user && (
              <button className="btn-ghost px-2.5 py-1.5 sm:hidden" onClick={() => { logout(); navigate("/"); }}
                      aria-label={t("common.switch_user")}><LogOut size={16} /></button>
            )}
            {user && (
              <button className="btn-ghost hidden py-1.5 sm:inline-flex" data-guide="persona-switch"
                      onClick={() => { logout(); navigate("/"); }} title={t("common.switch_user")}>
                <span className="max-w-[9rem] truncate">{user.name}</span>
                <span className="text-xs text-ink-faint">· {t(`roles.${user.role}`)}</span>
                <LogOut size={14} aria-hidden />
              </button>
            )}
          </div>
        </div>
        {(!online || queued > 0) && (
          <div className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium ${online ? "bg-brand-sky text-brand" : "bg-accent-soft text-accent-text"}`} role="status">
            <CloudOff size={14} aria-hidden />
            {!online ? t("common.you_are_offline") : ""} {queued > 0 && t("common.offline_queued", { count: queued })}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-[1000] flex justify-around border-t border-line bg-white/95 py-1.5 backdrop-blur md:hidden">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-medium ${isActive ? "text-brand" : "text-ink-muted"}`}>
            <l.icon size={20} aria-hidden /> {l.label}
          </NavLink>
        ))}
      </nav>
      <ChatWidget />
    </div>
  );
}
