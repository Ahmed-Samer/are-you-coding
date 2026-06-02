import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAuditLog } from "@/lib/audit.server";
import { rowsToCsv, rowsToJson, weeklyRevenueBuckets } from "@/lib/admin-analytics.server";

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

const Window = z.enum(["7", "30", "90", "365"]).transform((v) => parseInt(v, 10));
const WeeksWindow = z.enum(["8", "12", "26"]).transform((v) => parseInt(v, 10));

// ============== Overview ==============

export const getAnalyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ days: Window.default("30") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const days = data.days;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const prevSince = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000).toISOString();

    const [tenantsRes, paidRes, proofsRes, prevProofsRes, newSignupsRes, prevSignupsRes] =
      await Promise.all([
        sb.from("tenants").select("id", { count: "exact", head: true }).eq("status", "active"),
        sb.from("subscriptions").select("tenant_id", { count: "exact", head: true }).eq("status", "active"),
        sb.from("payment_proofs")
          .select("amount_usd, created_at")
          .eq("status", "approved")
          .gte("created_at", since),
        sb.from("payment_proofs")
          .select("amount_usd")
          .eq("status", "approved")
          .gte("created_at", prevSince)
          .lt("created_at", since),
        sb.from("tenants").select("id", { count: "exact", head: true }).gte("created_at", since),
        sb.from("tenants").select("id", { count: "exact", head: true })
          .gte("created_at", prevSince).lt("created_at", since),
      ]);

    const periodRevenue = (proofsRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.amount_usd ?? 0), 0);
    const prevRevenue = (prevProofsRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.amount_usd ?? 0), 0);

    // MRR proxy: sum amount_usd of approved proofs in the last 30 days.
    const mrrRes = await sb.from("payment_proofs")
      .select("amount_usd")
      .eq("status", "approved")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
    const mrrUsd = (mrrRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.amount_usd ?? 0), 0);

    const activeTenants = tenantsRes.count ?? 0;
    const paidTenants = paidRes.count ?? 0;
    const newSignups = newSignupsRes.count ?? 0;
    const prevSignups = prevSignupsRes.count ?? 0;
    const conversionPct = newSignups > 0 ? (paidTenants / Math.max(newSignups, 1)) * 100 : 0;

    const weeks = Math.max(4, Math.ceil(days / 7));
    const revenueTimeline = weeklyRevenueBuckets(
      (proofsRes.data ?? []) as any,
      weeks,
    );

    return {
      days,
      activeTenants,
      paidTenants,
      mrrUsd,
      arrUsd: mrrUsd * 12,
      newSignups,
      conversionPct,
      periodRevenueUsd: periodRevenue,
      revenueTimeline,
      deltas: {
        signups: prevSignups === 0 ? null : ((newSignups - prevSignups) / prevSignups) * 100,
        revenue: prevRevenue === 0 ? null : ((periodRevenue - prevRevenue) / prevRevenue) * 100,
      },
    };
  });

// ============== Cohort retention ==============

export const getCohortRetention = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ weeks: WeeksWindow.default("12") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await sb.rpc("admin_tenant_cohort_retention", {
      p_weeks: data.weeks,
    });
    if (error) throw new Error(error.message);

    const cohortMap = new Map<string, { cohortWeek: string; size: number; cells: Map<number, number> }>();
    for (const r of (rows ?? []) as any[]) {
      const key = String(r.cohort_week);
      if (!cohortMap.has(key)) {
        cohortMap.set(key, { cohortWeek: key, size: Number(r.cohort_size), cells: new Map() });
      }
      cohortMap.get(key)!.cells.set(Number(r.week_offset), Number(r.active_count));
    }

    const cohorts = Array.from(cohortMap.values()).map((c) => ({
      cohortWeek: c.cohortWeek,
      size: c.size,
      retention: Array.from({ length: data.weeks }, (_, i) => {
        const count = c.cells.get(i) ?? 0;
        return { offset: i, count, pct: c.size > 0 ? (count / c.size) * 100 : 0 };
      }),
    }));

    return { weeks: data.weeks, cohorts };
  });

// ============== Funnel ==============

