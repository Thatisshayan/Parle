import type { TranslationKey } from "./i18n";

export type AdminAuditCategory = "settings" | "tutor_decisions" | "certificate_verification" | "premium_comp" | "other";

export type AuditText = {
  key: TranslationKey;
  values?: Record<string, string | number>;
};

export type AdminAuditEntry = {
  id: string;
  actor_label: string;
  action: string;
  target_type: string;
  target_id: string;
  old_value: string;
  new_value: string;
  occurred_at_utc: string;
  source: "admin_audit_log" | "decision_history";
};

export type AdminAuditPresentation = {
  category: AdminAuditCategory;
  title: AuditText;
  target: AuditText;
  showValues: boolean;
  oldValue?: AuditText;
  newValue?: AuditText;
};

type SettingFormat = "messages" | "minutes" | "percent" | "hours" | "usd" | "days" | "count" | "boolean";

const SETTING_PRESENTATION: Record<string, { label: TranslationKey; format: SettingFormat }> = {
  free_ai_messages_per_day: { label: "adminControl.setting.freeAi.label", format: "messages" },
  premium_fair_use_ai_messages_per_day: { label: "adminControl.setting.premiumAi.label", format: "messages" },
  premium_live_voice_minutes_per_month: { label: "adminControl.setting.voiceMinutes.label", format: "minutes" },
  commission_percent: { label: "adminControl.setting.commission.label", format: "percent" },
  payout_delay_hours: { label: "adminControl.setting.payoutDelay.label", format: "hours" },
  cancellation_window_hours: { label: "adminControl.setting.cancellation.label", format: "hours" },
  minimum_lesson_charge_usd: { label: "adminControl.setting.minimumCharge.label", format: "usd" },
  founding_commission_percent: { label: "adminControl.setting.foundingCommission.label", format: "percent" },
  min_notice_hours: { label: "adminControl.setting.minNotice.label", format: "hours" },
  booking_horizon_days: { label: "adminControl.setting.horizon.label", format: "days" },
  slot_hold_minutes: { label: "adminControl.setting.slotHold.label", format: "minutes" },
  auto_complete_hours: { label: "adminControl.setting.autoComplete.label", format: "hours" },
  tutor_cancellation_flag_count: { label: "adminControl.setting.cancellationFlag.label", format: "count" },
  live_voice_enabled: { label: "adminControl.setting.liveVoice.label", format: "boolean" },
  premium_roadmap_triggers_enabled: { label: "adminControl.setting.roadmapTriggers.label", format: "boolean" },
};

const STATUS_PRESENTATION: Record<string, TranslationKey> = {
  Draft: "adminAudit.status.draft",
  Submitted: "adminAudit.status.submitted",
  "In review": "adminAudit.status.inReview",
  Approved: "adminAudit.status.approved",
  "Needs changes": "adminAudit.status.needsChanges",
  Rejected: "adminAudit.status.rejected",
  Suspended: "adminAudit.status.suspended",
};

const OTHER_ACTION_PRESENTATION: Record<string, TranslationKey> = {
  "tutor_application.review_opened": "adminAudit.summary.reviewOpened",
  "tutor_application.email_retry": "adminAudit.summary.emailRetry",
  "payout_country.initialized": "adminAudit.summary.payoutCountryInitialized",
  "public_profile.refreshed": "adminAudit.summary.publicProfileRefreshed",
  "demo_review.added": "adminAudit.summary.demoReviewAdded",
  "demo_review.hidden": "adminAudit.summary.demoReviewHidden",
  "question_bank.ai_draft_created": "adminAudit.summary.aiDraftCreated",
};

function decodeValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return undefined; }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  const parsed = decodeValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}

function cleanLabel(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[_-]+/g, " ").replace(/\./g, " ").replace(/\s+/g, " ").trim().slice(0, 100)
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusText(value: unknown): AuditText {
  const record = objectValue(value);
  const status = typeof record?.status === "string" ? record.status : "";
  const key = STATUS_PRESENTATION[status];
  return key ? { key } : { key: "adminAudit.status.unknown", values: { status: cleanLabel(status) || "Unknown" } };
}

