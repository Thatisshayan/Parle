import { useEffect, useState, type FormEvent } from "react";
import { Crown, LoaderCircle, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { adminErrorKey, inviteAdmin, loadAccountsOverview, removeAdmin, type AccountsOverview } from "@/lib/parle-admin";
import { t, type TranslationKey } from "@/lib/i18n";

type Note = { kind: "ok" | "error"; key: TranslationKey; values?: Record<string, string> };
const dateOnly = (iso: string) => (Number.isFinite(Date.parse(iso)) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso)) : "-");

/** Spec 3.3: owner and administrators, visible to every admin; invite and remove only for owners (checked on the server too). */
export default function AdminAdministrators() {
  const [data, setData] = useState<AccountsOverview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState("");
  const [note, setNote] = useState<Note | null>(null);

  async function load() {
    try { setData(await loadAccountsOverview()); setState("ready"); } catch { setState("error"); }
  }
  useEffect(() => { void load(); }, []);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setNote(null);
    try {
      const r = await inviteAdmin(email.trim());
      setNote({ kind: "ok", key: r.existing_account ? "adminAdmins.invitedExisting" : r.mail_sent ? "adminAdmins.invitedNew" : "adminAdmins.invitedNoMail", values: { email: r.email } });
      setEmail("");
      await load();
    } catch (error) { setNote({ kind: "error", key: adminErrorKey(error) }); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setNote(null);
    try { await removeAdmin(id); setConfirmId(""); setNote({ kind: "ok", key: "adminAdmins.removed" }); await load(); }
    catch (error) { setNote({ kind: "error", key: adminErrorKey(error) }); } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="admin-admins-heading" className="min-w-0 rounded-[1.5rem] border border-[#E2E6EE] bg-white p-4 sm:p-5">
      <div className="flex items-center gap-2 text-[#C64D43]"><ShieldCheck aria-hidden="true" className="h-4 w-4" /><h2 id="admin-admins-heading" className="font-display text-base font-extrabold text-[#1E3A8A]">{t("adminAdmins.heading")}</h2></div>
      <p className="mt-1 text-xs leading-5 text-[#65718A]">{t(data?.me.owner ? "adminAdmins.intro" : "adminAdmins.ownerOnly")}</p>
      {state === "loading" && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-[#65718A]"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />{t("adminAdmins.loading")}</p>}
      {state === "error" && <p role="alert" className="mt-3 text-sm text-[#8D342D]">{t("adminAdmins.error")}</p>}
      {state === "ready" && data && (
        <ul className="mt-3 space-y-2">
          {data.admins.map((a) => (
            <li key={a.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-[#EEF0F4] bg-[#FAFBFD] px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block break-all text-sm font-extrabold text-[#1E3A8A]">{a.email}{a.id === data.me.id ? ` (${t("adminAdmins.you")})` : ""}</span>
                <span className="block text-[11px] text-[#65718A]">{t(a.since_known ? "adminAdmins.sinceKnown" : "adminAdmins.sinceCreated", { date: dateOnly(a.admin_since) })}</span>
              </span>
              {a.owner && <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF8E9] px-2 py-0.5 text-[10px] font-extrabold text-[#805916]"><Crown aria-hidden="true" className="h-3 w-3" />{t("adminAdmins.ownerBadge")}</span>}
              {data.me.owner && !a.owner && a.id !== data.me.id && (confirmId === a.id ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[#8D342D]">{t("adminAdmins.confirmRemove", { email: a.email })}</span>
                  <button type="button" disabled={busy} onClick={() => void remove(a.id)} className="rounded-full bg-[#8D342D] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">{t("adminAdmins.confirm")}</button>
                  <button type="button" onClick={() => setConfirmId("")} className="rounded-full border border-[#D8DEEA] px-3 py-1.5 text-xs font-bold text-[#53617A]">{t("adminAdmins.cancel")}</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmId(a.id)} className="inline-flex items-center gap-1 rounded-full border border-[#D8DEEA] px-3 py-1.5 text-xs font-bold text-[#53617A]"><UserMinus aria-hidden="true" className="h-3.5 w-3.5" />{t("adminAdmins.remove")}</button>
              ))}
            </li>
          ))}
        </ul>
      )}
      {data?.me.owner && (
        <form onSubmit={(e) => void invite(e)} className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          <label htmlFor="admin-invite-email" className="min-w-0 flex-1 text-xs font-bold text-[#53617A]">{t("adminAdmins.inviteLabel")}
            <input id="admin-invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("adminAdmins.invitePlaceholder")} className="mt-2 min-h-11 w-full rounded-xl border border-[#D8DEEA] px-3 text-sm" />
          </label>
          <button type="submit" disabled={busy || !email.trim()} className="parle-button-primary justify-center"><UserPlus aria-hidden="true" className="h-4 w-4" />{t(busy ? "adminAdmins.inviting" : "adminAdmins.invite")}</button>
        </form>
      )}
      {note && <p role={note.kind === "error" ? "alert" : "status"} className={`mt-3 text-sm ${note.kind === "error" ? "text-[#8D342D]" : "text-[#236646]"}`}>{t(note.key, note.values)}</p>}
    </section>
  );
}
