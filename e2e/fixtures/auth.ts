import type { BrowserContext, Page } from "@playwright/test";
import { getAnonClient } from "./supabase";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const STORAGE_KEY = (() => {
  // supabase-js v2 stores session under sb-<project-ref>-auth-token
  const ref = SUPABASE_URL?.match(/^https?:\/\/([^.]+)\./)?.[1] ?? "default";
  return `sb-${ref}-auth-token`;
})();

export type AuthedSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  user: unknown;
};

export async function signInProgrammatic(
  email: string,
  password: string,
): Promise<AuthedSession> {
  const sb = getAnonClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Programmatic sign-in failed for ${email}: ${error?.message ?? "no session"}`);
  }
  return data.session as unknown as AuthedSession;
}

export async function hydrateContextWithSession(
  context: BrowserContext,
  baseURL: string,
  session: AuthedSession,
): Promise<void> {
  const payload = JSON.stringify(session);
  await context.addInitScript(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // ignore
      }
    },
    { key: STORAGE_KEY, value: payload },
  );
  // Touch the origin so localStorage is bound to it before storageState() is saved.
  const page: Page = await context.newPage();
  await page.goto(baseURL);
  await page.close();
}
