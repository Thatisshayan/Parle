import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, Download, KeyRound, Languages, Layers, MapPinned, Upload, UserRound } from "lucide-react";
import { uploadFile } from "@/integrations/core";
import { Brand } from "@/components/parle/Brand";
import { t, type TranslationKey } from "@/lib/i18n";
import { authErrorKey, requestPasswordReset } from "@/lib/auth-pages";
import {
  browserTimeZone,
  deleteMyAccount,
  exportMyParleData,
  imageUrlForDisplay,
  isValidIanaTimeZone,
  loadMyParleAccount,
  NATIVE_LANGUAGE_VALUES,
  roleHomePath,
  saveMyProfile,
  type ParleAccountData,
} from "@/lib/parle-profile";
import { superdevClient } from "@/lib/superdev/client";

export function accountPlanPath(identity: { role?: string } | null | undefined): string {
  return identity?.role === "learner" ? "/learner/plan" : "/plan";
}

const languageOptions: { value: (typeof NATIVE_LANGUAGE_VALUES)[number]; label: TranslationKey }[] = [
  { value: "English", label: "language.english" },
  { value: "French", label: "language.french" },
  { value: "Spanish", label: "language.spanish" },
  { value: "Portuguese", label: "language.portuguese" },
  { value: "Arabic", label: "language.arabic" },
  { value: "Persian", label: "language.persian" },
  { value: "Hindi", label: "language.hindi" },
  { value: "Punjabi", label: "language.punjabi" },
  { value: "Urdu", label: "language.urdu" },
  { value: "Tagalog", label: "language.tagalog" },
  { value: "Mandarin", label: "language.mandarin" },
  { value: "Vietnamese", label: "language.vietnamese" },
  { value: "Ukrainian", label: "language.ukrainian" },
  { value: "Russian", label: "language.russian" },
  { value: "Turkish", label: "language.turkish" },
  { value: "Other", label: "language.other" },
];

