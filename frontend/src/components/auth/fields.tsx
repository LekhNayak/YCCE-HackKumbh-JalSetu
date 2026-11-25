import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check as CheckIcon, ChevronDown, Eye, EyeOff } from "lucide-react";
import { Check } from "../../stageshow/kit/parts/Check";

/** One line under the field from the start: the hint and the error change places in it, so the form never jumps. */
function Lane({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  const [last, setLast] = useState(error);                  // the old error stays in place while it fades out
  useEffect(() => {
    if (error) { setLast(error); return; }
    const timer = window.setTimeout(() => setLast(undefined), 260);
    return () => window.clearTimeout(timer);
  }, [error]);
  return (
    <div id={id} className="auth-lane">
      <span className="auth-msg" data-on={!error || undefined} aria-hidden={!!error || undefined}>{hint}</span>
      <span className="auth-msg auth-msg--error" data-on={!!error || undefined} aria-hidden={!error || undefined}>{error ?? last}</span>
    </div>
  );
}

interface Common { id: string; label: string; hint?: string; error?: string; ok?: boolean }

export function TextField({ id, label, hint, error, ok, end, ...input }: Common & { end?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  return (
    <div className="auth-field" data-state={error ? "error" : ok ? "ok" : undefined}>
      <label htmlFor={id}>{label}</label>
      <div className="auth-box">
        <input id={id} aria-invalid={!!error} aria-describedby={`${id}-msg`} required {...input} />
        <span className="auth-ok" aria-hidden><CheckIcon size={16} strokeWidth={2.6} /></span>
        {end}
      </div>
      <Lane id={`${id}-msg`} hint={hint} error={error} />
    </div>
  );
}

export function PasswordField(props: Common & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type">) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const Icon = show ? EyeOff : Eye;
  return (
    <TextField {...props} type={show ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false}
               end={<button type="button" className="auth-eye" aria-controls={props.id} aria-pressed={show} aria-label={t("auth.show_password")}
                            onClick={() => setShow(!show)}><Icon size={18} aria-hidden /></button>} />
  );
}

export function SelectField({ id, label, hint, error, ok, children, ...select }: Common & { children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  return (
    <div className="auth-field" data-state={error ? "error" : ok ? "ok" : undefined}>
      <label htmlFor={id}>{label}</label>
      <div className="auth-box">
        <select id={id} aria-invalid={!!error} aria-describedby={`${id}-msg`} required {...select}>{children}</select>
        <span className="auth-caret" aria-hidden><ChevronDown size={18} /></span>
      </div>
      <Lane id={`${id}-msg`} hint={hint} error={error} />
    </div>
  );
}

/** Full width, so every state fits where it is: the label, the wait and the confirmation crossfade in one place. */
export function SubmitButton({ state, idle, busy, done }: { state: "idle" | "busy" | "done"; idle: string; busy: string; done: string }) {
  return (
    <>
      <button type="submit" className="auth-submit" data-done={state === "done" || undefined} aria-disabled={state !== "idle"} aria-busy={state === "busy"}>
        <span className="auth-layer" data-on={state === "idle" || undefined} aria-hidden={state !== "idle" || undefined}>{idle}</span>
        <span className="auth-layer" data-on={state !== "idle" || undefined} aria-hidden={state === "idle" || undefined}>
          <Check on={state === "done"} pending={state === "busy"} size={16} />
          <span className="auth-labels">
            <span className="auth-label" data-on={state !== "done" || undefined} aria-hidden={state === "done" || undefined}>{busy}</span>
            <span className="auth-label" data-on={state === "done" || undefined} aria-hidden={state !== "done" || undefined}>{done}</span>
          </span>
        </span>
      </button>
      <span className="sr-only" role="status">{state === "busy" ? busy : state === "done" ? done : ""}</span>
    </>
  );
}
