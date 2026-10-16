import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Check, CircleAlert, Clock3, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { parleMarketplaceService } from "@/functions";
import { t, type TranslationKey } from "@/lib/i18n";
import { formatCadCents, lengthsBelowMinimum } from "@/lib/parle-booking";

type Rule = { id?: string; day_of_week: number; start_local: string; end_local: string };
type Exception = { id?: string; date_local: string; kind: "off" | "extra"; start_local: string; end_local: string };
type AvailabilityPayload = { time_zone: string; rules: Rule[]; exceptions: Exception[] };
type BookingSettings = { lesson_lengths_minutes: number[]; buffer_minutes: 0 | 10 | 15; minimum_notice_hours: 12 | 24 | 48; booking_window_days: 30 };
const allowedDurations = [30, 45, 60] as const;

function safeBookingSettings(value: unknown): BookingSettings {
  const source = isObject(value) ? value : {};
  const durations = Array.isArray(source.lesson_lengths_minutes)
    ? [...new Set(source.lesson_lengths_minutes.filter((item): item is number => allowedDurations.includes(item as typeof allowedDurations[number])))].sort((a, b) => a - b)
    : [...allowedDurations];
  const buffer = [0, 10, 15].includes(Number(source.buffer_minutes)) ? Number(source.buffer_minutes) as BookingSettings["buffer_minutes"] : 0;
  const notice = [12, 24, 48].includes(Number(source.minimum_notice_hours)) ? Number(source.minimum_notice_hours) as BookingSettings["minimum_notice_hours"] : 12;
  return { lesson_lengths_minutes: durations, buffer_minutes: buffer, minimum_notice_hours: notice, booking_window_days: 30 };
}

const dayKeys = [
  "tutorAvailability.day.monday",
  "tutorAvailability.day.tuesday",
  "tutorAvailability.day.wednesday",
  "tutorAvailability.day.thursday",
  "tutorAvailability.day.friday",
  "tutorAvailability.day.saturday",
  "tutorAvailability.day.sunday",
] as const;
const defaultRule = (day: number): Rule => ({ day_of_week: day, start_local: "09:00", end_local: "17:00" });

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrap(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let index = 0; index < 5; index += 1) {
    if (!isObject(current)) break;
    if (isObject(current.result)) { current = current.result; continue; }
    if (isObject(current.data) && ("status" in current.data || "error" in current.data)) { current = current.data; continue; }
    break;
  }
  return isObject(current) ? current : {};
}

async function marketplace(action: string, values: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const response = unwrap(await parleMarketplaceService({ action, ...values }));
  if (typeof response.error === "string" || response.status === "error") throw new Error(typeof response.code === "string" ? response.code : "REQUEST_FAILED");
  return response;
}

function isLocalTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function inputClass(): string {
  return "min-h-11 w-full min-w-0 rounded-xl border border-primary/15 bg-white px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-[#F97362]/30";
}

