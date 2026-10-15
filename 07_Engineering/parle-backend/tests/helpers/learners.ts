import { makeUser } from "./users";
import { callFunction } from "./functions-env";

const tokenOf = async (u: Awaited<ReturnType<typeof makeUser>>) => (await u.client.auth.getSession()).data.session!.access_token;

/** A learner set up exactly as onboarding saves one (Onboarding.tsx payload). */
export async function onboardedLearner() {
  const u = await makeUser("learner"), t = await tokenOf(u);
  await callFunction("parle-account-service", t, { action: "ensure_identity", role: "learner", age_confirmed: true });
  await callFunction("parle-account-service", t, { action: "save_profile", time_zone: "America/Toronto" });
  await callFunction("parle-account-service", t, {
    action: "save_learner_profile",
    goals: ["canada_immigration"], main_goal: "canada_immigration", other_goal_text: "", track: "immigration",
    target_per_skill: JSON.stringify({ L: "NCLC 7", R: "NCLC 7", W: "NCLC 7", S: "NCLC 7" }),
    target_date: "", no_deadline: true, test_booked: false, test_booked_date: "",
    availability: JSON.stringify({ monday: 20, wednesday: 20, friday: 20 }),
    tutor_windows: [], tutor_budget_band: "unspecified", self_assessed_level: "A2", native_language: "English", time_zone: "America/Toronto",
  });
  await callFunction("parle-account-service", t, { action: "save_unverified_placement", self_assessed_level: "A2", track: "immigration" });
  return { u, t };
}