export default function Settings() {
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<TranslationKey | null>(null);
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [account, setAccount] = useState<ParleAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [language, setLanguage] = useState("");
  const [emailUpdates, setEmailUpdates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<TranslationKey | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<TranslationKey | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<TranslationKey | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const authenticated = await superdevClient.isAuthenticated();
        if (!active) return;
        if (!authenticated) {
          navigate(`/login?from_url=${encodeURIComponent(window.location.href)}`, { replace: true });
          return;
        }
        const data = await loadMyParleAccount();
        if (!active) return;
        setAccount(data);
        setName(data.user.full_name ?? "");
        setPhotoUrl(data.profile?.photo_url ?? "");
        setTimeZone(data.profile?.time_zone || browserTimeZone());
        setLanguage(data.profile?.native_language ?? "");
        setEmailUpdates(data.profile?.email_product_updates ?? false);
        setLoading(false);
      } catch (error) {
        console.error("Parle settings could not be loaded", error);
        if (active) {
          setLoadError(true);
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveMessage(null);
    if (!name.trim()) return setSaveMessage("settings.nameError");
    if (!isValidIanaTimeZone(timeZone)) return setSaveMessage("settings.timeZoneError");
    if (language && !NATIVE_LANGUAGE_VALUES.includes(language as (typeof NATIVE_LANGUAGE_VALUES)[number])) {
      return setSaveMessage("settings.languageError");
    }
    setSaving(true);
    try {
      const updated = await saveMyProfile({
        full_name: name.trim(),
        photo_url: photoUrl,
        time_zone: timeZone.trim(),
        native_language: language,
        email_product_updates: emailUpdates,
      });
      setAccount(updated);
      setName(updated.user.full_name ?? "");
      setSaveMessage("settings.saveSuccess");
    } catch (error) {
      console.error("Parle settings could not be saved", error);
      const reason = error instanceof Error ? error.message.toLowerCase() : "";
      if (reason.includes("time zone")) setSaveMessage("settings.timeZoneError");
      else if (reason.includes("name")) setSaveMessage("settings.nameError");
      else if (reason.includes("language")) setSaveMessage("settings.languageError");
      else setSaveMessage("settings.saveError");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPhotoMessage(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoMessage("settings.photoTypeError");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoMessage("settings.photoSizeError");
      return;
    }
    setPhotoBusy(true);
    try {
      const uploaded = await uploadFile({ file });
      setPhotoUrl(uploaded.file_url);
      setPhotoMessage("settings.photoReady");
    } catch (error) {
      console.error("Parle profile photo upload failed", error);
      setPhotoMessage("settings.photoUploadError");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handlePasswordReset() {
    if (!account?.user.email) return;
    setResetMessage(null);
    setResetError(false);
    setResetBusy(true);
    try {
      await requestPasswordReset(account.user.email);
      setResetMessage(t("settings.resetSent"));
    } catch (error) {
      console.error("Parle password reset request failed", error);
      setResetError(true);
      setResetMessage(t(authErrorKey(error)));
    } finally {
      setResetBusy(false);
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteBusy) return;
    if (deleteConfirm.trim() !== "DELETE") return setDeleteError("settings.delete.error.confirm");
    setDeleteBusy(true);
    setDeleteError(null);
    const code = await deleteMyAccount(deletePassword, deleteConfirm.trim());
    if (!code) {
      await superdevClient.auth.logout().catch(() => undefined);
      navigate("/", { replace: true });
      return;
    }
    setDeleteBusy(false);
    setDeleteError(code === "PASSWORD_INCORRECT" ? "settings.delete.error.password" : code === "ACTIVE_SUBSCRIPTION" ? "settings.delete.error.subscription" : code === "CONFIRMATION_REQUIRED" ? "settings.delete.error.confirm" : "settings.delete.error.generic");
  }

  async function handleDownload() {
    setDownloadMessage(null);
    setDownloadBusy(true);
    try {
      const data = await exportMyParleData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = t("settings.downloadFilename");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadMessage("settings.downloadReady");
    } catch (error) {
      console.error("Parle data export failed", error);
      setDownloadMessage("settings.downloadError");
    } finally {
      setDownloadBusy(false);
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-background px-4"><p className="text-sm font-semibold text-muted-foreground">{t("common.loading")}</p></main>;
  }

  if (loadError || !account) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <section className="w-full max-w-xl rounded-[2rem] border border-primary/10 bg-white p-7 text-center shadow-[0_24px_72px_-48px_rgba(30,58,138,0.4)] sm:p-10">
          <div className="mb-7 flex justify-center"><Brand compact /></div>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("settings.loadError")}</h1>
          <Link to="/" className="parle-button-primary mt-7 justify-center">{t("common.backHome")}</Link>
        </section>
      </main>
    );
  }

  const workspacePath = roleHomePath(account.user.role, account.identity);
  const planPath = accountPlanPath(account.identity);
  const displayPhoto = imageUrlForDisplay(photoUrl, 240);

  return (
    <div className="min-h-screen bg-[#F7F8FB]">
      <header className="border-b border-primary/10 bg-white">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Brand compact />
          <Link to={workspacePath} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            <span>{t("settings.backToWorkspace")}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-9 sm:px-6 sm:py-12 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C64D43]">{t("placeholder.eyebrow")}</p>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.05em] text-primary sm:text-4xl">{t("settings.title")}</h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">{t("settings.intro")}</p>
        </div>

        <form onSubmit={handleSave} noValidate className="space-y-5">
          <section className="rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(30,58,138,0.35)] sm:p-8">
            <div>
              <h2 className="font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{t("settings.profileSection")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("settings.profileDescription")}</p>
            </div>

            <div className="mt-7 flex flex-col gap-5 border-b border-primary/10 pb-7 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#EEF2FA] text-primary shadow-[0_0_0_1px_rgba(30,58,138,0.12)]">
                {displayPhoto ? <img src={displayPhoto} alt={t("settings.photoAlt")} className="h-full w-full object-cover" /> : <UserRound aria-hidden="true" className="h-8 w-8" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">{t("settings.photoLabel")}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("settings.photoHint")}</p>
                <input ref={fileInput} className="sr-only" type="file" accept="image/*" onChange={handlePhotoChange} aria-label={t("settings.photoLabel")} tabIndex={-1} />
                <button type="button" className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-sm font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => fileInput.current?.click()} disabled={photoBusy} aria-busy={photoBusy}>
                  <Upload aria-hidden="true" className="h-4 w-4" />
                  <span>{t(photoBusy ? "settings.photoUploading" : "settings.photoChoose")}</span>
                </button>
                {photoMessage && <p role="status" className={`mt-2 text-xs leading-5 ${photoMessage === "settings.photoReady" ? "text-primary" : "text-destructive"}`}>{t(photoMessage)}</p>}
              </div>
            </div>

            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="profile-name" className="settings-label">{t("settings.nameLabel")}</label>
                <input id="profile-name" className="settings-input" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required aria-required="true" aria-invalid={saveMessage === "settings.nameError"} />
              </div>
              <div className="space-y-2">
                <label htmlFor="profile-email" className="settings-label">{t("settings.emailLabel")}</label>
                <input id="profile-email" className="settings-input settings-input-readonly" type="email" value={account.user.email} readOnly aria-describedby="profile-email-note" />
                <p id="profile-email-note" className="text-xs leading-5 text-muted-foreground">{t("settings.emailNote")}</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="profile-time-zone" className="settings-label">{t("settings.timeZoneLabel")}</label>
                <input id="profile-time-zone" className="settings-input min-w-0" type="text" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder={t("settings.timeZonePlaceholder")} required aria-required="true" aria-invalid={saveMessage === "settings.timeZoneError"} />
                <button type="button" className="inline-flex items-center gap-2 text-xs font-bold text-primary underline-offset-4 hover:underline" onClick={() => setTimeZone(browserTimeZone())}>
                  <MapPinned aria-hidden="true" className="h-4 w-4" />
                  <span>{t("settings.detectTimeZone")}</span>
                </button>
              </div>
              <div className="space-y-2">
                <label htmlFor="profile-language" className="settings-label">{t("settings.nativeLanguageLabel")}</label>
                <div className="relative">
                  <Languages aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <select id="profile-language" className="settings-input appearance-none pl-10" value={language} onChange={(event) => setLanguage(event.target.value)}>
                    <option value="">{t("settings.nativeLanguagePlaceholder")}</option>
                    {languageOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <label className="mt-7 flex cursor-pointer items-start gap-3 rounded-2xl bg-[#FAF9F5] p-4">
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" checked={emailUpdates} onChange={(event) => setEmailUpdates(event.target.checked)} />
              <span>
                <span className="block text-sm font-bold text-foreground">{t("settings.emailPreferencesLabel")}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t("settings.emailPreferencesHelp")}</span>
              </span>
            </label>

            {saveMessage && <p role="status" className={`mt-5 text-sm font-semibold ${saveMessage === "settings.saveSuccess" ? "text-primary" : "text-destructive"}`}>{t(saveMessage)}</p>}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="submit" className="parle-button-primary justify-center" disabled={saving} aria-busy={saving}>
                {t(saving ? "settings.saving" : "settings.saveButton")}
              </button>
              {saving && <span className="text-xs text-muted-foreground">{t("common.saving")}</span>}
            </div>
          </section>
        </form>

        <section className="mt-5 rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(30,58,138,0.35)] sm:p-8">
          <div>
            <h2 className="font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{t("settings.accountSection")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("settings.accountDescription")}</p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary"><KeyRound aria-hidden="true" className="h-4 w-4" /></span>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">{t("settings.passwordTitle")}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("settings.passwordDescription")}</p>
                </div>
              </div>
              <button type="button" onClick={handlePasswordReset} disabled={resetBusy} aria-busy={resetBusy} className="mt-5 text-sm font-bold text-primary underline-offset-4 hover:underline">
                {t(resetBusy ? "settings.sendingReset" : "settings.sendReset")}
              </button>
              {resetMessage && <p role={resetError ? "alert" : "status"} className={`mt-3 text-xs leading-5 ${resetError ? "text-destructive" : "text-muted-foreground"}`}>{resetMessage}</p>}
            </article>
            <article className="rounded-2xl border border-primary/10 bg-[#FAF9F5] p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary"><Layers aria-hidden="true" className="h-4 w-4" /></span>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">{t("settings.planTitle")}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("settings.planDescription")}</p>
                </div>
              </div>
              <Link to={planPath} className="mt-5 inline-block text-sm font-bold text-primary underline-offset-4 hover:underline">{t("settings.planLink")}</Link>
            </article>
          </div>
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(30,58,138,0.35)] sm:p-8">
          <div>
            <h2 className="font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{t("settings.dataSection")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("settings.dataDescription")}</p>
          </div>
          <button type="button" onClick={handleDownload} disabled={downloadBusy} aria-busy={downloadBusy} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary/20 px-5 py-2.5 text-sm font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <Download aria-hidden="true" className="h-4 w-4" />
            <span>{t("settings.downloadData")}</span>
          </button>
          {downloadMessage && <p role="status" className={`mt-3 text-sm font-semibold ${downloadMessage === "settings.downloadReady" ? "text-primary" : "text-destructive"}`}>{t(downloadMessage)}</p>}
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-[#F3C9C3] bg-[#FFF5F2] p-5 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#A13F36]"><AlertCircle aria-hidden="true" className="h-5 w-5" /></span>
            <div>
              <h2 className="font-display text-lg font-extrabold tracking-[-0.03em] text-[#8D342D]">{t("settings.deleteNoticeTitle")}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[#6F4541]">{t("settings.deleteNotice")}</p>
            </div>
          </div>
          <form className="mt-5 grid gap-4 sm:max-w-md" onSubmit={handleDeleteAccount} noValidate>
            <div className="space-y-2">
              <label htmlFor="delete-password" className="text-sm font-bold text-[#6F4541]">{t("settings.delete.password")}</label>
              <input id="delete-password" type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className="auth-input" />
            </div>
            <div className="space-y-2">
              <label htmlFor="delete-confirm" className="text-sm font-bold text-[#6F4541]">{t("settings.delete.confirm")}</label>
              <input id="delete-confirm" type="text" autoComplete="off" value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} className="auth-input" />
            </div>
            {deleteError && <p role="alert" className="text-sm font-semibold text-destructive">{t(deleteError)}</p>}
            <button type="submit" disabled={deleteBusy} aria-busy={deleteBusy} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#A13F36] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#8D342D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60">
              {t(deleteBusy ? "settings.delete.working" : "settings.delete.button")}
            </button>
          </form>
        </section>

      </main>
    </div>
  );
}
