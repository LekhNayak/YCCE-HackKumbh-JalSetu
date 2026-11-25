/**
 * Offline queue for the two things people log on the spot: "water came / no water" and "tanker arrived".
 * Each entry carries a client_id, so when the same entry is sent twice (flaky network), the server keeps one, and the
 * person who made it, so it is never sent as somebody else who signs in on the same phone.
 */
import { api, ApiError, getToken } from "./api";
import { savedUser } from "./session";

const KEY = "jalsetu.queue";
export type Queued = { id: string; uid?: number; path: string; json: unknown; at: string };
type Listener = (n: number) => void;
const listeners = new Set<Listener>();

function readAll(): Queued[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
/** The signed-in person's waiting entries (entries from before accounts existed have no owner). */
export function readQueue(): Queued[] {
  const me = savedUser()?.id;
  return me === undefined ? [] : readAll().filter((q) => q.uid === undefined || q.uid === me);
}
const tell = () => { const n = readQueue().length; listeners.forEach((l) => l(n)); };
function writeAll(q: Queued[]) { localStorage.setItem(KEY, JSON.stringify(q)); tell(); }
function keep(path: string, json: Record<string, unknown> & { client_id: string }): "queued" {
  writeAll([...readAll(), { id: json.client_id, uid: savedUser()?.id, path, json, at: new Date().toISOString() }]);
  return "queued";
}
const drop = (id: string) => writeAll(readAll().filter((q) => q.id !== id));
export function onQueueChange(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

/** The API itself did not answer (as opposed to refusing the entry). */
const noAnswer = (e: unknown) => !(e instanceof ApiError) || (e.unreachable && e.status !== 500);

/** Send now if possible, otherwise keep it for later. Returns "sent" or "queued". */
export async function sendOrQueue(path: string, json: Record<string, unknown> & { client_id: string }): Promise<"sent" | "queued"> {
  if (!navigator.onLine) return keep(path, json);
  try {
    await api(path, { method: "POST", json });
    return "sent";
  } catch (e) {
    if (noAnswer(e)) return keep(path, json);
    throw e;
  }
}

let flushing = false;
export async function flushQueue(): Promise<number> {
  if (flushing || !navigator.onLine || !getToken()) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of readQueue()) {
      try {
        await api(item.path, { method: "POST", json: item.json });
        sent++;
        drop(item.id);
      } catch (e) {
        if (noAnswer(e) || (e instanceof ApiError && e.status === 401)) break;      // try again later, once online and signed in
        drop(item.id);                                                              // the server refused this entry: sending it again cannot help
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

/** Someone signed in or out: the waiting entries shown are now theirs. */
export function queueOwnerChanged() { tell(); void flushQueue(); }
