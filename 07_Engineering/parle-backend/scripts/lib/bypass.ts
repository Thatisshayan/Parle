import { readSecret } from "./secrets";

/**
 * Opens the private preview with Vercel's bypass, which sets the bypass cookie for the rest of the visit. A failed
 * navigation's error names the URL, so the secret is removed from it before it can be printed (Plan 12 final review).
 */
export async function openWithBypass(page: { goto: (url: string) => Promise<unknown> }, app: string, secret: string = readSecret("VERCEL_BYPASS")): Promise<void> {
  try {
    await page.goto(`${app}/?x-vercel-protection-bypass=${secret}&x-vercel-set-bypass-cookie=true`);
  } catch (e) {
    const err = e as Error;
    throw new Error(String(err?.message ?? err).split(secret).join("[bypass]"));
  }
}
