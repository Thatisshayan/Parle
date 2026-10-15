import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/parle/AuthLayout";
import { authErrorKey, afterLoginPath, isValidEmail, resendSignupCode, signIn } from "@/lib/auth-pages";
import { t, type TranslationKey } from "@/lib/i18n";
import { getMyIdentity, roleHomePath, type ParleUser } from "@/lib/parle-profile";
import { User } from "@/entities";
import { VerifyEmailCode } from "@/components/parle/VerifyEmailCode";
import { superdevClient } from "@/lib/superdev/client";

interface LoginProps {
  admin?: boolean;
}

export default function Login({ admin = false }: LoginProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [awaitingCode, setAwaitingCode] = useState(false);

  useEffect(() => {
    let active = true;
    const redirectSignedIn = async () => {
      try {
        const authenticated = await superdevClient.isAuthenticated();
        if (!authenticated || !active) return;
        const user = (await User.me()) as ParleUser;
        const identity = user.role === "administrator" ? null : await getMyIdentity();
        if (!active) return;
        const home = roleHomePath(user.role, identity);
        if (admin) {
          navigate(user.role === "administrator" ? "/admin" : identity ? home : "/login", { replace: true });
        } else {
          const requested = afterLoginPath();
          navigate(requested === "/" || requested === "/login" || requested === "/admin/login" ? home : requested, { replace: true });
        }
      } catch {
        // The form remains available if an old session cannot be loaded.
      }
    };
    void redirectSignedIn();
    return () => {
      active = false;
    };
  }, [admin, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) return setErrorKey("auth.emailRequired");
    if (!isValidEmail(cleanEmail)) return setErrorKey("auth.emailInvalid");
    if (!password) return setErrorKey("auth.passwordRequired");

    setBusy(true);
    try {
      await routeSignedIn((await signIn(cleanEmail, password)) as ParleUser);
    } catch (error) {
      console.error("Parle sign-in failed", error);
      const key = authErrorKey(error);
      // An account that never entered its emailed code: offer the code step here (a new code is sent on request).
      if (!admin && key === "auth.error.emailNotConfirmed") {
        await resendSignupCode(cleanEmail).catch(() => undefined);
        setAwaitingCode(true);
      }
      else setErrorKey(key);
    } finally {
      setBusy(false);
    }
  }

  async function routeSignedIn(user: ParleUser) {
    const identity = user.role === "administrator" ? null : await getMyIdentity();
    const home = roleHomePath(user.role, identity);
    if (admin) {
      navigate(user.role === "administrator" ? "/admin" : identity ? home : "/login", { replace: true });
    } else {
      const requested = afterLoginPath();
      navigate(requested === "/" || requested === "/login" || requested === "/admin/login" ? home : requested, { replace: true });
    }
  }

  return (
    <AuthLayout
      admin={admin}
      titleKey={admin ? "auth.adminLoginTitle" : "auth.loginTitle"}
      descriptionKey={admin ? "auth.adminLoginDescription" : "auth.loginDescription"}
    >
      {awaitingCode ? (
        <VerifyEmailCode email={email.trim()} password={password} onVerified={routeSignedIn} />
      ) : (
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div className="space-y-2">
          <label htmlFor="login-email" className="auth-label">{t("auth.emailLabel")}</label>
          <input
            id="login-email"
            className="auth-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            required
            aria-required="true"
            aria-invalid={!!errorKey && (errorKey === "auth.emailRequired" || errorKey === "auth.emailInvalid")}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="login-password" className="auth-label">{t("auth.passwordLabel")}</label>
          <input
            id="login-password"
            className="auth-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            required
            aria-required="true"
            aria-invalid={!!errorKey && errorKey === "auth.passwordRequired"}
          />
        </div>
        {!admin && (
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm font-bold text-primary underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              {t("auth.forgotLink")}
            </Link>
          </div>
        )}
        {errorKey && <p role="alert" className="auth-message-error">{t(errorKey)}</p>}
        <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
          {t(busy ? "auth.loggingIn" : "auth.loginButton")}
        </button>
      </form>
      )}

      {admin ? (
        <p className="mt-6 rounded-2xl bg-[#EEF2FA] p-4 text-sm leading-6 text-muted-foreground">{t("auth.adminNoSignup")}</p>
      ) : (
        <div className="mt-7 space-y-4 border-t border-primary/10 pt-6 text-sm">
          <p className="text-muted-foreground">
            {t("auth.noAccount")} <Link to="/signup" className="font-bold text-primary underline-offset-4 hover:underline">{t("auth.createLearnerLink")}</Link>
          </p>
          <p className="text-muted-foreground">
            {t("auth.tutorCtaLabel")} <Link to="/signup?role=tutor" className="font-bold text-primary underline-offset-4 hover:underline">{t("auth.createTutorLink")}</Link>
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
