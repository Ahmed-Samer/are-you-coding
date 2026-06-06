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

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const ipHits = new Map<string, number[]>();

function ipRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (v.length === 0 || now - v[v.length - 1]! > RATE_WINDOW_MS) {
        ipHits.delete(k);
      }
    }
  }
  return hits.length > RATE_MAX;
}

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

    const v = validateSlug(slug);
    if (!v.ok) {
      return { slug, available: false, reason: v.reason };
    }

    try {
      const ip = getClientIp();
      if (ipRateLimited(ip)) {
        return { slug, available: false, reason: "rate_limited" };
      }
    } catch {
      // ignore
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