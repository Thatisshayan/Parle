import { FormEvent, useEffect, useState } from "react";
import { resendSignupCode, verifySignupCode } from "@/lib/auth-pages";
import { t } from "@/lib/i18n";
import type { ParleUser } from "@/lib/parle-profile";
import { passwordMeetsRequirements } from "@/lib/auth-pages";
import { normaliseCode, resendErrorKey, type ResendNote } from "./verify-code";

/**
 * Asks for the 6-digit code emailed at sign-up; calls onVerified with the signed-in user (backend Plan 2).
 * The password is required to finish: when the page no longer has it (a reload), the person types it again.
 */
export function VerifyEmailCode({ email, password, fullName, onVerified }: { email: string; password?: string; fullName?: string; onVerified: (user: ParleUser) => void | Promise<void> }) {
  const [code, setCode] = useState("");
  const [typedPassword, setTypedPassword] = useState("");
  const [weakPassword, setWeakPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [wait, setWait] = useState(0);
  const [resendNote, setResendNote] = useState<ResendNote | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = normaliseCode(code);
    if (!clean) return setWrong(true);
    const finalPassword = password || typedPassword;
    if (!passwordMeetsRequirements(finalPassword)) return setWeakPassword(true);
    setWeakPassword(false);
    setBusy(true);
    setWrong(false);
    try {
      const user = await verifySignupCode(email, clean, finalPassword, fullName);
      await onVerified(user as ParleUser);
    } catch {
      setWrong(true);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setWait(60);
    setResendNote(null);
    try {
      await resendSignupCode(email);
      setResendNote("auth.verifyResendSent");
    } catch (error) {
      setResendNote(resendErrorKey(error)); // the cooldown still applies
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <div className="space-y-2">
        <h2 className="text-lg font-bold">{t("auth.verifyTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.verifyBody", { email })}</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="verify-code" className="auth-label">{t("auth.verifyCodeLabel")}</label>
        <input id="verify-code" className="auth-input tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      {!password && (
        <div className="space-y-2">
          <label htmlFor="verify-password" className="auth-label">{t("auth.verifyPasswordLabel")}</label>
          <input id="verify-password" className="auth-input" type="password" autoComplete="new-password" value={typedPassword} onChange={(e) => setTypedPassword(e.target.value)} />
        </div>
      )}
      {weakPassword && <p role="alert" className="auth-message-error">{t("auth.passwordWeak")}</p>}
      {wrong && <p role="alert" className="auth-message-error">{t("auth.verifyWrongCode")}</p>}
      <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>{t("auth.verifySubmit")}</button>
      {resendNote && (
        <p role={resendNote === "auth.verifyResendSent" ? "status" : "alert"} className={resendNote === "auth.verifyResendSent" ? "text-sm text-muted-foreground" : "auth-message-error"}>
          {t(resendNote, { email })}
        </p>
      )}
      <button type="button" className="block w-full text-center text-sm font-bold text-primary underline-offset-4 hover:underline disabled:opacity-60" onClick={resend} disabled={wait > 0}>
        {wait > 0 ? t("auth.verifyResendWait", { seconds: wait }) : t("auth.verifyResend")}
      </button>
    </form>
  );
}
