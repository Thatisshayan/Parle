import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Every payout decision goes to the audit log (spec section 7); the system's automatic releases too. */
export async function auditPayout(db: SupabaseClient, a: { actorId: string | null; actorLabel: string; action: string; payoutId: string; oldValue: string; newValue: string; now: Date }): Promise<void> {
  const { error } = await db.from("admin_audit_log").insert({
    actor_user_id: a.actorId ?? "system", actor_label: a.actorLabel, action: a.action, target_type: "payout", target_id: a.payoutId,
    old_value: a.oldValue, new_value: a.newValue, occurred_at_utc: a.now.toISOString(), owner_id: a.actorId, created_by: a.actorLabel,
  });
  if (error) throw new Error(error.message);
}
