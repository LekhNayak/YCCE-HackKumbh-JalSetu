/** The sign-in form's own checks, for an answer before sending. The server checks again and has the last word. */
export type FieldCode =
  | "required" | "username_short" | "username_chars" | "username_taken" | "email_invalid" | "email_taken"
  | "password_short" | "password_long" | "password_common" | "password_same" | "society_missing";

export interface RegisterForm { username: string; email: string; password: string; society_id: string }
export type Problems<K extends string = string> = Partial<Record<K, FieldCode>>;

export function usernameProblem(v: string): FieldCode | undefined {
  const s = v.normalize("NFKC").trim();
  if (!s) return "required";
  if (s.length < 3) return "username_short";
  if (s.length > 30 || !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i.test(s)) return "username_chars";
}

export function emailProblem(v: string): FieldCode | undefined {
  const s = v.trim();
  if (!s) return "required";
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(s)) return "email_invalid";
}

export function passwordProblem(v: string, username = "", email = ""): FieldCode | undefined {
  if (!v) return "required";
  if ([...v].length < 8) return "password_short";
  if ([...v].length > 128) return "password_long";
  const p = v.toLowerCase();
  if ([username.trim(), email.trim(), email.trim().split("@")[0]].some((x) => x && x.toLowerCase() === p)) return "password_same";
  if (new Set(p).size < 3) return "password_common";
}

export function registerProblems(f: RegisterForm): Problems<keyof RegisterForm> {
  const out: Problems<keyof RegisterForm> = {
    username: usernameProblem(f.username), email: emailProblem(f.email),
    password: passwordProblem(f.password, f.username, f.email), society_id: f.society_id ? undefined : "society_missing",
  };
  for (const k of Object.keys(out) as (keyof RegisterForm)[]) if (!out[k]) delete out[k];
  return out;
}

/** What the server said, as field problems or one message for the whole form. */
export type Refusal = { fields?: Problems; form?: "wrong" | "too_many" | "busy" | "unreachable" | "error"; minutes?: number };

export function refusalOf(status: number, detail: unknown, unreachable: boolean): Refusal {
  const d = (detail && typeof detail === "object" && !Array.isArray(detail) ? detail : {}) as { code?: string; fields?: Problems; minutes?: number };
  if (unreachable) return { form: "unreachable" };
  if (d.code === "fields" && d.fields) return { fields: d.fields };
  if (d.code === "wrong" || d.code === "busy") return { form: d.code };
  if (d.code === "too_many") return { form: "too_many", minutes: d.minutes ?? 15 };
  return { form: status === 401 ? "wrong" : "error" };
}
