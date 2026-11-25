import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getToken, setToken } from "./lib/api";
import { isLang, Lang } from "./lib/langs";
import type { Meta, User } from "./lib/types";
import { setLang } from "./i18n";

interface AppState {
  meta: Meta | null;
  user: User | null;
  ready: boolean;
  lang: Lang;
  login: (userId: number) => Promise<User>;
  logout: () => void;
  visible: Record<string, unknown>;
  setVisible: (v: Record<string, unknown>) => void;
  highlight: (id: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState<Record<string, unknown>>({});

  useEffect(() => {
    api<Meta>("/api/meta").then(setMeta).catch(() => setMeta(null));
    if (!getToken()) { setReady(true); return; }
    api<User>("/api/me").then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (userId: number) => {
    const r = await api<{ token: string; user: User }>("/api/login", { method: "POST", json: { user_id: userId } });
    setToken(r.token);
    setUser(r.user);
    if (isLang(r.user.lang)) setLang(r.user.lang);      // each persona opens in their own language
    return r.user;
  }, []);

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  const highlight = useCallback((id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-guide="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("guide-highlight");
    window.setTimeout(() => el.classList.remove("guide-highlight"), 3800);
  }, []);

  const lang = (isLang(i18n.language) ? i18n.language : "en") as Lang;
  const value = useMemo(() => ({ meta, user, ready, lang, login, logout, visible, setVisible, highlight }),
    [meta, user, ready, lang, login, logout, visible, highlight]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
