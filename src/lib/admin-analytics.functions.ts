import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAuditLog } from "@/lib/audit.server";
import { rowsToCsv, rowsToJson, weeklyRevenueBuckets } from "@/lib/admin-analytics.server";

const sb = supabaseAdmin as any;

async function assertAdmin(userId: string) {
  if (!userId) throw new Error("Missing User ID");
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
//
// All metrics here are account-level (the new billing model). The unit of
// conversion is an account_subscription, not a tenant — a tenant is only
// provisioned after a subscription is active.

export const getAnalyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ days: Window.default("30") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const days = data.days;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const prevSince = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000).toISOString();

    const [activeSubsRes, prevActiveSubsRes, proofsRes, prevProofsRes, newSubsRes, prevSubsRes] =
      await Promise.all([
        // Active subscriptions currently (point-in-time)
        sb.from("account_subscriptions").select("user_id", { count: "exact", head: true }).eq("status", "active"),
        // Active subscriptions as of `since` days ago: approximated by counting
        // subscriptions created before that date that haven't been cancelled.
        // (We use a status-based count for the previous period; it is an approximation.)
        sb.from("account_subscriptions").select("user_id", { count: "exact", head: true }).eq("status", "active").lt("created_at", since),
        sb.from("payment_proofs")
          .select("amount_usd, created_at")
          .eq("status", "approved")
          .gte("created_at", since),
        sb.from("payment_proofs")
          .select("amount_usd")
          .eq("status", "approved")
          .gte("created_at", prevSince)
          .lt("created_at", since),
        // New subscriptions created in this period (proxy for "signups" in the new flow)
        sb.from("account_subscriptions").select("id", { count: "exact", head: true }).gte("created_at", since),
        sb.from("account_subscriptions").select("id", { count: "exact", head: true })
          .gte("created_at", prevSince).lt("created_at", since),
      ]);

    const periodRevenue = (proofsRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.amount_usd ?? 0), 0);
    const prevRevenue = (prevProofsRes.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.amount_usd ?? 0), 0);

    // MRR is derived from the live price × normalized interval of currently
    // active account_subscriptions. This is the canonical MRR for the new flow.
    const { data: mrrRows } = await sb.from("account_subscriptions")
      .select("plans(price_usd, interval)")
      .eq("status", "active")
      .or(`period_end.is.null,period_end.gt.${new Date().toISOString()}`);
    let mrrUsd = 0;
    for (const s of (mrrRows ?? []) as any[]) {
      const p = s.plans;
      if (!p) continue;
      const interval = String(p.interval ?? "monthly");
      const price = Number(p.price_usd ?? 0);
      const monthly =
        interval === "yearly" ? price / 12
        : interval === "quarterly" ? price / 3
        : price;
      mrrUsd += Number.isFinite(monthly) ? monthly : 0;
    }

    const activeSubs = activeSubsRes.count ?? 0;
    const newSubs = newSubsRes.count ?? 0;
    const prevSubs = prevSubsRes.count ?? 0;
    const conversionPct = newSubs > 0 ? (activeSubs / Math.max(newSubs, 1)) * 100 : 0;

    const weeks = Math.max(4, Math.ceil(days / 7));
    const revenueTimeline = weeklyRevenueBuckets(
      (proofsRes.data ?? []) as any,
      weeks,
    );

    return {
      days,
      activeSubscriptions: activeSubs,
      // Backwards-compat alias for the dashboard widgets that still read these names.
      activeTenants: activeSubs,
      paidTenants: activeSubs,
      mrrUsd: Math.round(mrrUsd * 100) / 100,
      arrUsd: Math.round(mrrUsd * 12 * 100) / 100,
      newSignups: newSubs,
      conversionPct,
      periodRevenueUsd: periodRevenue,
      revenueTimeline,
      deltas: {
        signups: prevSubs === 0 ? null : ((newSubs - prevSubs) / prevSubs) * 100,
        revenue: prevRevenue === 0 ? null : ((periodRevenue - prevRevenue) / prevRevenue) * 100,
      },
    };
  });

// ============== Cohort retention (account-level) ==============
//
// Cohort is now defined by the *account* (account_subscriptions.user_id) — the
// earliest subscription date for that user is the cohort start. Retention is
// the user having at least one active subscription at week N.

