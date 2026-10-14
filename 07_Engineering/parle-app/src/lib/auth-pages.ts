import { superdevClient } from "@/lib/superdev/client";
import type { TranslationKey } from "@/lib/i18n";

const client = superdevClient.auth.client;
const API = client.options.baseUrl;
const APP_ID = client.options.appId;

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, appId: APP_ID, inApp: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}

interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; full_name: string | null; role: string };
}

function storeSession(session: Session) {
  superdevClient.auth.setToken(session.accessToken);
  client.setRefreshToken(session.refreshToken);
}

export async function signIn(email: string, password: string) {
  const session = await post<Session>("/auth/app-login", { email, password });
  storeSession(session);
  return session.user;
}

export async function signUp(name: string, email: string, password: string) {
  const session = await post<Session>("/auth/app-signup", { name, email, password });
  storeSession(session);
  return session.user;
}

export function requestPasswordReset(email: string) {
  return post<{ success: boolean }>("/auth/app-forgot-password", { email });
}

export function resetPassword(token: string, password: string) {
  return post<{ success: boolean }>("/auth/app-reset-password", { token, password });
}

/** Keeps the SDK's optional post-login destination on this origin. */
export function afterLoginPath(): string {
  const raw = new URLSearchParams(window.location.search).get("from_url");
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}

export function authErrorKey(error: unknown): TranslationKey {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/invalid.*credential|email or password|incorrect password|user not found/.test(message)) {
    return "auth.error.invalidCredentials";
  }
  if (/already.*(registered|exist)|email.*(taken|exist)|user.*already/.test(message)) {
    return "auth.error.emailExists";
  }
  if (/expired|used.*token|invalid.*token|reset.*link/.test(message)) {
    return "auth.error.resetExpired";
  }
  if (/password/.test(message)) return "auth.error.password";
  if (/network|fetch|connection|timeout/.test(message)) return "auth.error.network";
  return "auth.error.generic";
}

export function passwordMeetsRequirements(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
