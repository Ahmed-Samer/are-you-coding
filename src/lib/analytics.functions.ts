import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const sb = supabaseAdmin as any;

// Rate-limit storefront events per session_id (max 60 events / 60s).
async function checkRate(tenantId: string, sessionId: string | null) {
  if (!sessionId) return;
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await sb
    .from("analytics_events")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .gte("created_at", since);
  if ((count ?? 0) >= 60) throw new Error("Rate limit exceeded");
}

export const trackStorefrontEvent = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      eventType: z.enum(["page_view", "product_view", "add_to_cart", "checkout_start", "order_placed"]),
      sessionId: z.string().trim().min(8).max(80).optional().nullable(),
      productId: z.string().uuid().optional().nullable(),
      payload: z.record(z.string(), z.unknown()).optional(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    await checkRate(data.tenantId, data.sessionId ?? null);
    const { error } = await sb.from("analytics_events").insert({
      tenant_id: data.tenantId,
      event_type: data.eventType,
      session_id: data.sessionId ?? null,
      product_id: data.productId ?? null,
      payload: data.payload ?? {},
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTenantAnalyticsSeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      days: z.number().int().min(1).max(90).default(14),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: t } = await sb
      .from("tenants")
      .select("id, owner_id")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (!t || t.owner_id !== context.userId) throw new Error("Forbidden");

    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await sb
      .from("analytics_events")
      .select("event_type, created_at")
      .eq("tenant_id", data.tenantId)
      .gte("created_at", since);
    if (error) throw new Error(error.message);

    const buckets = new Map<string, Record<string, number>>();
    for (const r of rows ?? []) {
      const day = String(r.created_at).slice(0, 10);
      const b = buckets.get(day) ?? {};
      b[r.event_type] = (b[r.event_type] ?? 0) + 1;
      buckets.set(day, b);
    }
    const series = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));
    return { series, totalEvents: rows?.length ?? 0 };
  });
