import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Building2, Landmark, LoaderCircle, LogIn, RotateCcw, TriangleAlert, User as UserIcon } from "lucide-react";
import { SignIn, useApp } from "../../context";
import { api, ApiError, useApi } from "../../lib/api";
import {
  emailProblem, passwordProblem, Problems, Refusal, refusalOf, RegisterForm, registerProblems, usernameProblem,
} from "../../lib/authRules";
import type { User } from "../../lib/types";
import LangMenu from "../LangMenu";
import AutoHeight from "./AutoHeight";
import { PasswordField, SelectField, SubmitButton, TextField } from "./fields";
import "./auth.css";

type Mode = "login" | "register";
type State = "idle" | "busy" | "done";
interface Options { societies: { id: number; name: string }[]; demo: User[] }

const ROLE_ICON = { resident: UserIcon, society_admin: Building2, ward_officer: Landmark } as const;
const ROLE_DISC = { resident: "bg-brand", society_admin: "bg-accent-text", ward_officer: "bg-brand-navy" } as const;
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hold = (ms: number) => new Promise((ok) => window.setTimeout(ok, calm() ? 0 : ms));
const focus = (id: string) => document.getElementById(id)?.focus();

/** Send a sign-in, show the confirmation on the button for a moment, then go in. */
function useSend() {
  const { adopt } = useApp();
  const [state, setState] = useState<State>("idle");
  const send = async (path: string, json: unknown, refused: (r: Refusal) => void) => {
    setState("busy");
    try {
      const r = await api<SignIn>(path, { method: "POST", json });
      setState("done");
      await hold(650);
      adopt(r);
    } catch (e) {
      setState("idle");
      refused(e instanceof ApiError ? refusalOf(e.status, e.detail, e.unreachable) : { form: "unreachable" });
    }
  };
  return { state, send };
}

function FormAlert({ refusal }: { refusal: Refusal | null }) {
  const { t } = useTranslation();
  const text = !refusal?.form ? "" : refusal.form === "unreachable" ? t("common.unreachable") : refusal.form === "error" ? t("common.action_failed")
    : t(`auth.err.${refusal.form}`, { n: refusal.minutes ?? 15 });
  return <div role="alert">{text && <p className="auth-alert fade-in"><TriangleAlert size={16} strokeWidth={2.4} aria-hidden />{text}</p>}</div>;
}

function LoginForm() {
  const { t } = useTranslation();
  const { state, send } = useSend();
  const [f, setF] = useState({ identifier: "", password: "" });
  const [bad, setBad] = useState<Problems<"identifier" | "password">>({});
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const wrong = refusal?.form === "wrong";

  const change = (k: "identifier" | "password") => (v: string) => {
    setF({ ...f, [k]: v });
    if (v) setBad({ ...bad, [k]: undefined });
    if (refusal) setRefusal(null);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (state !== "idle") return;
    const p: typeof bad = { ...(!f.identifier.trim() && { identifier: "required" as const }), ...(!f.password && { password: "required" as const }) };
    setBad(p); setRefusal(null);
    const first = Object.keys(p)[0];
    if (first) return focus(`login-${first}`);
    void send("/api/auth/login", f, (r) => {
      setRefusal(r);
      if (r.fields) setBad(r.fields);
      if (r.form === "wrong") { focus("login-password"); (document.getElementById("login-password") as HTMLInputElement | null)?.select(); }
    });
  };
  const err = (k: "identifier" | "password") => (bad[k] ? t(`auth.err.${bad[k]}`) : undefined);

  return (
    <form onSubmit={submit} noValidate className="auth-form auth-form--plain" aria-labelledby="auth-title">
      <TextField id="login-identifier" name="username" label={t("auth.identifier")} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                 value={f.identifier} onChange={(e) => change("identifier")(e.target.value)} error={err("identifier")} aria-invalid={wrong || !!bad.identifier} />
      <PasswordField id="login-password" name="password" label={t("auth.password")} autoComplete="current-password"
                     value={f.password} onChange={(e) => change("password")(e.target.value)} error={err("password")} aria-invalid={wrong || !!bad.password} />
      <FormAlert refusal={refusal} />
      <SubmitButton state={state} idle={t("auth.sign_in")} busy={t("auth.signing_in")} done={t("auth.signed_in")} />
    </form>
  );
}

