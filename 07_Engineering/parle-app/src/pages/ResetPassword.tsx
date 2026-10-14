import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/components/parle/AuthLayout";
import { authErrorKey, passwordMeetsRequirements, resetPassword } from "@/lib/auth-pages";
import { t, type TranslationKey } from "@/lib/i18n";

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    if (!passwordMeetsRequirements(password)) return setErrorKey("auth.passwordWeak");
    setBusy(true);
    try {
      await resetPassword(token, password);
      toast.success(t("auth.resetSuccess"));
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Parle password reset failed", error);
      setErrorKey(authErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout titleKey="auth.resetTitle" descriptionKey="auth.resetDescription">
      {!token ? (
        <div className="space-y-5">
          <div role="alert" className="auth-message-error">
            <h2 className="font-display text-lg font-bold">{t("auth.invalidResetTitle")}</h2>
            <p className="mt-2 leading-6">{t("auth.invalidResetBody")}</p>
          </div>
          <Link to="/forgot-password" className="auth-submit inline-flex">{t("auth.forgotButton")}</Link>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <label htmlFor="reset-password" className="auth-label">{t("auth.passwordLabel")}</label>
            <input
              id="reset-password"
              className="auth-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.newPasswordPlaceholder")}
              required
              aria-required="true"
              aria-describedby="reset-password-hint"
              aria-invalid={errorKey === "auth.passwordWeak"}
            />
            <p id="reset-password-hint" className="text-xs leading-5 text-muted-foreground">{t("auth.passwordHint")}</p>
          </div>
          {errorKey && <p role="alert" className="auth-message-error">{t(errorKey)}</p>}
          <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
            {t(busy ? "auth.resetting" : "auth.resetButton")}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
