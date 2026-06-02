// Server-fn wrappers that gate the direct supabase.auth.* browser calls
// (signup, login, password reset, MFA enroll/verify) via enforceRateLimit
// against the `auth_throttle_events` log table.
//
// Rationale: rate-limit.server.ts counts rows per window, which only works
// for endpoints that already insert rows. Direct auth.* calls don't, so we
// add a tiny event log and pair each browser auth call with a pre-check
// and (where applicable) a post-record server fn.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assertSameOrigin,
  enforceRateLimit,
  getClientIp,
} from "./rate-limit.server";

const sb = supabaseAdmin as any;

/** Read the Supabase project URL from env inside the handler. Hardcoding
 *  the URL rots when the project is cloned to a new environment; the
 *  Worker runtime always has `SUPABASE_URL` available at call time. */
function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error("SUPABASE_URL env var is not set");
  }
  return url;
}

const emailSchema = z.string().trim().toLowerCase().email().max(255);

async function logEvent(kind: string, key: string, ip: string | null) {
  await sb.from("auth_throttle_events").insert({ kind, key, ip });
}

/** Pre-signup throttle: 10 attempts per IP per hour.
 *  fullName is accepted (and length-bounded) for server-side parity with the
 *  client schema; the value itself is persisted by Supabase Auth as
 *  user_metadata.full_name during the subsequent signUp call. */
export const preSignupCheck = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        email: emailSchema,
        fullName: z.string().trim().min(2).max(80).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    assertSameOrigin();
    const ip = getClientIp();
    await enforceRateLimit({
      table: "auth_throttle_events",
      filters: { kind: "signup", key: ip },
      max: 10,
      windowSec: 3600,
      label: "signup attempts",
    });
    await logEvent("signup", data.email, ip);
    return { ok: true };
  });

/** Throttled password-reset: 3/email/hour and 5/IP/hour. */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ email: emailSchema, redirectTo: z.string().url() }).parse(i),
  )
  .handler(async ({ data }) => {
    assertSameOrigin();
    const ip = getClientIp();
    await enforceRateLimit({
      table: "auth_throttle_events",
      filters: { kind: "password_reset", key: data.email },
      max: 3,
      windowSec: 3600,
      label: "password reset requests",
    });
    await enforceRateLimit({
      table: "auth_throttle_events",
      filters: { kind: "password_reset", key: ip },
      max: 5,
      windowSec: 3600,
      label: "password reset requests",
    });
    await logEvent("password_reset", data.email, ip);

    // Call Supabase Auth's recovery endpoint directly (no SDK required).
    // We do not surface email-existence info to the caller.
    try {
      await fetch(`${getSupabaseUrl()}/auth/v1/recover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
        },
        body: JSON.stringify({ email: data.email, redirect_to: data.redirectTo }),
      });
    } catch (e) {
      console.error("[auth-throttle] recover call failed", (e as Error).message);
    }
    return { ok: true };
  });

/** Throttled signup-confirmation resend: 3/email/hour. */
export const resendSignupConfirmation = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ email: emailSchema, redirectTo: z.string().url() }).parse(i),
  )
  .handler(async ({ data }) => {
    assertSameOrigin();
    const ip = getClientIp();
    await enforceRateLimit({
      table: "auth_throttle_events",
      filters: { kind: "confirm_resend", key: data.email },
      max: 3,
      windowSec: 3600,
      label: "confirmation emails",
    });
    await logEvent("confirm_resend", data.email, ip);
    try {
      await fetch(`${getSupabaseUrl()}/auth/v1/resend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
        },
        body: JSON.stringify({
          type: "signup",
          email: data.email,
          options: { email_redirect_to: data.redirectTo },
        }),
      });
    } catch (e) {
      console.error("[auth-throttle] resend call failed", (e as Error).message);
    }
    return { ok: true };
  });

/** Pre-login gate: blocks after 10 failures/email or 20/IP in 15 min. */
export const checkLoginAllowed = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ email: emailSchema }).parse(i))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const ip = getClientIp();
    await enforceRateLimit({
      table: "auth_throttle_events",
      filters: { kind: "login_failure", key: data.email },
      max: 10,
      windowSec: 900,
      label: "failed sign-in attempts",
    });
    await enforceRateLimit({
      table: "auth_throttle_events",
      filters: { kind: "login_failure", key: ip },
      max: 20,
      windowSec: 900,
      label: "failed sign-in attempts",
    });
    return { ok: true };
  });

/** Logs a login failure so checkLoginAllowed can count it. */
export const recordLoginFailure = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ email: emailSchema }).parse(i))
  .handler(async ({ data }) => {
    assertSameOrigin();
    await logEvent("login_failure", data.email, getClientIp());
    return { ok: true };
  });

/**
 * Server-authoritative read of the current login-throttle state.
 * Returns the longest retry-after window across email-key and IP-key
 * counters. No row insert — safe to poll from the client.
 */
const LOGIN_EMAIL_MAX = 10;
const LOGIN_IP_MAX = 20;
const LOGIN_WINDOW_SEC = 900;

async function oldestFailureWithinWindow(
  filterCol: "key" | "ip",
  value: string,
): Promise<string | null> {
  const since = new Date(Date.now() - LOGIN_WINDOW_SEC * 1000).toISOString();
  const { data, error } = await sb
    .from("auth_throttle_events")
    .select("created_at")
    .eq("kind", "login_failure")
    .eq(filterCol, value)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0].created_at as string;
}

async function countFailures(
  filterCol: "key" | "ip",
  value: string,
): Promise<number> {
  const since = new Date(Date.now() - LOGIN_WINDOW_SEC * 1000).toISOString();
  const { count, error } = await sb
    .from("auth_throttle_events")
    .select("*", { count: "exact", head: true })
    .eq("kind", "login_failure")
    .eq(filterCol, value)
    .gte("created_at", since);
  if (error) return 0;
  return count ?? 0;
}

async function retryAfterFor(
  filterCol: "key" | "ip",
  value: string,
  max: number,
): Promise<number> {
  const count = await countFailures(filterCol, value);
  if (count < max) return 0;
  const oldest = await oldestFailureWithinWindow(filterCol, value);
  if (!oldest) return 0;
  const expiresAt = new Date(oldest).getTime() + LOGIN_WINDOW_SEC * 1000;
  const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

export const getLoginThrottleState = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ email: emailSchema.optional() }).parse(i))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const ip = getClientIp();
    const ipRetry = await retryAfterFor("ip", ip, LOGIN_IP_MAX);
    let emailRetry = 0;
    if (data.email) {
      emailRetry = await retryAfterFor("key", data.email, LOGIN_EMAIL_MAX);
    }
    const retryAfterSec = Math.max(ipRetry, emailRetry);
    return { retryAfterSec, blocked: retryAfterSec > 0 };
  });

/** MFA enroll: caps at 5/user/hour. */
export const recordMfaEnroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertSameOrigin();
    await enforceRateLimit({
      table: "auth_throttle_events",
      filters: { kind: "mfa_enroll", key: context.userId },
      max: 5,
      windowSec: 3600,
      label: "MFA enrollments",
    });
    await logEvent("mfa_enroll", context.userId, getClientIp());
    return { ok: true };
  });

/** MFA verify: caps at 10/user/10 min. */
export const recordMfaVerify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertSameOrigin();
    await enforceRateLimit({
      table: "auth_throttle_events",
      filters: { kind: "mfa_verify", key: context.userId },
      max: 10,
      windowSec: 600,
      label: "MFA verification attempts",
    });
    await logEvent("mfa_verify", context.userId, getClientIp());
    return { ok: true };
  });
