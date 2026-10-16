import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PROD_REF, serviceKey } from "./management";
import { PROD_URL, anonKey, fn, type Learner } from "./check-learners";
import { SECRETS_DIR } from "../lib/secrets";

/**
 * Plan 10 checks on production: the text AI now answers through OpenRouter (GPT-6 Luna). Uses Plan 9's check learner
 * (run `bun scripts/prod/plan9-checks.ts learner` first, `cleanup` after). Prints outcomes and times only.
 * usage: bun scripts/prod/plan10-checks.ts <tutor|writing|practice>
 */
const STATE = `${SECRETS_DIR}/plan9-check-state.json`;
const learner = (): Learner & { id: string } => {
  const s = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
  if (!s.learner) throw new Error("no check learner: run plan9-checks.ts learner first");
  return s.learner;
};
async function token(l: Learner): Promise<string> {
  const c = createClient(PROD_URL, await anonKey(), { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: l.email, password: l.password });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message ?? "no session"}`);
  return data.session.access_token;
}
const timed = async <T>(work: () => Promise<T>) => { const t = Date.now(); const value = await work(); return { value, seconds: Math.round((Date.now() - t) / 100) / 10 }; };

const steps: Record<string, () => Promise<void>> = {
  tutor: async () => {
    const t = await token(learner());
    const open = await timed(() => fn("parle-assessment-service", t, { action: "tutor_open_session", mode: "speaking" }));
    console.log(`tutor open: ${open.value.status === 200 ? "ok" : `failed ${open.value.status}`}, ${open.seconds}s`);
    for (const text of ["Bonjour ! Hier, je suis allé au cinéma avec mon ami.", "Le film était très drôle, mais un peu long."]) {
      const r = await timed(() => fn("parle-assessment-service", t, { action: "tutor_send_message", session_id: open.value.body.session_id, text }));
      const ok = r.value.status === 200 && typeof r.value.body.reply === "string" && r.value.body.reply.trim().length > 0;
      console.log(`tutor reply: ${ok ? "ok" : `failed ${r.value.status} ${r.value.body?.error_code ?? ""}`}, ${r.seconds}s${ok ? `, ${r.value.body.reply.length} characters` : ""}`);
    }
  },
  writing: async () => {
    const t = await token(learner());
    const r = await timed(() => fn("parle-assessment-service", t, {
      action: "score_writing",
      prompt_text: "Écrivez un message à un ami pour raconter votre week-end (40 à 80 mots).",
      cefr_level: "A2",
      response_text: "Salut Marc, ce week-end je suis allé au marché avec ma femme. Nous avons acheté des légumes et du fromage. Samedi soir, nous avons mangé chez mes parents, c'était très bon. Dimanche je travaille dans le jardin et je regarde un film. Et toi, qu'est-ce que tu as fait ?",
    }));
    const body = r.value.body ?? {};
    const level = body.level ?? body.result?.level ?? body.estimated_level;
    console.log(`writing score: ${r.value.status === 200 ? "ok" : `failed ${r.value.status} ${body.error_code ?? ""}`}, ${r.seconds}s, level ${level ?? "(not in answer)"}`);
  },
  practice: async () => {
    const db = createClient(PROD_URL, await serviceKey(PROD_REF), { auth: { persistSession: false } });
    const { data } = await db.from("learner_task").select("content_source").eq("owner_id", learner().id);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) counts[String(row.content_source ?? "")] = (counts[String(row.content_source ?? "")] ?? 0) + 1;
    console.log(`practice: content sources ${JSON.stringify(counts)} (generated = AI-written, approved_bank = bank fallback)`);
  },
};

const which = process.argv[2] ?? "";
if (!steps[which]) throw new Error(`usage: bun scripts/prod/plan10-checks.ts <${Object.keys(steps).join("|")}>`);
await steps[which]();
