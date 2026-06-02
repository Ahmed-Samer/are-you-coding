import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const sb = supabaseAdmin as any;

// Authenticated, rate-limited error sink. Max 30 reports / 5 min per user.
export const reportClientError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      route: z.string().trim().max(500).optional().nullable(),
      message: z.string().trim().min(1).max(2000),
      stack: z.string().trim().max(8000).optional().nullable(),
      tenantId: z.string().uuid().optional().nullable(),
      meta: z.record(z.string(), z.unknown()).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const { count } = await sb
      .from("error_reports")
      .select("*", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", since);
    if ((count ?? 0) >= 30) return { ok: false, throttled: true };

    const { error } = await sb.from("error_reports").insert({
      scope: "client",
      route: data.route ?? null,
      message: data.message,
      stack: data.stack ?? null,
      user_id: context.userId,
      tenant_id: data.tenantId ?? null,
      meta: data.meta ?? {},
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
