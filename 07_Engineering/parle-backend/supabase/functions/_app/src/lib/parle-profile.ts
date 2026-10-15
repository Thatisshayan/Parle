// GENERATED from parle-app/src/lib/parle-profile.ts by scripts/sync-app-code.ts. Do not edit.
import { ParleIdentity, ParleProfile, User } from "../../../_shared/app-shims/entities.ts";
import { parleAccountService } from "../../../_shared/app-shims/functions.ts";

/** Permanently deletes the signed-in account on the server (spec section 5, S2). Returns an error code or null. */
export async function deleteMyAccount(password: string, confirm: string): Promise<string | null> {
  try {
    await parleAccountService({ action: "delete_account", password, confirm });
    return null;
  } catch (error) {
    const match = /API request failed: ([A-Z_]+)/.exec(String((error as Error)?.message));
    return match ? match[1] : "REQUEST_FAILED";
  }
}

/** Profile writes go through the server (backend Plan 2): the browser never writes app tables. */
async function saveProfileFields(values: Record<string, unknown>): Promise<ParleProfileRecord> {
  const res = await parleAccountService({ action: "save_profile", ...values });
  return res.profile as ParleProfileRecord;
}

export type ParleRole = "learner" | "tutor";

export interface ParleUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  [key: string]: unknown;
}

export interface ParleIdentityRecord {
  id: string;
  role: ParleRole;
  age_confirmed: boolean;
  age_confirmed_at: string;
  premium_comp_active?: boolean;
  created_at?: string;
  created_by?: string;
}

export interface ParleProfileRecord {
  id: string;
  photo_url?: string | null;
  time_zone?: string | null;
  native_language?: string | null;
  explain_in_native?: boolean | null;
  email_product_updates?: boolean | null;
  created_at?: string;
  created_by?: string;
}

export interface ParleAccountData {
  user: ParleUser;
  identity: ParleIdentityRecord | null;
  profile: ParleProfileRecord | null;
}

export interface SaveProfileInput {
  full_name: string;
  photo_url: string;
  time_zone: string;
  native_language: string;
  email_product_updates: boolean;
}

export const NATIVE_LANGUAGE_VALUES = [
  "English",
  "French",
  "Spanish",
  "Portuguese",
  "Arabic",
  "Persian",
  "Hindi",
  "Punjabi",
  "Urdu",
  "Tagalog",
  "Mandarin",
  "Vietnamese",
  "Ukrainian",
  "Russian",
  "Turkish",
  "Other",
] as const;

function recordsFromResponse<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];

  if (response && typeof response === "object") {
    const records = (response as { data?: unknown }).data;
    if (Array.isArray(records)) return records as T[];
  }

  throw new Error("Unexpected entity list response.");
}

/** Resolve the earliest identity by creation time; this depends on server sort ordering and does not enforce uniqueness. */
async function findCanonicalIdentity(email: string): Promise<ParleIdentityRecord | null> {
  const response = await ParleIdentity.filter({ created_by: email }, "created_at", 1);
  return recordsFromResponse<ParleIdentityRecord>(response)[0] ?? null;
}

async function findMyProfileRecord(email: string): Promise<ParleProfileRecord | null> {
  const response = await ParleProfile.filter({ created_by: email }, "-created_at", 1);
  return recordsFromResponse<ParleProfileRecord>(response)[0] ?? null;
}

/** Create the signup profile once, filling only a missing time zone on existing profiles. */
export async function initializeMySignupProfile(): Promise<ParleProfileRecord> {
  const user = (await User.me()) as ParleUser;
  const profile = await findMyProfileRecord(user.email);
  if (profile?.time_zone?.trim()) return profile;

  const savedProfile = await saveProfileFields({ time_zone: browserTimeZone() });
  if (!savedProfile?.time_zone?.trim() || !isValidIanaTimeZone(savedProfile.time_zone)) {
    throw new Error("The signup time zone could not be confirmed.");
  }
  return savedProfile;
}

