import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getClientIp } from "@/lib/rate-limit.server";
import { SLUG_MAX, validateSlug } from "@/lib/slug-rules";

export type SlugAvailabilityReason =
  | "available"
  | "taken"
  | "reserved"
  | "format"
  | "rate_limited"
  | "error";

export type SlugAvailabilityResult = {
  slug: string;
  available: boolean;
  reason: SlugAvailabilityReason;
};

// Best-effort in-process token bucket per client IP. Workers are stateless
// across cold starts, but within an isolate this throttles obvious abuse
// (the advisory endpoint returns only a boolean, so this is defense in
// depth — the unique constraint on tenants.slug is the authoritative gate).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const ipHits = new Map<string, number[]>();

function ipRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  // Opportunistic GC to keep the map bounded.
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (v.length === 0 || now - v[v.length - 1]! > RATE_WINDOW_MS) {
        ipHits.delete(k);
      }
    }
  }
  return hits.length > RATE_MAX;
}

/**
 * Advisory tenant-slug availability check.
 *
 * Public (anon-callable, no `requireSupabaseAuth`) so the wizard can probe
 * during typing before the user has fully signed in. Returns ONLY a
 * boolean + reason — never any tenant fields — to prevent slug enumeration
 * from leaking ownership data.
 *
 * Authoritative uniqueness is still enforced by the UNIQUE constraint on
 * public.tenants.slug at create time (see createTenantAndSubscription).
 */
export const checkSlugAvailability = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        slug: z.string().trim().toLowerCase().max(SLUG_MAX + 8),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<SlugAvailabilityResult> => {
    const slug = data.slug;

    // Local rule check first — cheap, deterministic, no DB hit.
    const v = validateSlug(slug);
    if (!v.ok) {
      return { slug, available: false, reason: v.reason };
    }

    // Soft per-IP throttle. Fail-soft on any limiter error.
    try {
      const ip = getClientIp();
      if (ipRateLimited(ip)) {
        return { slug, available: false, reason: "rate_limited" };
      }
    } catch {
      // ignore — never block a legit user on a limiter glitch
    }

    try {
      const { count, error } = await (supabaseAdmin as any)
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("slug", slug);
      if (error) {
        console.error("[checkSlugAvailability] lookup failed:", error.message);
        return { slug, available: false, reason: "error" };
      }
      const taken = (count ?? 0) > 0;
      return {
        slug,
        available: !taken,
        reason: taken ? "taken" : "available",
      };
    } catch (err) {
      console.error("[checkSlugAvailability] unexpected error:", err);
      return { slug, available: false, reason: "error" };
    }
  });
