import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mail, RefreshCw, Send, Trash2 } from "lucide-react";
import {
  adminErrorKey, deleteWaitlist, loadWaitlist, markWaitlistUnsubscribed, previewWaitlistEmail, retryWaitlistFailed, saveCampaignText,
  saveSenderAddress, sendBlock, sendWaitlistTest, startWaitlistSend, type CampaignName, type CampaignText, type WaitlistOverview,
} from "@/lib/parle-admin";
import { t, type TranslationKey } from "@/lib/i18n";

type Note = { kind: "ok" | "error"; key: TranslationKey; values?: Record<string, string | number> };
const fail = (error: unknown): Note => ({ kind: "error", key: adminErrorKey(error) });
const NoteLine = ({ note }: { note: Note | null }) => (note ? <p role={note.kind === "error" ? "alert" : "status"} className={`mt-2 text-sm ${note.kind === "error" ? "text-[#8D342D]" : "text-[#236646]"}`}>{t(note.key, note.values)}</p> : null);

function CampaignCard({ name, overview, reload }: { name: CampaignName; overview: WaitlistOverview; reload: () => Promise<void> }) {
  const state = overview.campaigns[name];
  const [text, setText] = useState<CampaignText>(state.blanks);
  const [role, setRole] = useState<"learner" | "tutor">(name === "founding_tutor" ? "tutor" : "learner");
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const saved = text.launch_date === state.blanks.launch_date && text.personal_paragraph === state.blanks.personal_paragraph;
  const block = saved ? sendBlock(overview, name) : "adminWaitlist.block.unsaved";

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void previewWaitlistEmail(name, text, role).then(setPreview, () => setPreview(null)); }, 400);
    return () => window.clearTimeout(timer.current);
  }, [name, text, role]);

  async function act(action: () => Promise<Note>) {
    setBusy(true); setNote(null);
    try { setNote(await action()); await reload(); } catch (error) { setNote(fail(error)); } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby={`wl-${name}`} className="min-w-0 rounded-[1.5rem] border border-[#E2E6EE] bg-white p-4 sm:p-5">
      <h2 id={`wl-${name}`} className="font-display text-lg font-extrabold text-primary">{t(name === "launch" ? "adminWaitlist.launchHeading" : "adminWaitlist.foundingHeading")}</h2>
      <p className="mt-1 text-xs text-[#65718A]">{t(name === "launch" ? "adminWaitlist.launchIntro" : "adminWaitlist.foundingIntro")}</p>
      <p className="mt-2 text-xs font-bold text-[#53617A]">{t("adminWaitlist.progress", { queued: state.queued, sent: state.sent, failed: state.failed, skipped: state.skipped })}</p>
      {state.last_error && <p role="alert" className="mt-1 text-xs text-[#8D342D]">{state.last_error}</p>}

      {name === "launch" && (
        <label htmlFor={`wl-${name}-date`} className="mt-3 block text-xs font-bold text-[#53617A]">{t("adminWaitlist.launchDate")}
          <input id={`wl-${name}-date`} maxLength={60} value={text.launch_date} onChange={(e) => setText({ ...text, launch_date: e.target.value })} placeholder={t("adminWaitlist.launchDatePlaceholder")} className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEEA] px-3 text-sm" />
        </label>
      )}
      <label htmlFor={`wl-${name}-para`} className="mt-3 block text-xs font-bold text-[#53617A]">{t("adminWaitlist.paragraph")}
        <textarea id={`wl-${name}-para`} maxLength={1500} rows={5} value={text.personal_paragraph} onChange={(e) => setText({ ...text, personal_paragraph: e.target.value })} className="mt-2 w-full rounded-xl border border-[#D8DEEA] p-3 text-sm" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || saved} onClick={() => void act(async () => { setText(await saveCampaignText(name, text)); return { kind: "ok", key: "adminWaitlist.textSaved" }; })} className="parle-button-secondary">{t("adminWaitlist.saveText")}</button>
        <button type="button" disabled={busy} onClick={() => void act(async () => ({ kind: "ok", key: "adminWaitlist.testSent", values: { email: await sendWaitlistTest(name, text) } }))} className="parle-button-secondary"><Mail aria-hidden="true" className="h-4 w-4" />{t("adminWaitlist.sendTest")}</button>
      </div>

      {name === "launch" && (
        <div role="group" aria-label={t("adminWaitlist.previewAs")} className="mt-4 flex gap-2 text-xs">
          {(["learner", "tutor"] as const).map((r) => <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)} className={`rounded-full px-3 py-1 font-bold ${role === r ? "bg-[#1E3A8A] text-white" : "border border-[#D8DEEA] text-[#53617A]"}`}>{t(r === "learner" ? "role.learner" : "role.tutor")}</button>)}
        </div>
      )}
      <p className="mt-3 text-xs font-bold text-[#53617A]">{t("adminWaitlist.preview")}{preview ? `: ${preview.subject}` : ""}</p>
      {preview && <iframe title={t("adminWaitlist.preview")} sandbox="" srcDoc={preview.html} className="mt-2 h-80 w-full rounded-xl border border-[#E2E6EE] bg-white" />}

      <div className="mt-4 rounded-xl border border-[#F1D9A9] bg-[#FFF8E9] p-3">
        <p className="text-xs text-[#805916]">{t(name === "launch" ? "adminWaitlist.sendExplainLaunch" : "adminWaitlist.sendExplainFounding", { count: state.to_send })}</p>
        {block && <p className="mt-1 text-xs font-bold text-[#805916]">{t(block)}</p>}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label htmlFor={`wl-${name}-confirm`} className="text-xs font-bold text-[#805916]">{t("adminWaitlist.typeSend")}
            <input id={`wl-${name}-confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="mt-1 block min-h-10 w-32 rounded-lg border border-[#D9C788] px-2 text-sm" />
          </label>
          <button type="button" disabled={busy || block !== null || confirm !== "SEND"} onClick={() => void act(async () => { const n = await startWaitlistSend(name); setConfirm(""); return { kind: "ok", key: "adminWaitlist.queued", values: { count: n } }; })} className="parle-button-primary"><Send aria-hidden="true" className="h-4 w-4" />{t("adminWaitlist.send")}</button>
          {state.failed > 0 && <button type="button" disabled={busy} onClick={() => void act(async () => ({ kind: "ok", key: "adminWaitlist.queued", values: { count: await retryWaitlistFailed(name) } }))} className="parle-button-secondary"><RefreshCw aria-hidden="true" className="h-4 w-4" />{t("adminWaitlist.retryFailed")}</button>}
        </div>
      </div>
      <NoteLine note={note} />
    </section>
  );
}

/** Spec 4.3: counts, the two campaigns with preview, test and typed SEND, failures, unsubscribes and the owner's delete. */
export default function AdminWaitlist() {
  const [o, setO] = useState<WaitlistOverview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [address, setAddress] = useState("");
  const [unsubscribe, setUnsubscribe] = useState("");
  const [deleteWord, setDeleteWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  async function reload() {
    try { const next = await loadWaitlist(); setO(next); setAddress((a) => a || next.postal_address); setState("ready"); } catch { setState("error"); }
  }
  useEffect(() => { void reload(); }, []);
  const sending = (o?.campaigns.founding_tutor.queued ?? 0) + (o?.campaigns.launch.queued ?? 0) > 0;
  useEffect(() => {
    if (!sending) return;
    const id = window.setInterval(() => { void reload(); }, 5000); // progress while the batch runs
    return () => window.clearInterval(id);
  }, [sending]);
  async function act(action: () => Promise<Note>) {
    setBusy(true); setNote(null);
    try { setNote(await action()); await reload(); } catch (error) { setNote(fail(error)); } finally { setBusy(false); }
  }

  if (state === "loading") return <p role="status" className="flex items-center gap-2 text-sm text-[#65718A]"><LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />{t("adminWaitlist.loading")}</p>;
  if (state === "error" || !o) return <p role="alert" className="text-sm text-[#8D342D]">{t("adminWaitlist.error")}</p>;
  const launchDone = Boolean(o.campaigns.launch.finished_at) && o.campaigns.launch.queued === 0;

  return (
    <div className="min-w-0 space-y-5">
      <section aria-label={t("adminWaitlist.countsLabel")} className="grid min-w-0 gap-3 sm:grid-cols-3">
        {([["adminWaitlist.learners", o.learners], ["adminWaitlist.tutors", o.tutors], ["adminWaitlist.unsubscribed", o.unsubscribed]] as Array<[TranslationKey, number]>).map(([k, v]) => (
          <div key={k} className="rounded-[1.25rem] border border-[#E2E6EE] bg-white p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#78839A]">{t(k)}</p><p className="mt-2 font-display text-2xl font-extrabold text-[#1E3156]">{v}</p></div>
        ))}
      </section>
      {!o.app_url_public && <p role="note" className="rounded-xl border border-[#F1D9A9] bg-[#FFF8E9] p-3 text-xs text-[#805916]">{t("adminWaitlist.appUrlWarning", { url: o.app_url })}</p>}

      <section aria-labelledby="wl-address" className="rounded-[1.5rem] border border-[#E2E6EE] bg-white p-4 sm:p-5">
        <h2 id="wl-address" className="font-display text-lg font-extrabold text-primary">{t("adminWaitlist.addressHeading")}</h2>
        <p className="mt-1 text-xs text-[#65718A]">{t("adminWaitlist.addressIntro")}</p>
        <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          <label htmlFor="wl-address-input" className="min-w-0 flex-1 text-xs font-bold text-[#53617A]">{t("adminWaitlist.addressLabel")}
            <input id="wl-address-input" maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEEA] px-3 text-sm" />
          </label>
          <button type="button" disabled={busy || address.trim() === o.postal_address} onClick={() => void act(async () => { await saveSenderAddress(address.trim()); return { kind: "ok", key: "adminWaitlist.addressSaved" }; })} className="parle-button-secondary">{t("adminWaitlist.saveAddress")}</button>
        </div>
      </section>

      <CampaignCard name="founding_tutor" overview={o} reload={reload} />
      <CampaignCard name="launch" overview={o} reload={reload} />

      {o.failures.length > 0 && (
        <section aria-labelledby="wl-failures" className="rounded-[1.5rem] border border-[#F0C5C0] bg-[#FFF5F2] p-4">
          <h2 id="wl-failures" className="font-display text-lg font-extrabold text-[#8D342D]">{t("adminWaitlist.failuresHeading")}</h2>
          <ul className="mt-2 space-y-1">{o.failures.map((f) => <li key={f.id} className="break-words text-xs text-[#8D342D]">{f.email || t("adminWaitlist.addressRemoved")} · {f.campaign} · {f.error}</li>)}</ul>
        </section>
      )}

      <section aria-labelledby="wl-unsub" className="rounded-[1.5rem] border border-[#E2E6EE] bg-white p-4 sm:p-5">
        <h2 id="wl-unsub" className="font-display text-lg font-extrabold text-primary">{t("adminWaitlist.unsubHeading")}</h2>
        <p className="mt-1 text-xs text-[#65718A]">{t("adminWaitlist.unsubIntro")}</p>
        <form onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await markWaitlistUnsubscribed(unsubscribe.trim()); setUnsubscribe(""); return { kind: "ok", key: r === "already" ? "adminWaitlist.unsubAlready" : "adminWaitlist.unsubDone" }; }); }} className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          <label htmlFor="wl-unsub-email" className="min-w-0 flex-1 text-xs font-bold text-[#53617A]">{t("adminWaitlist.unsubLabel")}
            <input id="wl-unsub-email" type="email" required value={unsubscribe} onChange={(e) => setUnsubscribe(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEEA] px-3 text-sm" />
          </label>
          <button type="submit" disabled={busy} className="parle-button-secondary">{t("adminWaitlist.unsubButton")}</button>
        </form>
      </section>

      {o.me_owner && (
        <section aria-labelledby="wl-delete" className="rounded-[1.5rem] border border-[#F0C5C0] bg-white p-4 sm:p-5">
          <h2 id="wl-delete" className="font-display text-lg font-extrabold text-[#8D342D]">{t("adminWaitlist.deleteHeading")}</h2>
          <p className="mt-1 text-xs text-[#65718A]">{t(launchDone ? "adminWaitlist.deleteIntro" : "adminWaitlist.deleteNotYet")}</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label htmlFor="wl-delete-word" className="text-xs font-bold text-[#8D342D]">{t("adminWaitlist.typeDelete")}
              <input id="wl-delete-word" value={deleteWord} onChange={(e) => setDeleteWord(e.target.value)} autoComplete="off" disabled={!launchDone} className="mt-1 block min-h-10 w-32 rounded-lg border border-[#F0C5C0] px-2 text-sm" />
            </label>
            <button type="button" disabled={busy || !launchDone || deleteWord !== "DELETE"} onClick={() => void act(async () => { const n = await deleteWaitlist(); setDeleteWord(""); return { kind: "ok", key: "adminWaitlist.deleted", values: { count: n } }; })} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#8D342D] px-5 text-sm font-bold text-white disabled:opacity-50"><Trash2 aria-hidden="true" className="h-4 w-4" />{t("adminWaitlist.deleteButton")}</button>
          </div>
        </section>
      )}
      <NoteLine note={note} />
    </div>
  );
}
