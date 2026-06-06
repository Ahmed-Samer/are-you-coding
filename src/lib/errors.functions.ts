import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAuditLog } from "@/lib/audit.server";

const sb = supabaseAdmin as any;

async function assertAdmin(userId: string) {
  const { data, error } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const getErrorReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
      statusFilter: z.enum(["all", "resolved", "unresolved"]).default("unresolved"),
      scopeFilter: z.enum(["all", "frontend", "backend", "worker", "unknown"]).default("all"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    // Fixed: Removed tenants(name, slug) to avoid Foreign Key errors
    let query = sb.from("error_reports").select(
      "id, scope, route, message, stack, user_id, tenant_id, meta, resolved, resolved_at, created_at",
      { count: "exact" }
    );

    if (data.statusFilter === "resolved") {
      query = query.eq("resolved", true);
    } else if (data.statusFilter === "unresolved") {
      query = query.eq("resolved", false);
    }

    if (data.scopeFilter !== "all") {
      query = query.eq("scope", data.scopeFilter);
    }

    const { data: rows, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    return {
      errors: rows ?? [],
      total: count ?? 0,
    };
  });

export const resolveErrorReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("error_reports").update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: context.userId }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAuditLog({ actorId: context.userId, action: "error.resolved", targetTable: "error_reports", targetId: data.id, diff: { status: "resolved" } });
    return { ok: true };
  });

export const deleteErrorReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("error_reports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAuditLog({ actorId: context.userId, action: "error.deleted", targetTable: "error_reports", targetId: data.id, diff: { deleted: true } });
    return { ok: true };
  });

export const reportError = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      scope: z.enum(["frontend", "backend", "worker", "unknown"]).default("unknown"),
      message: z.string(),
      stack: z.string().optional(),
      route: z.string().optional(),
      tenantId: z.string().uuid().optional(),
      meta: z.record(z.any()).optional(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { error } = await sb.from("error_reports").insert({
      scope: data.scope, message: data.message.substring(0, 2000), stack: data.stack ? data.stack.substring(0, 5000) : null, route: data.route, tenant_id: data.tenantId, meta: data.meta ?? {},
    });
    if (error) console.error("Failed to log error to DB:", error.message);
    return { ok: true };
  });