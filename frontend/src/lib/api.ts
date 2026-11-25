import { useCallback, useEffect, useState } from "react";
import i18n from "../i18n";

const TOKEN_KEY = "jalsetu.token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

/** Fired when the server no longer accepts this sign-in (it expired or was ended elsewhere). */
export const SIGNED_OUT = "jalsetu:signed-out";

export class ApiError extends Error {
  /** `data` is the server's JSON answer, or null when what answered was not the JalSetu API (a gateway, a crash, a wrong address). */
  constructor(public status: number, message: string, public data: unknown = null) { super(message); }
  get unreachable() { return this.data === null && (this.status === 404 || this.status >= 500); }
  get detail() { return (this.data as { detail?: unknown } | null)?.detail; }
}

export async function api<T = unknown>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...init } = opts;
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; init.body = JSON.stringify(json); }
  const res = await fetch(path, { ...init, headers });
  const type = res.headers.get("content-type") ?? "";
  // A page instead of data means the address is not forwarded to the API: treat it as a gateway error, not as an answer.
  if (!res.ok || type.includes("text/html")) {
    const data: unknown = type.includes("json") ? await res.json().catch(() => null) : null;
    const status = res.ok ? 502 : res.status;
    const err = new ApiError(status, "", data);
    const d = err.detail;
    err.message = err.unreachable ? i18n.t("common.unreachable") : typeof d === "string" ? d : d ? JSON.stringify(d) : `Error ${status}`;
    if (status === 401 && token && data && getToken() === token) {
      setToken(null);
      window.dispatchEvent(new Event(SIGNED_OUT));
    }
    throw err;
  }
  return (type.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

/** What to tell a person about any failure. */
export const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : i18n.t("common.unreachable"));

/** Fetch on mount and whenever `key` changes; `reload()` refetches. */
export function useApi<T>(path: string | null, key: unknown = path) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setLoading(true);
    api<T>(path).then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (live) setError(messageOf(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { data, error, loading, reload, setData };
}
