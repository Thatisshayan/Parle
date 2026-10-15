import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/parle/AuthLayout";
import { authErrorKey, isValidEmail, passwordMeetsRequirements, signUp } from "@/lib/auth-pages";
import { VerifyEmailCode } from "@/components/parle/VerifyEmailCode";
import { t, type TranslationKey } from "@/lib/i18n";
import { createMyIdentity, getMyIdentity, initializeMySignupProfile, roleHomePath, type ParleRole, type ParleUser } from "@/lib/parle-profile";
import { User } from "@/entities";
import { superdevClient } from "@/lib/superdev/client";

export default function Signup() {
  const location = useLocation();
  const navigate = useNavigate();
  const requestedRole = new URLSearchParams(location.search).get("role");
  const role: ParleRole = requestedRole === "tutor" ? "tutor" : "learner";
  const isTutor = role === "tutor";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  useEffect(() => {
    let active = true;
    const redirectSignedIn = async () => {
      try {
        const authenticated = await superdevClient.isAuthenticated();
        if (!authenticated || !active) return;
        const user = (await User.me()) as ParleUser;
        const identity = user.role === "administrator" ? null : await getMyIdentity();
        if (active) {
          const destination = identity?.role === "tutor" ? "/tutor/application" : roleHomePath(user.role, identity);
          navigate(destination, { replace: true });
        }
      } catch {
        // A new account can still be created if a previous session has expired.
      }
    };
    void redirectSignedIn();
    return () => {
      active = false;
    };
  }, [navigate]);

  async function completeParleSetup(ageConfirmed: boolean) {
    try {
      await initializeMySignupProfile();
    } catch (error) {
      console.error("Parle signup time zone setup failed", error);
      setErrorKey("auth.timeZoneSetupError");
      return;
    }

    try {
      const identity = await createMyIdentity(role, ageConfirmed);
      navigate(identity.role === "tutor" ? "/tutor/application" : "/learner", { replace: true });
    } catch (error) {
      console.error("Parle role setup failed", error);
      setErrorKey("auth.profileSetupError");
    }
  }

  async function finishParleSetup() {
    setBusy(true);
    setErrorKey(null);
    try {
      await completeParleSetup(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanName) return setErrorKey("auth.nameRequired");
    if (!cleanEmail) return setErrorKey("auth.emailRequired");
    if (!isValidEmail(cleanEmail)) return setErrorKey("auth.emailInvalid");
    if (!passwordMeetsRequirements(password)) return setErrorKey("auth.passwordWeak");
    if (!ageConfirmed) return setErrorKey("auth.ageRequired");

    setBusy(true);
    try {
      await signUp(cleanName, cleanEmail, password);
      setAwaitingCode(true); // the account exists; it is usable once the emailed code is entered
    } catch (error) {
      console.error("Parle account creation failed", error);
      setErrorKey(authErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  async function afterEmailVerified() {
    setAwaitingCode(false);
    setAccountCreated(true);
    setBusy(true);
    try {
      await completeParleSetup(ageConfirmed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      titleKey={isTutor ? "auth.tutorSignupTitle" : "auth.signupTitle"}
      descriptionKey={isTutor ? "auth.tutorSignupDescription" : "auth.signupDescription"}
    >
      {awaitingCode ? (
        <VerifyEmailCode email={email.trim()} onVerified={afterEmailVerified} />
      ) : accountCreated ? (
        <div className="space-y-5">
          <p role="status" className="auth-message-info">{t("auth.profileSetupPending")}</p>
          {errorKey && <p role="alert" className="auth-message-error">{t(errorKey)}</p>}
          <button type="button" className="auth-submit" onClick={finishParleSetup} disabled={busy} aria-busy={busy}>
            {t(busy ? "auth.profileSetupWorking" : "auth.profileSetupRetry")}
          </button>
          <Link to="/login" className="block text-center text-sm font-bold text-primary underline-offset-4 hover:underline">{t("auth.backToSignIn")}</Link>
        </div>
      ) : (
        <>
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <label htmlFor="signup-name" className="auth-label">{t("auth.nameLabel")}</label>
              <input
                id="signup-name"
                className="auth-input"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("auth.namePlaceholder")}
                required
                aria-required="true"
                aria-invalid={errorKey === "auth.nameRequired"}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="signup-email" className="auth-label">{t("auth.emailLabel")}</label>
              <input
                id="signup-email"
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
            <div className="space-y-2">
              <label htmlFor="signup-password" className="auth-label">{t("auth.passwordLabel")}</label>
              <input
                id="signup-password"
                className="auth-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                required
                aria-required="true"
                aria-describedby="password-hint"
                aria-invalid={errorKey === "auth.passwordWeak"}
              />
              <p id="password-hint" className="text-xs leading-5 text-muted-foreground">{t("auth.passwordHint")}</p>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 text-sm leading-6 text-foreground">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                checked={ageConfirmed}
                onChange={(event) => setAgeConfirmed(event.target.checked)}
                required
                aria-required="true"
                aria-invalid={errorKey === "auth.ageRequired"}
              />
              <span>{t("auth.ageConfirmation")}</span>
            </label>
            {errorKey && <p role="alert" className="auth-message-error">{t(errorKey)}</p>}
            <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
              {t(busy ? "auth.creatingAccount" : "auth.signupButton")}
            </button>
          </form>
          <p className="mt-5 rounded-2xl bg-[#EEF2FA] p-4 text-sm leading-6 text-muted-foreground">
            {t(isTutor ? "auth.tutorRoleNote" : "auth.learnerRoleNote")}
          </p>
          <p className="mt-6 border-t border-primary/10 pt-6 text-sm text-muted-foreground">
            {t("auth.haveAccount")} <Link to="/login" className="font-bold text-primary underline-offset-4 hover:underline">{t("common.signIn")}</Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