export const getPlatformFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ days: Window.default("30") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await sb.rpc("admin_platform_funnel", { p_days: data.days });
    if (error) throw new Error(error.message);

    const stages = ((rows ?? []) as any[])
      .sort((a, b) => a.stage_order - b.stage_order)
      .map((r, i, arr) => {
        const top = Number(arr[0]?.tenant_count ?? 0);
        const prev = i > 0 ? Number(arr[i - 1].tenant_count) : Number(r.tenant_count);
        const count = Number(r.tenant_count);
        return {
          key: r.stage_key as string,
          label: r.stage_label as string,
          count,
          conversionFromTop: top > 0 ? (count / top) * 100 : 0,
          conversionFromPrev: prev > 0 ? (count / prev) * 100 : 0,
        };
      });

    return { days: data.days, stages };
  });

// ============== Revenue breakdown ==============

export const getRevenueBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ days: Window.default("30") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const since = new Date(Date.now() - data.days * 86400000).toISOString();

    const { data: rows, error } = await sb
      .from("payment_proofs")
      .select("amount_usd, created_at, payment_methods(label,kind), subscriptions(plans(name,interval))")
      .eq("status", "approved")
      .gte("created_at", since);
    if (error) throw new Error(error.message);

    const byPlanMap = new Map<string, { plan: string; interval: string; proofs: number; usd: number }>();
    const byMethodMap = new Map<string, { method: string; kind: string; proofs: number; usd: number }>();

    for (const r of (rows ?? []) as any[]) {
      const usd = Number(r.amount_usd ?? 0);
      const planName = r.subscriptions?.plans?.name ?? "Unknown";
      const planInterval = r.subscriptions?.plans?.interval ?? "—";
      const planKey = `${planName}|${planInterval}`;
      if (!byPlanMap.has(planKey)) byPlanMap.set(planKey, { plan: planName, interval: planInterval, proofs: 0, usd: 0 });
      const p = byPlanMap.get(planKey)!;
      p.proofs += 1;
      p.usd += usd;

      const methodLabel = r.payment_methods?.label ?? "Unknown";
      const methodKind = r.payment_methods?.kind ?? "—";
      if (!byMethodMap.has(methodLabel)) byMethodMap.set(methodLabel, { method: methodLabel, kind: methodKind, proofs: 0, usd: 0 });
      const m = byMethodMap.get(methodLabel)!;
      m.proofs += 1;
      m.usd += usd;
    }

    const weeks = Math.max(4, Math.ceil(data.days / 7));
    const timeline = weeklyRevenueBuckets((rows ?? []) as any, weeks);

    return {
      days: data.days,
      byPlan: Array.from(byPlanMap.values()).sort((a, b) => b.usd - a.usd),
      byMethod: Array.from(byMethodMap.values()).sort((a, b) => b.usd - a.usd),
      timeline,
    };
  });

// ============== Top tenants ==============

export const getTopTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      days: Window.default("30"),
      limit: z.number().int().min(1).max(50).default(20),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const since = new Date(Date.now() - data.days * 86400000).toISOString();

    const { data: rows, error } = await sb
      .from("payment_proofs")
      .select("tenant_id, amount_usd, created_at, tenants(name,slug,status,created_at)")
      .eq("status", "approved")
      .gte("created_at", since);
    if (error) throw new Error(error.message);

    const map = new Map<string, any>();
    for (const r of (rows ?? []) as any[]) {
      const id = r.tenant_id as string;
      const usd = Number(r.amount_usd ?? 0);
      const existing = map.get(id);
      if (existing) {
        existing.totalUsd += usd;
        existing.proofCount += 1;
        if (r.created_at > existing.lastPaymentAt) existing.lastPaymentAt = r.created_at;
      } else {
        map.set(id, {
          id,
          name: r.tenants?.name ?? "—",
          slug: r.tenants?.slug ?? "",
          status: r.tenants?.status ?? "—",
          createdAt: r.tenants?.created_at ?? null,
          totalUsd: usd,
          proofCount: 1,
          lastPaymentAt: r.created_at,
        });
      }
    }

    const tenants = Array.from(map.values())
      .sort((a, b) => b.totalUsd - a.totalUsd)
      .slice(0, data.limit);

    return { days: data.days, tenants };
  });

