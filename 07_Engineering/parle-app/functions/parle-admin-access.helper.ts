import {
  assertAdministrator,
  type AdminActor,
} from "./parle-admin-settings.helper.ts";

export const ADMIN_SCREEN_ACTIONS = [
  "admin_authorize",
  "admin_get_settings",
  "admin_save_settings",
  "admin_list_audit",
  "admin_list_users",
  "admin_content_coverage",
  "admin_get_metrics",
  "admin_list_reported_content",
  "admin_resolve_practice_report",
  "admin_manage_reviews",
  "admin_get_content_item",
  "admin_save_content_item",
  "admin_generate_content_drafts",
  "admin_get_demo_bank",
  "admin_update_demo_bank_content",
  "audit_question_bank",
  "admin_set_premium_comp",
] as const;

export const ADMIN_SETTINGS_INITIALIZATION_ACTION = "admin_initialize" as const;

export const ADMIN_GUARDED_ACTIONS = [
  ...ADMIN_SCREEN_ACTIONS,
  ADMIN_SETTINGS_INITIALIZATION_ACTION,
] as const;

/** Apply the authenticated caller's administrator role before entering a protected action handler. */
export async function dispatchWithAdminAccess<T>(
  action: string,
  caller: AdminActor,
  handler: () => T | Promise<T>,
): Promise<T> {
  if ((ADMIN_GUARDED_ACTIONS as readonly string[]).includes(action)) {
    assertAdministrator(caller);
  }

  return await handler();
}