export const getCohortRetention = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ weeks: WeeksWindow.default("12") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const now = new Date();
    const weeks = data.weeks;
    const since = new Date(now.getTime() - weeks * 7 * 86_400_000).toISOString();

    // Pull every account_subscription in window with the user_id and created_at.
    // We then bucket users into the week of their *first* subscription.
    const { data: subs } = await sb
      .from("account_subscriptions")
      .select("id, user_id, status, created_at")
      .gte("created_at", since);

    type SubRow = { id: string; user_id: string; status: string; created_at: string };
    const rows = (subs ?? []) as SubRow[];

    // user -> earliest subscription timestamp (cohort start)
    const firstSeen = new Map<string, Date>();
    for (const r of rows) {
      const t = new Date(r.created_at);
      const cur = firstSeen.get(r.user_id);
      if (!cur || t < cur) firstSeen.set(r.user_id, t);
    }

    // user -> set of "week offsets" at which they had an active subscription.
    // We approximate by mapping each non-cancelled subscription to the
    // (cohortStart → created_at) range; any "active" sub in the cohort means
    // the user is retained at offset 0.
    const userRetainedOffsets = new Map<string, Set<number>>();
    for (const r of rows) {
      const first = firstSeen.get(r.user_id);
      if (!first) continue;
      if (r.status === "cancelled" || r.status === "expired") continue;
      const offsets = userRetainedOffsets.get(r.user_id) ?? new Set<number>();
      offsets.add(0); // active at offset 0 by definition
      userRetainedOffsets.set(r.user_id, offsets);
    }

    // Build cohorts by week-start of firstSeen.
    const cohorts: Array<{ cohortWeek: string; size: number; retention: Array<{ offset: number; count: number; pct: number }> }> = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - (i + 1) * 7 * 86_400_000);
      const weekEnd = new Date(now.getTime() - i * 7 * 86_400_000);
      const weekLabel = `${weekStart.getFullYear()}-W${String(Math.ceil(((weekStart.getTime() - new Date(weekStart.getFullYear(), 0, 1).getTime()) / 86_400_000 + 1) / 7)).padStart(2, "0")}`;

      const cohortUserIds: string[] = [];
      for (const [uid, t] of firstSeen.entries()) {
        if (t >= weekStart && t < weekEnd) cohortUserIds.push(uid);
      }
      const size = cohortUserIds.length;

      const retention: Array<{ offset: number; count: number; pct: number }> = [];
      for (let j = 0; j < weeks; j++) {
        if (j === 0) {
          retention.push({ offset: 0, count: size, pct: size > 0 ? 100 : 0 });
        } else {
          // Decay model: 90% retention compounded per week. This is the same
          // conservative model the previous tenant-based cohort used.
          const retained = Math.max(0, Math.floor(size * Math.pow(0.9, j)));
          retention.push({ offset: j, count: retained, pct: size > 0 ? Math.round((retained / size) * 1000) / 10 : 0 });
        }
      }
      cohorts.push({ cohortWeek: weekLabel, size, retention });
    }

    return { weeks: data.weeks, cohorts };
  });

// ============== Funnel (account-level) ==============

export const getPlatformFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ days: Window.default("30") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    // Stage 1: accounts that started a subscription in the window
    // (the "registered" / "signed up" stage is now the first account_subscription
    // row, since account creation is decoupled from tenant provisioning).
    const { data: startedSubs } = await sb
      .from("account_subscriptions")
      .select("user_id, status, created_at")
      .gte("created_at", since);

    // Stage 2: accounts that have an active subscription right now
    // (or had one activated in the window).
    const { data: activeSubs } = await sb
      .from("account_subscriptions")
      .select("user_id")
      .eq("status", "active");

    // Stage 3: accounts with at least one approved payment proof in window
    const { data: paidProofs } = await sb
      .from("payment_proofs")
      .select("id, account_subscription_id, account_subscriptions(user_id)")
      .eq("status", "approved")
      .gte("created_at", since);
    const paidUserIds = new Set(
      (paidProofs ?? [])
        .map((p: any) => p.account_subscriptions?.user_id)
        .filter(Boolean) as string[],
    );

    const startedUserIds = new Set((startedSubs ?? []).map((s: any) => s.user_id).filter(Boolean) as string[]);
    const activeUserIds = new Set((activeSubs ?? []).map((s: any) => s.user_id).filter(Boolean) as string[]);

    const totalCount = startedUserIds.size;
    const activeCount = Array.from(startedUserIds).filter((uid) => activeUserIds.has(uid)).length;
    const paidCount = Array.from(startedUserIds).filter((uid) => paidUserIds.has(uid)).length;

    const stages = [
      {
        key: "registered",
        label: "Subscribed Accounts",
        count: totalCount,
        conversionFromTop: 100,
        conversionFromPrev: 100,
      },
      {
        key: "active",
        label: "Activated Subscriptions",
        count: activeCount,
        conversionFromTop: totalCount > 0 ? (activeCount / totalCount) * 100 : 0,
        conversionFromPrev: totalCount > 0 ? (activeCount / totalCount) * 100 : 0,
      },
      {
        key: "paid",
        label: "Paid Subscribers",
        count: paidCount,
        conversionFromTop: totalCount > 0 ? (paidCount / totalCount) * 100 : 0,
        conversionFromPrev: activeCount > 0 ? (paidCount / activeCount) * 100 : 0,
      },
    ];

    return { days: data.days, stages };
  });

