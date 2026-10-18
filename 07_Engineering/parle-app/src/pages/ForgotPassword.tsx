import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "@/components/parle/AuthLayout";
import { authErrorKey, isValidEmail, requestPasswordReset } from "@/lib/auth-pages";
import { t, type TranslationKey } from "@/lib/i18n";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) return setErrorKey("auth.emailRequired");
    if (!isValidEmail(cleanEmail)) return setErrorKey("auth.emailInvalid");
    setBusy(true);
    try {
      await requestPasswordReset(cleanEmail);
      setSent(true);
    } catch (error) {
      console.error("Parle password reset request failed", error instanceof Error ? error.name : "unknown");
      setErrorKey(authErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout titleKey="auth.forgotTitle" descriptionKey="auth.forgotDescription">
      {sent ? (
        <div className="space-y-5">
          <div role="status" className="auth-message-info">
            <h2 className="font-display text-lg font-bold text-primary">{t("auth.resetSentTitle")}</h2>
            <p className="mt-2 leading-6">{t("auth.resetSentBody")}</p>
          </div>
          <Link to="/login" className="auth-submit inline-flex">{t("auth.backToSignIn")}</Link>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <label htmlFor="forgot-email" className="auth-label">{t("auth.emailLabel")}</label>
            <input
              id="forgot-email"
              className="auth-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              required
              aria-required="true"
              aria-invalid={errorKey === "auth.emailRequired" || errorKey === "auth.emailInvalid"}
            />
          </div>
          {errorKey && <p role="alert" className="auth-message-error">{t(errorKey)}</p>}
          <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
            {t(busy ? "auth.sendingReset" : "auth.forgotButton")}
          </button>
          <Link to="/login" className="block text-center text-sm font-bold text-primary underline-offset-4 hover:underline">{t("auth.backToSignIn")}</Link>
        </form>
      )}
    </AuthLayout>
  );
}