function settingValue(format: SettingFormat, value: unknown): AuditText {
  const parsed = decodeValue(value);
  if (format === "boolean") {
    if (parsed === true) return { key: "adminAudit.valueEnabled" };
    if (parsed === false) return { key: "adminAudit.valueDisabled" };
    return { key: "adminAudit.valueNotRecorded" };
  }
  if (parsed === null || parsed === undefined) return { key: "adminAudit.valueNotSet" };
  const numeric = typeof parsed === "number" ? parsed : typeof parsed === "string" && parsed.trim() ? Number(parsed) : Number.NaN;
  if (!Number.isFinite(numeric)) return { key: "adminAudit.valueNotRecorded" };
  const valueText = Number.isInteger(numeric) ? numeric : Number(numeric.toFixed(2));
  const key: Record<Exclude<SettingFormat, "boolean">, TranslationKey> = {
    messages: "adminAudit.valueMessages",
    minutes: "adminAudit.valueMinutes",
    percent: "adminAudit.valuePercent",
    hours: "adminAudit.valueHours",
    usd: "adminAudit.valueUsd",
    days: "adminAudit.valueDays",
    count: "adminAudit.valueCount",
  };
  return { key: key[format as Exclude<SettingFormat, "boolean">], values: { value: valueText } };
}

function verificationState(value: unknown): boolean | null {
  const record = objectValue(value);
  if (typeof record?.verified === "boolean") return record.verified;
  const ids = Array.isArray(record?.verified_document_ids)
    ? record.verified_document_ids.filter((item) => typeof item === "string")
    : null;
  return ids ? ids.length > 0 : null;
}

function verificationText(value: unknown): AuditText {
  const verified = verificationState(value);
  if (verified === true) return { key: "adminAudit.valueVerified" };
  if (verified === false) return { key: "adminAudit.valueUnverified" };
  return { key: "adminAudit.valueNotRecorded" };
}

function compStatusText(value: unknown): AuditText {
  const active = objectValue(value)?.active;
  if (active === true) return { key: "adminAudit.value.compActive" };
  if (active === false) return { key: "adminAudit.value.compInactive" };
  return { key: "adminAudit.valueNotRecorded" };
}

export function getAdminAuditCategory(action: string): AdminAuditCategory {
  if (action.startsWith("setting.")) return "settings";
  if (action === "tutor_application.status_changed") return "tutor_decisions";
  if (action === "tutor_certificate.verification_changed") return "certificate_verification";
  if (action === "user.premium_comp_granted" || action === "user.premium_comp_removed") return "premium_comp";
  return "other";
}

const CONTENT_FIELD_LABELS: Record<string, string> = {
  prompt: "Question", passage: "Passage", transcript: "Transcript", explanation: "Explanation", text: "Text",
  status: "Status", is_test_data: "Test item", options: "Options", answer_option_id: "Correct option id", answer: "Correct answer",
};

function contentFieldText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "not set";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.map((o) => (o && typeof o === "object" && "text" in o ? String((o as { text: unknown }).text) : String(o))).join(" / ");
  return String(value);
}

/** A question-bank edit's changed fields, in a fixed order, each shortened to 120 characters (D23). */
function contentFieldsText(value: unknown): AuditText {
  const record = objectValue(value);
  const keys = record ? Object.keys(CONTENT_FIELD_LABELS).filter((k) => k in record) : [];
  if (!record || !keys.length) return { key: "adminAudit.valueNotRecorded" };
  const fields = keys.map((k) => {
    const text = contentFieldText(record[k]).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    return `${CONTENT_FIELD_LABELS[k]}: ${text.length > 120 ? `${text.slice(0, 117)}...` : text}`;
  }).join("; ");
  return { key: "adminAudit.value.fields", values: { fields } };
}

