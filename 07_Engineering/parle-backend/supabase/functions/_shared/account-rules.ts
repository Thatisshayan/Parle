/** Lists the account service checks against (R10). NATIVE_LANGUAGES must equal the app's NATIVE_LANGUAGE_VALUES (tested). */
export const NATIVE_LANGUAGES = [
  "English", "French", "Spanish", "Portuguese", "Arabic", "Persian", "Hindi", "Punjabi", "Urdu", "Tagalog",
  "Mandarin", "Vietnamese", "Ukrainian", "Russian", "Turkish", "Other",
] as const;
export const TRACKS = ["immigration", "citizenship", "general"] as const;

/** An empty language means "not chosen yet" (onboarding saves it later). */
export const validLanguage = (v: unknown) => v === "" || (typeof v === "string" && (NATIVE_LANGUAGES as readonly string[]).includes(v));
export const validTrack = (v: unknown) => typeof v === "string" && (TRACKS as readonly string[]).includes(v);
