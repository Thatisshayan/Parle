import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { formatClock, formatLocalDateLabel, formatCadCents, loadDisputedLessons, type DisputedLesson, type FlaggedTutor } from "@/lib/parle-booking";
import { t, type TranslationKey } from "@/lib/i18n";
import PausedLessonsSection from "@/components/parle/PausedLessonsSection";

const KIND_KEYS: Record<string, TranslationKey> = { tutor_no_show: "adminBookings.kind.tutor_no_show", no_show_dispute: "adminBookings.kind.no_show_dispute", other: "adminBookings.kind.other" };
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Read only in 7A: disputed lessons and tutors who cancel often. Resolving them is Plan 7B's Payouts screen. */
export default function AdminBookings() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [lessons, setLessons] = useState<DisputedLesson[]>([]);
  const [flagged, setFlagged] = useState<FlaggedTutor[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const result = await loadDisputedLessons();
        setLessons(result.lessons);
        setFlagged(result.flaggedTutors);
        setState("ready");
      } catch (error) {
        console.error("Admin bookings could not be loaded", error);
        setState("error");
      }
    })();
  }, []);
  if (state === "loading") return <div className="flex min-h-[240px] items-center justify-center" role="status"><LoaderCircle aria-hidden="true" className="h-8 w-8 animate-spin text-primary" /></div>;
  if (state === "error") return <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#F0C5C0] bg-[#FFF5F2] px-4 py-3 text-sm text-[#8D342D]"><CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4" />{t("adminBookings.error")}</p>;
  const zone = browserZone();
  const when = (iso: string) => `${formatLocalDateLabel(iso, zone)}, ${formatClock(iso, zone)}`;
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("adminBookings.intro")}</p>
      <section aria-labelledby="admin-disputed">
        <h2 id="admin-disputed" className="mb-3 font-display text-xl font-extrabold text-primary">{t("adminBookings.disputedHeading")}</h2>
        {lessons.length === 0 ? <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm text-muted-foreground">{t("adminBookings.noDisputed")}</p> : (
          <ul className="space-y-3">{lessons.map((l) => (
            <li key={l.id} className="min-w-0 rounded-[1.25rem] border border-primary/10 bg-white p-4">
              <p className="break-words text-sm font-extrabold text-primary">{t(KIND_KEYS[l.dispute_kind] ?? "adminBookings.kind.other")}</p>
              <p className="mt-1 break-words text-xs leading-5 text-foreground">{t("adminBookings.lessonLine", { tutor: l.tutor_name, learner: l.learner_name, time: when(l.start_at), price: formatCadCents(l.price_cents) })}</p>
              {l.dispute_details && <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-[#FAF9F5] p-3 text-xs leading-5">{l.dispute_details}</p>}
              <p className="mt-2 text-[11px] text-muted-foreground">{t("adminBookings.reportedAt", { time: l.disputed_at ? when(l.disputed_at) : "-" })} · {l.id}</p>
            </li>
          ))}</ul>
        )}
      </section>
      <section aria-labelledby="admin-flagged">
        <h2 id="admin-flagged" className="mb-3 font-display text-xl font-extrabold text-primary">{t("adminBookings.flaggedHeading")}</h2>
        {flagged.length === 0 ? <p className="rounded-2xl border border-dashed border-primary/15 bg-white p-4 text-sm text-muted-foreground">{t("adminBookings.noFlagged")}</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">{flagged.map((f) => <li key={f.tutor_id} className="rounded-xl border border-[#F1D9A9] bg-[#FFF8E9] px-4 py-3 text-sm text-[#805916]"><span className="font-extrabold">{f.name}</span> · {t("adminBookings.cancellations", { count: f.cancellations })}</li>)}</ul>
        )}
      </section>
      <PausedLessonsSection />
    </div>
  );
}