// ============== Export ==============

const Dataset = z.enum(["cohort", "funnel", "revenue-by-plan", "revenue-by-method", "top-tenants"]);
const Format = z.enum(["csv", "json"]);

export const exportAnalyticsDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      dataset: Dataset,
      format: Format,
      days: Window.default("30"),
      weeks: WeeksWindow.default("12"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    let rows: Record<string, unknown>[] = [];
    let filenameStem = "analytics";

    if (data.dataset === "cohort") {
      filenameStem = `cohort-retention-${data.weeks}w`;
      const { data: cr, error } = await sb.rpc("admin_tenant_cohort_retention", { p_weeks: data.weeks });
      if (error) throw new Error(error.message);
      rows = (cr ?? []) as any[];
    } else if (data.dataset === "funnel") {
      filenameStem = `funnel-${data.days}d`;
      const { data: fr, error } = await sb.rpc("admin_platform_funnel", { p_days: data.days });
      if (error) throw new Error(error.message);
      rows = (fr ?? []) as any[];
    } else if (data.dataset === "revenue-by-plan" || data.dataset === "revenue-by-method") {
      filenameStem = `${data.dataset}-${data.days}d`;
      const since = new Date(Date.now() - data.days * 86400000).toISOString();
      const { data: pr, error } = await sb
        .from("payment_proofs")
        .select("amount_usd, created_at, payment_methods(label,kind), subscriptions(plans(name,interval))")
        .eq("status", "approved")
        .gte("created_at", since);
      if (error) throw new Error(error.message);
      const byPlan = new Map<string, any>();
      const byMethod = new Map<string, any>();
      for (const r of (pr ?? []) as any[]) {
        const usd = Number(r.amount_usd ?? 0);
        const pn = r.subscriptions?.plans?.name ?? "Unknown";
        const pi = r.subscriptions?.plans?.interval ?? "—";
        const pk = `${pn}|${pi}`;
        if (!byPlan.has(pk)) byPlan.set(pk, { plan: pn, interval: pi, proofs: 0, usd: 0 });
        byPlan.get(pk).proofs++; byPlan.get(pk).usd += usd;
        const ml = r.payment_methods?.label ?? "Unknown";
        const mk = r.payment_methods?.kind ?? "—";
        if (!byMethod.has(ml)) byMethod.set(ml, { method: ml, kind: mk, proofs: 0, usd: 0 });
        byMethod.get(ml).proofs++; byMethod.get(ml).usd += usd;
      }
      rows = data.dataset === "revenue-by-plan"
        ? Array.from(byPlan.values())
        : Array.from(byMethod.values());
    } else if (data.dataset === "top-tenants") {
      filenameStem = `top-tenants-${data.days}d`;
      const since = new Date(Date.now() - data.days * 86400000).toISOString();
      const { data: tr, error } = await sb
        .from("payment_proofs")
        .select("tenant_id, amount_usd, created_at, tenants(name,slug,status,created_at)")
        .eq("status", "approved")
        .gte("created_at", since);
      if (error) throw new Error(error.message);
      const m = new Map<string, any>();
      for (const r of (tr ?? []) as any[]) {
        const id = r.tenant_id as string;
        const usd = Number(r.amount_usd ?? 0);
        const ex = m.get(id);
        if (ex) { ex.total_usd += usd; ex.proofs += 1; }
        else m.set(id, {
          tenant_id: id,
          name: r.tenants?.name ?? "—",
          slug: r.tenants?.slug ?? "",
          status: r.tenants?.status ?? "—",
          total_usd: usd,
          proofs: 1,
        });
      }
      rows = Array.from(m.values()).sort((a, b) => b.total_usd - a.total_usd);
    }

    await writeAuditLog({
      actorId: context.userId,
      action: "analytics.export",
      targetTable: null,
      targetId: null,
      diff: { dataset: data.dataset, format: data.format, days: data.days, weeks: data.weeks, row_count: rows.length },
    });

    const body = data.format === "csv" ? rowsToCsv(rows) : rowsToJson(rows);
    return {
      filename: `${filenameStem}.${data.format}`,
      mimeType: data.format === "csv" ? "text/csv" : "application/json",
      body,
    };
  });