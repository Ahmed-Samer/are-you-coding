// Ad-hoc rate-limit + origin helpers. Server-only — the `.server.ts` extension
// keeps this out of the client bundle.
//
// NOTE: the platform has no managed rate-limiting primitive yet, so this is
// intentionally simple. We count rows in the target table over a fixed window
// (the same pattern `analytics.functions.ts` and `errors.functions.ts` use).
// Good enough to slow brute-force and spam; not a substitute for an edge WAF.

import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const sb = supabaseAdmin as any;

export function getClientIp(): string {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  } catch {
    return "unknown";
  }
}

type WindowOpts = {
  table: string;
  /** Equality filters (column -> value). All must match. */
  filters: Record<string, string | number | null>;
  /** Column with row timestamp. Defaults to `created_at`. */
  timestampColumn?: string;
  /** Max events in `windowSec` before this throws. */
  max: number;
  /** Window length in seconds. */
  windowSec: number;
  /** Optional message override (used in the thrown error). */
  label?: string;
};

/**
 * Throw if more than `max` rows in `table` matching `filters` were created in
 * the last `windowSec` seconds. Best-effort: if the count query fails we let
 * the request through rather than block legitimate users on infra hiccups.
 */
export async function enforceRateLimit(opts: WindowOpts): Promise<void> {
  const since = new Date(Date.now() - opts.windowSec * 1000).toISOString();
  let q = sb
    .from(opts.table)
    .select("*", { count: "exact", head: true })
    .gte(opts.timestampColumn ?? "created_at", since);
  for (const [col, val] of Object.entries(opts.filters)) {
    q = val === null ? q.is(col, null) : q.eq(col, val);
  }
  const { count, error } = await q;
  if (error) {
    console.error("[rate-limit] count failed", opts.table, error.message);
    return;
  }
  if ((count ?? 0) >= opts.max) {
    throw new Error(
      opts.label
        ? `Too many ${opts.label}. Please slow down and try again later.`
        : "Rate limit exceeded. Please try again later.",
    );
  }
}

/**
 * Origin / CSRF guard for state-changing server functions.
 *
 * Server fns are POST RPCs that send Authorization bearer (no auth cookies),
 * so they aren't trivially exploitable by classic CSRF — but we still pin the
 * Origin header for defense in depth. Allows same-host, *.lovable.app
 * preview/publish hosts, and any custom domains passed in.
 *
 * Best-effort: missing Origin (CLI tools, curl, mobile webview) is allowed
 * because not every legitimate client sends one. Browsers always do for POST.
 */
export function assertSameOrigin(extraHosts: string[] = []): void {
  const origin = getRequestHeader("origin");
  if (!origin) return; // non-browser caller; auth/bearer is still required upstream
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("Forbidden: bad Origin");
  }
  const host = getRequestHeader("host") ?? "";
  if (originHost === host) return;
  if (originHost.endsWith(".lovable.app")) return;
  if (originHost === "localhost" || originHost.startsWith("localhost:")) return;
  if (extraHosts.includes(originHost)) return;
  throw new Error("Forbidden: cross-origin request");
}
