import { current } from "./context.ts";

/** Server stand-in for the app's @/entities: each call runs as the current request's caller (Buildy rules apply). */
const entity = (name: string): any => new Proxy({}, {
  get: (_t, method) => (typeof method !== "string" || method === "then"
    ? undefined
    : (...args: unknown[]) => (current().client.entities as any)[name][method](...args)),
});
export const User = { me: () => current().client.auth.me() };
export const ParleCoachNote = entity("ParleCoachNote");
export const ParleCompStatus = entity("ParleCompStatus");
export const ParleIdentity = entity("ParleIdentity");
export const ParleProfile = entity("ParleProfile");
export const ParlePublicLevelCheckRun = entity("ParlePublicLevelCheckRun");
export const Subscriber = entity("Subscriber");
export const admin_audit_log = entity("admin_audit_log");
export const ai_message = entity("ai_message");
export const ai_session = entity("ai_session");
export const app_setting = entity("app_setting");
export const availability_exception = entity("availability_exception");
export const availability_rule = entity("availability_rule");
export const booking = entity("booking");
export const checkin = entity("checkin");
export const learner_profile = entity("learner_profile");
export const learner_task = entity("learner_task");
export const milestone = entity("milestone");
export const mistake_log = entity("mistake_log");
export const placement_result = entity("placement_result");
export const practice_report = entity("practice_report");
export const prompt_item = entity("prompt_item");
export const question_item = entity("question_item");
export const roadmap = entity("roadmap");
export const skill_estimate = entity("skill_estimate");
export const topic_mastery = entity("topic_mastery");
export const tutor_application_review = entity("tutor_application_review");
export const tutor_booking_settings = entity("tutor_booking_settings");
export const tutor_document = entity("tutor_document");
export const tutor_payout_country = entity("tutor_payout_country");
export const tutor_profile = entity("tutor_profile");
export const tutor_profile_public_edits = entity("tutor_profile_public_edits");
export const tutor_public_profile = entity("tutor_public_profile");
export const tutor_review = entity("tutor_review");
export const tutor_review_reply = entity("tutor_review_reply");
export const usage_counter = entity("usage_counter");
export const week_plan = entity("week_plan");