export default function TutorAvailability() {
  const [payload, setPayload] = useState<AvailabilityPayload | null>(null);
  const [activeDays, setActiveDays] = useState<boolean[]>(Array.from({ length: 7 }, () => false));
  const [rules, setRules] = useState<Rule[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings>({ lesson_lengths_minutes: [...allowedDurations], buffer_minutes: 0, minimum_notice_hours: 12, booking_window_days: 30 });
  const [priceFloor, setPriceFloor] = useState({ rate: 0, minimum: 800 });
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionKind, setExceptionKind] = useState<"off" | "extra">("off");
  const [exceptionStart, setExceptionStart] = useState("10:00");
  const [exceptionEnd, setExceptionEnd] = useState("14:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [errorKey, setErrorKey] = useState("");
  const [bookingSettingsError, setBookingSettingsError] = useState("");
  const [saved, setSaved] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await marketplace("tutor_get_availability");
      const loadedRules = Array.isArray(result.rules) ? result.rules.filter(isObject).map((item) => ({ id: typeof item.id === "string" ? item.id : undefined, day_of_week: Number(item.day_of_week), start_local: String(item.start_local ?? "09:00"), end_local: String(item.end_local ?? "17:00") })) : [];
      const loadedExceptions = Array.isArray(result.exceptions) ? result.exceptions.filter(isObject).map((item) => ({ id: typeof item.id === "string" ? item.id : undefined, date_local: String(item.date_local ?? ""), kind: item.kind === "extra" ? "extra" as const : "off" as const, start_local: String(item.start_local ?? ""), end_local: String(item.end_local ?? "") })) : [];
      const nextPayload = { time_zone: typeof result.time_zone === "string" ? result.time_zone : "UTC", rules: loadedRules, exceptions: loadedExceptions };
      const days = Array.from({ length: 7 }, () => false);
      loadedRules.forEach((rule) => { if (rule.day_of_week >= 1 && rule.day_of_week <= 7) days[rule.day_of_week - 1] = true; });
      setPayload(nextPayload);
      setRules(loadedRules);
      setExceptions(loadedExceptions);
      setBookingSettings(safeBookingSettings(result.booking_settings));
      setPriceFloor({ rate: Number(result.hourly_rate_cents) || 0, minimum: Number(result.minimum_lesson_charge_cents) || 800 });
      setActiveDays(days);
      setSaved(false);
      setSettingsSaved(false);
      setLoading(false);
    } catch (error) {
      console.error("Tutor availability could not be loaded", error);
      setLoadError(true);
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const scheduleRows = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const day = index + 1;
    return rules.find((rule) => rule.day_of_week === day) ?? defaultRule(day);
  }), [rules]);

  function toggleDay(index: number, checked: boolean) {
    setActiveDays((current) => current.map((active, item) => item === index ? checked : active));
    setRules((current) => checked ? (current.some((rule) => rule.day_of_week === index + 1) ? current : [...current, defaultRule(index + 1)]) : current.filter((rule) => rule.day_of_week !== index + 1));
    setSaved(false);
    setErrorKey("");
  }

  function updateRule(day: number, field: "start_local" | "end_local", value: string) {
    setRules((current) => {
      const existing = current.find((rule) => rule.day_of_week === day) ?? defaultRule(day);
      return [...current.filter((rule) => rule.day_of_week !== day), { ...existing, [field]: value }].sort((a, b) => a.day_of_week - b.day_of_week);
    });
    setSaved(false);
    setErrorKey("");
  }

  function addException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey("");
    if (!isDate(exceptionDate) || exceptions.some((item) => item.date_local === exceptionDate)) {
      setErrorKey(exceptions.some((item) => item.date_local === exceptionDate) ? "tutorAvailability.error.duplicateDate" : "tutorAvailability.error.date");
      return;
    }
    if (exceptionKind === "extra" && (!isLocalTime(exceptionStart) || !isLocalTime(exceptionEnd) || exceptionStart >= exceptionEnd)) {
      setErrorKey("tutorAvailability.error.hours");
      return;
    }
    setExceptions((current) => [...current, { date_local: exceptionDate, kind: exceptionKind, start_local: exceptionKind === "extra" ? exceptionStart : "", end_local: exceptionKind === "extra" ? exceptionEnd : "" }].sort((a, b) => a.date_local.localeCompare(b.date_local)));
    setExceptionDate("");
    setSaved(false);
  }

  async function save() {
    if (!payload) return;
    setErrorKey("");
    setSaved(false);
    const enabled = rules.filter((rule) => activeDays[rule.day_of_week - 1]);
    if (enabled.some((rule) => !isLocalTime(rule.start_local) || !isLocalTime(rule.end_local) || rule.start_local >= rule.end_local)) {
      setErrorKey("tutorAvailability.error.hours");
      return;
    }
    if (exceptions.some((item) => !isDate(item.date_local) || (item.kind === "extra" && (!isLocalTime(item.start_local) || !isLocalTime(item.end_local) || item.start_local >= item.end_local)))) {
      setErrorKey("tutorAvailability.error.exception");
      return;
    }
    setSaving(true);
    try {
      const result = await marketplace("tutor_save_availability", { rules: enabled, exceptions });
      const loadedRules = Array.isArray(result.rules) ? result.rules.filter(isObject).map((item) => ({ id: typeof item.id === "string" ? item.id : undefined, day_of_week: Number(item.day_of_week), start_local: String(item.start_local ?? ""), end_local: String(item.end_local ?? "") })) : enabled;
      const loadedExceptions = Array.isArray(result.exceptions) ? result.exceptions.filter(isObject).map((item) => ({ id: typeof item.id === "string" ? item.id : undefined, date_local: String(item.date_local ?? ""), kind: item.kind === "extra" ? "extra" as const : "off" as const, start_local: String(item.start_local ?? ""), end_local: String(item.end_local ?? "") })) : exceptions;
      setRules(loadedRules);
      setExceptions(loadedExceptions);
      setActiveDays(Array.from({ length: 7 }, (_, index) => loadedRules.some((rule) => rule.day_of_week === index + 1)));
      setSaved(true);
    } catch (error) {
      console.error("Tutor availability could not be saved", error);
      setErrorKey("tutorAvailability.error.save");
    } finally {
      setSaving(false);
    }
  }

  function toggleLessonLength(duration: number, enabled: boolean) {
    setBookingSettings((current) => ({
      ...current,
      lesson_lengths_minutes: enabled
        ? [...new Set([...current.lesson_lengths_minutes, duration])].sort((left, right) => left - right)
        : current.lesson_lengths_minutes.filter((item) => item !== duration),
    }));
    setSettingsSaved(false);
    setBookingSettingsError("");
  }

  async function saveBookingSettings() {
    setBookingSettingsError("");
    setSettingsSaved(false);
    setSettingsSaving(true);
    try {
      const savedSettings = await marketplace("tutor_save_booking_settings", bookingSettings);
      const reloaded = await marketplace("tutor_get_availability");
      setBookingSettings(safeBookingSettings(reloaded.booking_settings ?? savedSettings.booking_settings));
      setSettingsSaved(true);
    } catch (error) {
      console.error("Tutor booking settings could not be saved and reloaded", error);
      setBookingSettingsError("tutorAvailability.error.bookingSettings");
    } finally {
      setSettingsSaving(false);
    }
  }

  if (loading) return <div className="rounded-[1.75rem] border border-primary/10 bg-white p-7 text-sm font-semibold text-muted-foreground">{t("tutorAvailability.loading")}</div>;
  if (loadError || !payload) return <section className="rounded-[1.75rem] border border-[#F3C9C3] bg-white p-6"><p role="alert" className="text-sm leading-6 text-[#8D342D]">{t("tutorAvailability.loadError")}</p><button type="button" onClick={() => void load()} className="parle-button-primary mt-5 justify-center">{t("tutorAvailability.retry")}</button></section>;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(30,58,138,0.35)] sm:p-8">
        <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FA] text-primary"><CalendarDays aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#C64D43]">{t("tutorAvailability.eyebrow")}</p><h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em] text-primary">{t("tutorAvailability.title")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("tutorAvailability.intro")}</p></div></div>
        <div className="mt-6 flex flex-col gap-2 rounded-2xl border border-primary/10 bg-[#FAF9F5] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-muted-foreground">{t("tutorAvailability.timeZoneLabel")}</p><p className="mt-1 break-all font-display text-lg font-extrabold text-primary">{payload.time_zone}</p></div><Link to="/tutor/application" className="text-sm font-bold text-primary underline-offset-4 hover:underline">{t("tutorAvailability.changeTimeZone")}</Link></div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">{t("tutorAvailability.localTimeNote")}</p>
        <div className="mt-6 space-y-3">
          {scheduleRows.map((rule, index) => (
            <motion.article key={rule.day_of_week} layout className={`rounded-2xl border p-4 transition ${activeDays[index] ? "border-primary/15 bg-white" : "border-primary/10 bg-[#FAF9F5]"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3"><label htmlFor={`availability-day-${index}`} className="flex items-center gap-3 text-sm font-extrabold text-foreground"><input id={`availability-day-${index}`} type="checkbox" className="h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]" checked={activeDays[index]} onChange={(event) => toggleDay(index, event.target.checked)} />{t(dayKeys[index])}</label><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${activeDays[index] ? "bg-[#E8F4EC] text-[#236646]" : "bg-[#EEF2FA] text-muted-foreground"}`}>{t(activeDays[index] ? "tutorAvailability.available" : "tutorAvailability.off")}</span></div>
              <AnimatePresence initial={false}>{activeDays[index] && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="grid gap-3 overflow-hidden pt-4 sm:grid-cols-2"><div className="space-y-1.5"><label htmlFor={`start-${index}`} className="text-xs font-bold text-muted-foreground">{t("tutorAvailability.startTime")}</label><input id={`start-${index}`} type="time" className={inputClass()} value={rule.start_local} onChange={(event) => updateRule(rule.day_of_week, "start_local", event.target.value)} /></div><div className="space-y-1.5"><label htmlFor={`end-${index}`} className="text-xs font-bold text-muted-foreground">{t("tutorAvailability.endTime")}</label><input id={`end-${index}`} type="time" className={inputClass()} value={rule.end_local} onChange={(event) => updateRule(rule.day_of_week, "end_local", event.target.value)} /></div></motion.div>}</AnimatePresence>
            </motion.article>
          ))}
        </div>
      </section>

      <section aria-labelledby="booking-settings-title" className="rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(30,58,138,0.35)] sm:p-8">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0ED] text-[#A13F36]"><Clock3 aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0"><h2 id="booking-settings-title" className="font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{t("tutorAvailability.bookingSettingsTitle")}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{t("tutorAvailability.bookingSettingsIntro")}</p></div></div>
        <fieldset className="mt-5 min-w-0">
          <legend className="text-xs font-extrabold uppercase tracking-[0.12em] text-primary">{t("tutorAvailability.lessonLengths")}</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">{allowedDurations.map((minutes) => <label key={minutes} className="flex min-h-12 items-center gap-3 rounded-xl border border-primary/10 bg-[#FAF9F5] px-3.5 text-sm font-bold text-foreground"><input type="checkbox" className="h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]" checked={bookingSettings.lesson_lengths_minutes.includes(minutes)} onChange={(event) => toggleLessonLength(minutes, event.target.checked)} />{t(`tutorProfile.minutes${minutes}` as TranslationKey)}</label>)}</div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("tutorAvailability.lengthsPauseHelp")}</p>
          {lengthsBelowMinimum(bookingSettings.lesson_lengths_minutes, priceFloor.rate, priceFloor.minimum).map((minutes) => <p key={minutes} role="note" className="mt-2 rounded-xl border border-[#E9D7B2] bg-[#FFF9EC] px-3 py-2 text-xs leading-5 text-[#805916]">{t("tutorAvailability.belowMinimum", { minutes, price: formatCadCents(Math.round((priceFloor.rate * minutes) / 60)), minimum: formatCadCents(priceFloor.minimum) })}</p>)}
        </fieldset>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><label htmlFor="booking-buffer" className="text-xs font-extrabold uppercase tracking-[0.12em] text-primary">{t("tutorAvailability.bufferLabel")}</label><select id="booking-buffer" className={inputClass()} value={bookingSettings.buffer_minutes} onChange={(event) => { setBookingSettings((current) => ({ ...current, buffer_minutes: Number(event.target.value) as BookingSettings["buffer_minutes"] })); setSettingsSaved(false); setBookingSettingsError(""); }}><option value={0}>{t("tutorAvailability.bufferNone")}</option><option value={10}>{t("tutorAvailability.bufferTen")}</option><option value={15}>{t("tutorAvailability.bufferFifteen")}</option></select></div>
          <div className="space-y-2"><label htmlFor="booking-notice" className="text-xs font-extrabold uppercase tracking-[0.12em] text-primary">{t("tutorAvailability.minimumNoticeLabel")}</label><select id="booking-notice" className={inputClass()} value={bookingSettings.minimum_notice_hours} onChange={(event) => { setBookingSettings((current) => ({ ...current, minimum_notice_hours: Number(event.target.value) as BookingSettings["minimum_notice_hours"] })); setSettingsSaved(false); setBookingSettingsError(""); }}><option value={12}>{t("tutorAvailability.noticeTwelve")}</option><option value={24}>{t("tutorAvailability.noticeTwentyFour")}</option><option value={48}>{t("tutorAvailability.noticeFortyEight")}</option></select></div>
        </div>
        <p className="mt-4 rounded-xl border border-[#C9D7EE] bg-[#F5F8FD] px-3.5 py-3 text-xs leading-5 text-primary">{t("tutorAvailability.bookingWindowFixed")}</p>
        {bookingSettingsError && <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-[#F3C9C3] bg-[#FFF5F2] p-3 text-sm leading-6 text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{t(bookingSettingsError as TranslationKey)}</p>}
        {settingsSaved && <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] p-3 text-sm font-semibold text-[#236646]"><Check aria-hidden="true" className="h-4 w-4" />{t("tutorAvailability.bookingSettingsSaved")}</p>}
        <button type="button" onClick={() => void saveBookingSettings()} disabled={settingsSaving} aria-busy={settingsSaving} className="parle-button-primary mt-5 w-full justify-center sm:w-auto">{settingsSaving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}{t(settingsSaving ? "tutorAvailability.bookingSettingsSaving" : "tutorAvailability.bookingSettingsSave")}</button>
      </section>

      <section className="rounded-[1.75rem] border border-primary/10 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(30,58,138,0.35)] sm:p-8">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0ED] text-[#A13F36]"><Clock3 aria-hidden="true" className="h-5 w-5" /></span><div><h2 className="font-display text-xl font-extrabold tracking-[-0.035em] text-primary">{t("tutorAvailability.exceptionsTitle")}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{t("tutorAvailability.exceptionsIntro")}</p></div></div>
        <form onSubmit={addException} className="mt-5 rounded-2xl bg-[#FAF9F5] p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="exception-date" className="text-sm font-bold text-foreground">{t("tutorAvailability.exceptionDate")}</label><input id="exception-date" className={inputClass()} type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} /></div><div className="space-y-2"><label htmlFor="exception-kind" className="text-sm font-bold text-foreground">{t("tutorAvailability.exceptionKind")}</label><select id="exception-kind" className={inputClass()} value={exceptionKind} onChange={(event) => setExceptionKind(event.target.value === "extra" ? "extra" : "off")}><option value="off">{t("tutorAvailability.exceptionOff")}</option><option value="extra">{t("tutorAvailability.exceptionExtra")}</option></select></div></div>
          {exceptionKind === "extra" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="exception-start" className="text-sm font-bold text-foreground">{t("tutorAvailability.startTime")}</label><input id="exception-start" className={inputClass()} type="time" value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)} /></div><div className="space-y-2"><label htmlFor="exception-end" className="text-sm font-bold text-foreground">{t("tutorAvailability.endTime")}</label><input id="exception-end" className={inputClass()} type="time" value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)} /></div></div>}
          <button type="submit" className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-primary/20 bg-white px-4 text-sm font-bold text-primary transition hover:bg-[#EEF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]"><Plus aria-hidden="true" className="h-4 w-4" />{t("tutorAvailability.addException")}</button>
        </form>
        <div className="mt-4 space-y-2">
          {exceptions.length === 0 ? <p className="rounded-xl border border-dashed border-primary/20 p-4 text-sm text-muted-foreground">{t("tutorAvailability.noExceptions")}</p> : exceptions.map((item) => <article key={item.date_local} className="flex min-w-0 items-center gap-3 rounded-xl border border-primary/10 p-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EEF2FA] text-primary"><CalendarDays aria-hidden="true" className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="break-all text-sm font-extrabold text-foreground">{item.date_local}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t(item.kind === "off" ? "tutorAvailability.exceptionOff" : "tutorAvailability.exceptionExtra")}{item.kind === "extra" ? ` · ${item.start_local}–${item.end_local}` : ""}</p></div><button type="button" onClick={() => { setExceptions((current) => current.filter((entry) => entry.date_local !== item.date_local)); setSaved(false); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#8D342D] transition hover:bg-[#FFF0ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97362]" aria-label={t("tutorAvailability.removeException")}><Trash2 aria-hidden="true" className="h-4 w-4" /></button></article>)}
        </div>
        {errorKey && <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-[#F3C9C3] bg-[#FFF5F2] p-3 text-sm leading-6 text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{t(errorKey as never)}</p>}
        {saved && <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-[#B9D9CB] bg-[#F1F8F4] p-3 text-sm font-semibold text-[#236646]"><Check aria-hidden="true" className="h-4 w-4" />{t("tutorAvailability.saved")}</p>}
        <button type="button" onClick={() => void save()} disabled={saving} aria-busy={saving} className="parle-button-primary mt-5 w-full justify-center sm:w-auto">{saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}{t(saving ? "tutorAvailability.saving" : "tutorAvailability.save")}</button>
      </section>
    </div>
  );
}
