/**
 * Offline queue for the two things people log on the spot: "water came / no water" and "tanker arrived".
 * Each entry carries a client_id, so when the same entry is sent twice (flaky network), the server keeps one.
 */
import { api, ApiError } from "./api";

const KEY = "jalsetu.queue";
export type Queued = { id: string; path: string; json: unknown; at: string };
type Listener = (n: number) => void;
const listeners = new Set<Listener>();

export function readQueue(): Queued[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function writeQueue(q: Queued[]) {
  localStorage.setItem(KEY, JSON.stringify(q));
  listeners.forEach((l) => l(q.length));
}
export function onQueueChange(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Send now if possible, otherwise keep it for later. Returns "sent" or "queued". */
export async function sendOrQueue(path: string, json: Record<string, unknown> & { client_id: string }): Promise<"sent" | "queued"> {
  if (!navigator.onLine) { writeQueue([...readQueue(), { id: json.client_id, path, json, at: new Date().toISOString() }]); return "queued"; }
  try {
    await api(path, { method: "POST", json });
    return "sent";
  } catch (e) {
    if (e instanceof ApiError) throw e;                  // the server answered: a real error, not a network problem
    writeQueue([...readQueue(), { id: json.client_id, path, json, at: new Date().toISOString() }]);
    return "queued";
  }
}

let flushing = false;
export async function flushQueue(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of readQueue()) {
      try {
        await api(item.path, { method: "POST", json: item.json });
        sent++;
        writeQueue(readQueue().filter((q) => q.id !== item.id));
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) writeQueue(readQueue().filter((q) => q.id !== item.id));
        else break;                                       // still offline: try again later
      }
    }
  } finally { flushing = false; }
  return sent;
}

export function startOfflineSync() {
  window.addEventListener("online", () => { void flushQueue(); });
  setInterval(() => { if (readQueue().length) void flushQueue(); }, 20_000);
  void flushQueue();
}
