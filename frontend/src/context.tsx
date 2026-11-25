import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, getToken, setToken, SIGNED_OUT } from "./lib/api";
import { isLang, Lang } from "./lib/langs";
import { queueOwnerChanged } from "./lib/offline";
import { forgetOfflineCopies, savedUser, saveUser } from "./lib/session";
import type { Meta, User } from "./lib/types";
import { hasChosenLang, setLang } from "./i18n";

export interface SignIn { token: string; user: User }

interface AppState {
  meta: Meta | null;
  user: User | null;
  ready: boolean;
  lang: Lang;
  /** The sign-in ended by itself (it expired, or the password was changed). */
  expired: boolean;
  /** Use the answer of a sign-in. */
  adopt: (r: SignIn) => void;
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
  const [expired, setExpired] = useState(false);
  const [visible, setVisible] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let live = true;
    const loadMeta = () => api<Meta>("/api/meta").then((m) => { if (live) setMeta(m); }).catch(() => undefined);
    void loadMeta();
    window.addEventListener("online", loadMeta);
    if (!getToken()) { saveUser(null); setReady(true); }
    else api<User>("/api/me").then((u) => { saveUser(u); if (live) setUser(u); })
      // Only the server saying "no" ends a sign-in. Offline or down, the app opens as the last person, with its saved data.
      .catch((e: unknown) => { if (live && !(e instanceof ApiError && e.status === 401)) setUser(savedUser()); })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; window.removeEventListener("online", loadMeta); };
  }, []);

  useEffect(() => {
    const ended = () => { saveUser(null); forgetOfflineCopies(); setUser(null); setExpired(true); queueOwnerChanged(); };
    // Signing out in one tab signs out the others
    const other = (e: StorageEvent) => { if (e.key === "jalsetu.token" && !e.newValue) { setUser(null); queueOwnerChanged(); } };
    window.addEventListener(SIGNED_OUT, ended);
    window.addEventListener("storage", other);
    return () => { window.removeEventListener(SIGNED_OUT, ended); window.removeEventListener("storage", other); };
  }, []);

  const adopt = useCallback((r: SignIn) => {
    forgetOfflineCopies();
    setToken(r.token);
    saveUser(r.user);
    if (isLang(r.user.lang) && (r.user.is_demo || !hasChosenLang())) setLang(r.user.lang);     // each demo person opens in their own language
    setExpired(false);
    setVisible({});
    setUser(r.user);
    queueOwnerChanged();
  }, []);

  const logout = useCallback(() => {
    const token = getToken();
    setToken(null);
    saveUser(null);
    forgetOfflineCopies();
    setVisible({});
    setUser(null);
    setExpired(false);
    queueOwnerChanged();
    if (token) void fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => undefined);
  }, []);

  const highlight = useCallback((id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-guide="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("guide-highlight");
    window.setTimeout(() => el.classList.remove("guide-highlight"), 3800);
  }, []);

  const lang = (isLang(i18n.language) ? i18n.language : "en") as Lang;
  const value = useMemo(() => ({ meta, user, ready, lang, expired, adopt, logout, visible, setVisible, highlight }),
    [meta, user, ready, lang, expired, adopt, logout, visible, highlight]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