export function presentAdminAuditEntry(entry: AdminAuditEntry): AdminAuditPresentation {
  const category = getAdminAuditCategory(entry.action);
  if (category === "settings") {
    const setting = SETTING_PRESENTATION[entry.target_id];
    const isInitialization = entry.action === "setting.initialized";
    return {
      category,
      title: { key: isInitialization ? "adminAudit.summary.settingInitialized" : "adminAudit.summary.settingUpdated" },
      target: setting?.label
        ? { key: setting.label }
        : { key: "adminAudit.targetType", values: { target: cleanLabel(entry.target_id) || "Setting" } },
      showValues: true,
      oldValue: setting ? settingValue(setting.format, entry.old_value) : { key: "adminAudit.valueNotRecorded" },
      newValue: setting ? settingValue(setting.format, entry.new_value) : { key: "adminAudit.valueNotRecorded" },
    };
  }

  if (category === "tutor_decisions") {
    const nextStatus = statusText(entry.new_value);
    const rawNext = objectValue(entry.new_value)?.status;
    const summaryByStatus: Record<string, TranslationKey> = {
      Approved: "adminAudit.summary.tutorApproved",
      "Needs changes": "adminAudit.summary.tutorNeedsChanges",
      Rejected: "adminAudit.summary.tutorRejected",
      Suspended: "adminAudit.summary.tutorSuspended",
    };
    return {
      category,
      title: summaryByStatus[String(rawNext)]
        ? { key: summaryByStatus[String(rawNext)] }
        : { key: "adminAudit.summary.tutorStatusChanged", values: { status: cleanLabel(String(rawNext ?? "")) || "Unknown" } },
      target: { key: "adminAudit.target.tutorApplication" },
      showValues: true,
      oldValue: statusText(entry.old_value),
      newValue: nextStatus,
    };
  }

  if (category === "certificate_verification") {
    const previous = verificationState(entry.old_value);
    const next = verificationState(entry.new_value);
    const titleKey: TranslationKey = previous === false && next === true
      ? "adminAudit.summary.certificateVerified"
      : previous === true && next === false
        ? "adminAudit.summary.certificateUnverified"
        : "adminAudit.summary.certificateChanged";
    return {
      category,
      title: { key: titleKey },
      target: { key: "adminAudit.target.certificate" },
      showValues: true,
      oldValue: verificationText(entry.old_value),
      newValue: verificationText(entry.new_value),
    };
  }

  if (category === "premium_comp") {
    const newValue = objectValue(entry.new_value);
    const active = typeof newValue?.active === "boolean"
      ? newValue.active
      : entry.action === "user.premium_comp_granted";
    const reason = typeof newValue?.reason === "string" ? newValue.reason.trim() : "";
    return {
      category,
      title: { key: active ? "adminAudit.summary.compGranted" : "adminAudit.summary.compRemoved" },
      target: { key: "adminAudit.target.userComp", values: { userId: entry.target_id || "—" } },
      showValues: true,
      oldValue: compStatusText(entry.old_value),
      newValue: reason
        ? { key: active ? "adminAudit.value.compActiveReason" : "adminAudit.value.compInactiveReason", values: { reason } }
        : compStatusText(entry.new_value),
    };
  }

  if (entry.action === "question_bank.content_updated") {
    const itemId = entry.target_id.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160);
    return {
      category,
      title: { key: "adminAudit.summary.contentUpdated" },
      target: { key: "adminAudit.target.contentItem", values: { itemId: itemId || "-" } },
      showValues: true,
      oldValue: contentFieldsText(entry.old_value),
      newValue: contentFieldsText(entry.new_value),
    };
  }

  if (entry.action === "question_bank.ai_draft_created") {
    const itemId = entry.target_id.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160);
    return {
      category,
      title: { key: "adminAudit.summary.aiDraftCreated" },
      target: { key: "adminAudit.target.contentItem", values: { itemId: itemId || "—" } },
      showValues: false,
    };
  }

  const knownAction = OTHER_ACTION_PRESENTATION[entry.action];
  return {
    category,
    title: knownAction
      ? { key: knownAction }
      : { key: "adminAudit.summary.otherAction", values: { action: cleanLabel(entry.action) || "Administrator change" } },
    target: { key: "adminAudit.targetType", values: { target: cleanLabel(entry.target_type) || "Administrator record" } },
    showValues: false,
  };
}
