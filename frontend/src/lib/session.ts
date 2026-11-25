import type { User } from "./types";

const USER_KEY = "jalsetu.user";

/** The last signed-in person, so the app opens without a connection. */
export function savedUser(): User | null {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) ?? "null") as User | null;
    return u && typeof u.id === "number" && typeof u.name === "string" && typeof u.role === "string" ? u : null;
  } catch { return null; }
}
export const saveUser = (u: User | null) => (u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY));

/** Remove the answers kept for offline use: they belong to the person who was signed in. */
export function forgetOfflineCopies() {
  if ("caches" in window) void caches.delete("api").catch(() => undefined);
}

export const homeOf = (u: User) => (u.role === "ward_officer" ? "/ward" : "/home");