/** Update only the onboarding-owned language and time zone on the signed-in user's profile. */
export async function syncMyOnboardingProfile(input: { native_language: string; time_zone: string }): Promise<ParleProfileRecord> {
  const nativeLanguage = input.native_language.trim();
  const timeZone = input.time_zone.trim();
  if (!isValidIanaTimeZone(timeZone)) throw new Error("A valid time zone is required.");
  if (!NATIVE_LANGUAGE_VALUES.includes(nativeLanguage as (typeof NATIVE_LANGUAGE_VALUES)[number])) {
    throw new Error("Choose a language from the available list.");
  }

  const savedProfile = await saveProfileFields({ native_language: nativeLanguage, time_zone: timeZone });
  if (savedProfile?.native_language !== nativeLanguage || savedProfile?.time_zone !== timeZone) {
    throw new Error("The onboarding profile preferences could not be confirmed.");
  }
  return savedProfile;
}

export async function loadMyParleAccount(): Promise<ParleAccountData> {
  const user = (await User.me()) as ParleUser;
  const [identity, profile] = await Promise.all([
    findCanonicalIdentity(user.email),
    findMyProfileRecord(user.email),
  ]);
  return { user, identity, profile };
}

export async function getMyIdentity(): Promise<ParleIdentityRecord | null> {
  const user = (await User.me()) as ParleUser;
  return findCanonicalIdentity(user.email);
}

export async function createMyIdentity(role: ParleRole, ageConfirmed: boolean): Promise<ParleIdentityRecord> {
  if (!ageConfirmed) throw new Error("Age confirmation is required.");
  const user = (await User.me()) as ParleUser;
  if (user.role === "administrator") throw new Error("Administrator accounts cannot use learner or tutor signup.");

  try {
    const res = await parleAccountService({ action: "ensure_identity", role, age_confirmed: true });
    return res.identity as ParleIdentityRecord;
  } catch (error) {
    if (/ROLE_EXISTS/.test(String((error as Error).message))) throw new Error("A Parle role already exists for this account.");
    throw error;
  }
}

export async function saveMyProfile(input: SaveProfileInput): Promise<ParleAccountData> {
  const fullName = input.full_name.trim();
  if (!fullName) throw new Error("A name is required.");
  if (!isValidIanaTimeZone(input.time_zone)) throw new Error("A valid time zone is required.");
  if (input.native_language && !NATIVE_LANGUAGE_VALUES.includes(input.native_language as (typeof NATIVE_LANGUAGE_VALUES)[number])) {
    throw new Error("Choose a language from the available list.");
  }

  await User.updateProfile({ full_name: fullName });
  await saveProfileFields({
    photo_url: input.photo_url,
    time_zone: input.time_zone.trim(),
    native_language: input.native_language,
    email_product_updates: input.email_product_updates,
  });

  return loadMyParleAccount();
}

/** Store the tutor's explanation-language choice on the signed-in account profile. */
export async function updateMyExplanationPreference(explainInNative: boolean): Promise<ParleProfileRecord> {
  const user = (await User.me()) as ParleUser;
  if (!user?.id || !user.email) throw new Error("Sign in to save tutor language preferences.");
  const profile = await findMyProfileRecord(user.email);
  const saved = await saveProfileFields(profile?.time_zone ? { explain_in_native: explainInNative } : { explain_in_native: explainInNative, time_zone: browserTimeZone() });
  if (saved?.explain_in_native !== explainInNative) throw new Error("The tutor language preference could not be confirmed.");
  return saved;
}

export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidIanaTimeZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidIanaTimeZone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Photos are shown through their plain public address (D30: image resizing is a paid Supabase feature); CSS sizes them. */
export function imageUrlForDisplay(url: string | null | undefined, _width = 320): string | undefined {
  return url || undefined;
}

export async function exportMyParleData() {
  const { user, identity, profile } = await loadMyParleAccount();
  return {
    exported_at: new Date().toISOString(),
    account: {
      email: user.email,
      full_name: user.full_name ?? "",
    },
    parle_identity: identity
      ? {
          role: identity.role,
          age_confirmed: identity.age_confirmed,
          age_confirmed_at: identity.age_confirmed_at,
        }
      : null,
    profile: {
      photo_url: profile?.photo_url ?? "",
      time_zone: profile?.time_zone ?? "",
      native_language: profile?.native_language ?? "",
      explain_in_native: profile?.explain_in_native ?? false,
      email_product_updates: profile?.email_product_updates ?? false,
    },
  };
}

export function roleHomePath(userRole: string | null | undefined, canonicalIdentity: ParleIdentityRecord | null): string {
  if (userRole === "administrator") return "/admin";
  if (canonicalIdentity?.role === "tutor") return "/tutor";
  if (canonicalIdentity?.role === "learner") return "/learner";
  return "/";
}