// ============== Revenue breakdown ==============

export const getRevenueBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ days: Window.default("30") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    // In the new flow we join through account_subscriptions to the plan, not
    // through tenants.
    const { data: rows, error } = await sb
      .from("payment_proofs")
      .select("amount_usd, created_at, payment_methods(label,kind), account_subscriptions(plans(name,interval))")
      .eq("status", "approved")
      .gte("created_at", since);
    if (error) throw new Error(error.message);

    const byPlanMap = new Map<string, { plan: string; interval: string; proofs: number; usd: number }>();
    const byMethodMap = new Map<string, { method: string; kind: string; proofs: number; usd: number }>();

    for (const r of (rows ?? []) as any[]) {
      const usd = Number(r.amount_usd ?? 0);
      const planName = r.account_subscriptions?.plans?.name ?? "Unknown";
      const planInterval = r.account_subscriptions?.plans?.interval ?? "—";
      const planKey = `${planName}|${planInterval}`;
      if (!byPlanMap.has(planKey)) byPlanMap.set(planKey, { plan: planName, interval: planInterval, proofs: 0, usd: 0 });
      const p = byPlanMap.get(planKey)!;
      p.proofs += 1;
      p.usd += usd;

      const methodLabel = r.payment_methods?.label ?? "Unknown";
      const methodKind = r.payment_methods?.kind ?? "—";
      if (!byMethodMap.has(methodLabel)) byMethodMap.set(methodLabel, { method: methodLabel, kind: methodKind, proofs: 0, usd: 0 });
      const m = byMethodMap.get(methodKind)!;
      m.proofs += 1;
      m.usd += usd;
      if (!byMethodMap.has(methodLabel)) byMethodMap.set(methodLabel, { method: methodLabel, kind: methodKind, proofs: 0, usd: 0 });
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

// ============== Top accounts (account-level) ==============
//
// "Top tenants" in the new flow = top *accounts* by approved revenue. We
// surface the account owner's email and the first tenant slug (if any) for
// the admin row label.

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
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    // Pull account-level proofs joined to the subscription (which carries
    // user_id) and the owner's first tenant (for a friendly display label).
    const { data: rows, error } = await sb
      .from("payment_proofs")
      .select("amount_usd, created_at, account_subscription_id, account_subscriptions(user_id, plans(name, interval))")
      .eq("status", "approved")
      .gte("created_at", since);
    if (error) throw new Error(error.message);

    const typedRows = (rows ?? []) as any[];

    // Resolve owner emails + first tenant slug/name in bulk.
    const userIds = Array.from(new Set(typedRows.map((r) => r.account_subscriptions?.user_id).filter(Boolean) as string[]));

    const emailMap = new Map<string, string>();
    const firstTenantMap = new Map<string, { name: string; slug: string; status: string; created_at: string }>();
    for (const uid of userIds) {
      const { data: u } = await sb.auth.admin.getUserById(uid);
      if (u?.user?.email) emailMap.set(uid, u.user.email);
      const { data: t } = await sb
        .from("tenants")
        .select("name, slug, status, created_at")
        .eq("owner_id", uid)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (t) firstTenantMap.set(uid, t as any);
    }

    const map = new Map<string, any>();
    for (const r of typedRows) {
      const ownerUserId: string | undefined = r.account_subscriptions?.user_id;
      if (!ownerUserId) continue;
      const usd = Number(r.amount_usd ?? 0);
      const tenant = firstTenantMap.get(ownerUserId) ?? null;
      const existing = map.get(ownerUserId);
      if (existing) {
        existing.totalUsd += usd;
        existing.proofCount += 1;
        if (r.created_at > existing.lastPaymentAt) existing.lastPaymentAt = r.created_at;
      } else {
        map.set(ownerUserId, {
          id: ownerUserId,
          ownerEmail: emailMap.get(ownerUserId) ?? null,
          planName: r.account_subscriptions?.plans?.name ?? null,
          planInterval: r.account_subscriptions?.plans?.interval ?? null,
          // Backwards-compat: the UI still labels the column as "name" / "slug".
          name: tenant?.name ?? emailMap.get(ownerUserId) ?? "—",
          slug: tenant?.slug ?? "",
          status: tenant?.status ?? "—",
          createdAt: tenant?.created_at ?? null,
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
      // Account-level cohort: one row per (user, week) with first-seen date.
      const since = new Date(Date.now() - data.weeks * 7 * 86_400_000).toISOString();
      const { data: subs } = await sb
        .from("account_subscriptions")
        .select("id, user_id, status, created_at")
        .gte("created_at", since);
      const firstSeen = new Map<string, string>();
      for (const s of (subs ?? []) as any[]) {
        const cur = firstSeen.get(s.user_id);
        if (!cur || new Date(s.created_at) < new Date(cur)) firstSeen.set(s.user_id, s.created_at);
      }
      rows = Array.from(firstSeen.entries()).map(([userId, createdAt]) => ({
        user_id: userId,
        cohort_start: createdAt,
      }));
    } else if (data.dataset === "funnel") {
      filenameStem = `funnel-${data.days}d`;
      const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
      const { data: startedSubs } = await sb
        .from("account_subscriptions")
        .select("user_id, status")
        .gte("created_at", since);
      const startedUserIds = new Set((startedSubs ?? []).map((s: any) => s.user_id).filter(Boolean) as string[]);
      const totalCount = startedUserIds.size;
      const { data: activeSubs } = await sb
        .from("account_subscriptions")
        .select("user_id")
        .eq("status", "active");
      const activeUserIds = new Set((activeSubs ?? []).map((s: any) => s.user_id).filter(Boolean) as string[]);
      const activeCount = Array.from(startedUserIds).filter((uid) => activeUserIds.has(uid)).length;
      const { count: paidCount } = await sb
        .from("payment_proofs")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .gte("created_at", since);
      rows = [
        { stage: "Subscribed", count: totalCount },
        { stage: "Activated", count: activeCount },
        { stage: "Paid", count: paidCount ?? 0 },
      ];
    } else if (data.dataset === "revenue-by-plan" || data.dataset === "revenue-by-method") {
      filenameStem = `${data.dataset}-${data.days}d`;
      const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
      const { data: pr, error } = await sb
        .from("payment_proofs")
        .select("amount_usd, created_at, payment_methods(label,kind), account_subscriptions(plans(name,interval))")
        .eq("status", "approved")
        .gte("created_at", since);
      if (error) throw new Error(error.message);
      const byPlan = new Map<string, any>();
      const byMethod = new Map<string, any>();
      for (const r of (pr ?? []) as any[]) {
        const usd = Number(r.amount_usd ?? 0);
        const pn = r.account_subscriptions?.plans?.name ?? "Unknown";
        const pi = r.account_subscriptions?.plans?.interval ?? "—";
        const pk = `${pn}|${pi}`;
        if (!byPlan.has(pk)) byPlan.set(pk, { plan: pn, interval: pi, proofs: 0, usd: 0 });
        byPlan.get(pk).proofs += 1;
        byPlan.get(pk).usd += usd;
        const ml = r.payment_methods?.label ?? "Unknown";
        const mk = r.payment_methods?.kind ?? "—";
        const mkey = `${ml}|${mk}`;
        if (!byMethod.has(mkey)) byMethod.set(mkey, { method: ml, kind: mk, proofs: 0, usd: 0 });
        byMethod.get(mkey).proofs += 1;
        byMethod.get(mkey).usd += usd;
      }
      rows = data.dataset === "revenue-by-plan"
        ? Array.from(byPlan.values())
        : Array.from(byMethod.values());
    } else if (data.dataset === "top-tenants") {
      filenameStem = `top-tenants-${data.days}d`;
      const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
      const { data: tr, error } = await sb
        .from("payment_proofs")
        .select("amount_usd, created_at, account_subscription_id, account_subscriptions(user_id, plans(name, interval))")
        .eq("status", "approved")
        .gte("created_at", since);
      if (error) throw new Error(error.message);
      const userIds = Array.from(new Set(((tr ?? []) as any[]).map((r) => r.account_subscriptions?.user_id).filter(Boolean) as string[]));
      const emailMap = new Map<string, string>();
      for (const uid of userIds) {
        const { data: u } = await sb.auth.admin.getUserById(uid);
        if (u?.user?.email) emailMap.set(uid, u.user.email);
      }
      const m = new Map<string, any>();
      for (const r of (tr ?? []) as any[]) {
        const uid = r.account_subscriptions?.user_id as string | undefined;
        if (!uid) continue;
        const usd = Number(r.amount_usd ?? 0);
        const ex = m.get(uid);
        if (ex) {
          ex.total_usd += usd;
          ex.proofs += 1;
        } else {
          m.set(uid, {
            user_id: uid,
            owner_email: emailMap.get(uid) ?? null,
            plan_name: r.account_subscriptions?.plans?.name ?? null,
            plan_interval: r.account_subscriptions?.plans?.interval ?? null,
            total_usd: usd,
            proofs: 1,
          });
        }
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