const EMPTY: RegisterForm = { username: "", email: "", password: "", society_id: "" };
const CHECK: Record<keyof RegisterForm, (f: RegisterForm) => ReturnType<typeof usernameProblem>> = {
  username: (f) => usernameProblem(f.username), email: (f) => emailProblem(f.email),
  password: (f) => passwordProblem(f.password, f.username, f.email), society_id: (f) => (f.society_id ? undefined : "society_missing"),
};

function RegisterFormView({ options }: { options: Options | null }) {
  const { t } = useTranslation();
  const { lang } = useApp();
  const { state, send } = useSend();
  const [f, setF] = useState<RegisterForm>(EMPTY);
  const [bad, setBad] = useState<Problems<keyof RegisterForm>>({});
  const [seen, setSeen] = useState<Partial<Record<keyof RegisterForm, boolean>>>({});
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const change = (k: keyof RegisterForm) => (v: string) => {
    const next = { ...f, [k]: v };
    setF(next);
    // An error leaves the moment the value is fixed; a new one waits until the field is left
    if (bad[k] || k === "society_id") setBad({ ...bad, [k]: CHECK[k](next) });
    if (refusal) setRefusal(null);
  };
  const left = (k: keyof RegisterForm) => () => {
    if (!f[k]) return;
    setSeen((s) => ({ ...s, [k]: true }));
    setBad((b) => (b[k] === "username_taken" || b[k] === "email_taken" ? b : { ...b, [k]: CHECK[k](f) }));
  };
  const showProblems = (p: Problems<keyof RegisterForm>) => {
    setBad(p);
    const first = (Object.keys(EMPTY) as (keyof RegisterForm)[]).find((k) => p[k]);
    if (first) focus(`reg-${first}`);
    return !!first;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (state !== "idle") return;
    setSeen({ username: true, email: true, password: true, society_id: true });
    setRefusal(null);
    if (showProblems(registerProblems(f))) return;
    void send("/api/auth/register", { ...f, society_id: Number(f.society_id), lang }, (r) => {
      setRefusal(r);
      if (r.fields) showProblems(r.fields);
    });
  };
  const err = (k: keyof RegisterForm) => (bad[k] ? t(`auth.err.${bad[k]}`) : undefined);
  const ok = (k: keyof RegisterForm) => !!seen[k] && !!f[k] && !bad[k] && !CHECK[k](f);

  return (
    <form onSubmit={submit} noValidate className="auth-form" aria-labelledby="auth-title">
      <TextField id="reg-username" name="username" label={t("auth.username")} hint={t("auth.username_hint")} autoComplete="username" autoCapitalize="none" autoCorrect="off"
                 spellCheck={false} maxLength={60} value={f.username} onChange={(e) => change("username")(e.target.value)} onBlur={left("username")} error={err("username")} ok={ok("username")} />
      <TextField id="reg-email" name="email" type="email" inputMode="email" label={t("auth.email")} hint={t("auth.email_hint")} autoComplete="email" autoCapitalize="none" spellCheck={false}
                 maxLength={254} value={f.email} onChange={(e) => change("email")(e.target.value)} onBlur={left("email")} error={err("email")} ok={ok("email")} />
      <PasswordField id="reg-password" name="new-password" label={t("auth.password")} hint={t("auth.password_hint")} autoComplete="new-password" maxLength={200}
                     value={f.password} onChange={(e) => change("password")(e.target.value)} onBlur={left("password")} error={err("password")} ok={ok("password")} />
      <SelectField id="reg-society_id" name="society" label={t("auth.society")} hint={t("auth.society_hint")} value={f.society_id}
                   onChange={(e) => change("society_id")(e.target.value)} error={err("society_id")}>
        <option value="">{t("auth.society_choose")}</option>
        {options?.societies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </SelectField>
      <FormAlert refusal={refusal} />
      <SubmitButton state={state} idle={t("auth.create")} busy={t("auth.creating")} done={t("auth.created")} />
    </form>
  );
}

function DemoAccounts({ people }: { people: User[] }) {
  const { t } = useTranslation();
  const { adopt } = useApp();
  const [busy, setBusy] = useState<number | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const go = async (u: User) => {
    if (busy !== null) return;
    setBusy(u.id); setRefusal(null);
    try { adopt(await api<SignIn>("/api/auth/demo", { method: "POST", json: { user_id: u.id } })); }
    catch (e) { setBusy(null); setRefusal(e instanceof ApiError ? refusalOf(e.status, e.detail, e.unreachable) : { form: "unreachable" }); }
  };
  return (
    <section aria-labelledby="demo-title" className="auth-demo">
      <h3 id="demo-title" className="auth-or"><span>{t("auth.demo_title")}</span></h3>
      <ul>
        {people.map((u) => {
          const Icon = ROLE_ICON[u.role];
          return (
            <li key={u.id}>
              <button type="button" onClick={() => void go(u)} aria-busy={busy === u.id}>
                <span className={`auth-disc ${ROLE_DISC[u.role]}`}><Icon size={18} strokeWidth={2.2} aria-hidden /></span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold leading-5">{u.name}</span>
                  <span className="block truncate text-xs leading-[1.125rem] text-ink-muted">{t(`roles.${u.role}`)}</span>
                </span>
                {busy === u.id ? <LoaderCircle size={18} className="shrink-0 animate-spin text-brand" aria-hidden /> : <ArrowRight size={18} className="auth-go" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      <FormAlert refusal={refusal} />
    </section>
  );
}

export default function AuthCard({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  const { expired } = useApp();
  const { state: from } = useLocation();
  const options = useApi<Options>("/api/auth/options");
  const title = useRef<HTMLHeadingElement>(null);
  const was = useRef(mode);

  useEffect(() => {
    if (was.current !== mode) title.current?.focus();          // moved here from the other form: start at its heading
    was.current = mode;
  }, [mode]);
  // Back online: try again by itself
  const { error, reload } = options;
  useEffect(() => {
    if (!error) return;
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, [error, reload]);

  const login = mode === "login";
  return (
    <div className="card p-6">
      <div className="eyebrow mb-2" id="lang-title">{t("start.choose_lang")}</div>
      <LangMenu big />
      <hr className="my-6 border-line" />
      <AutoHeight>
        {options.error && (
          <div className="auth-down" role="alert">
            <TriangleAlert size={18} strokeWidth={2.2} aria-hidden />
            <span className="flex-1">{options.error}</span>
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={options.reload} disabled={options.loading}>
              <RotateCcw size={15} className={options.loading ? "animate-spin" : ""} aria-hidden />{t("common.retry")}
            </button>
          </div>
        )}
        {expired && login && <p className="auth-note" role="status"><LogIn size={16} strokeWidth={2.4} aria-hidden />{t("auth.expired")}</p>}
        <div key={mode} className="fade-in">
          <h2 id="auth-title" ref={title} tabIndex={-1} className="text-xl font-bold tracking-tight outline-none">{t(login ? "auth.sign_in" : "auth.create_title")}</h2>
          <p className="mb-5 mt-1 text-sm text-ink-muted">
            {t(login ? "auth.new_here" : "auth.have_account")}{" "}
            <Link to={login ? "/register" : "/login"} state={from} replace className="auth-link">{t(login ? "auth.create_link" : "auth.sign_in_link")}</Link>
          </p>
          {login ? <LoginForm /> : <RegisterFormView options={options.data} />}
        </div>
        {login && !!options.data?.demo.length && <DemoAccounts people={options.data.demo} />}
      </AutoHeight>
    </div>
  );
}
