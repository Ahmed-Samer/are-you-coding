import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAuditLog } from "@/lib/audit.server";
import { enqueueWebhookEvent } from "@/lib/webhooks.server";
import { assertSameOrigin } from "@/lib/rate-limit.server";

const sb = supabaseAdmin as any;

// ---------- internal helpers ----------

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

type AdjustmentKind =
  | "refund"
  | "credit_grant"
  | "credit_consumed"
  | "comp_extension"
  | "plan_change"
  | "manual_extension";

/**
 * billing_adjustments.subscription_id now stores the *account* subscription id
 * (no more per-tenant subscription rows). `tenant_id` is null in the new flow
 * because tenant credits are no longer the unit of value — account-level
 * subscriptions are.
 */
async function insertAdjustment(input: {
  tenantId?: string | null;
  accountSubscriptionId?: string | null;
  kind: AdjustmentKind;
  amountUsd?: number | null;
  periodDeltaDays?: number | null;
  fromPlanId?: string | null;
  toPlanId?: string | null;
  reason: string;
  externalReference?: string | null;
  actorId: string;
}) {
  const { data, error } = await sb
    .from("billing_adjustments")
    .insert({
      tenant_id: input.tenantId ?? null,
      subscription_id: input.accountSubscriptionId ?? null,
      kind: input.kind,
      amount_usd: input.amountUsd ?? null,
      period_delta_days: input.periodDeltaDays ?? null,
      from_plan_id: input.fromPlanId ?? null,
      to_plan_id: input.toPlanId ?? null,
      reason: input.reason,
      external_reference: input.externalReference ?? null,
      actor_id: input.actorId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function fetchAccountSubscription(subscriptionId: string) {
  const { data, error } = await sb
    .from("account_subscriptions")
    .select(
      "id, user_id, plan_id, status, period_start, period_end, plans(id, name, interval, price_usd, is_active, max_stores)",
    )
    .eq("id", subscriptionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Account subscription not found");
  return data;
}

function addDaysISO(base: Date | string | null, days: number): string {
  const start = base ? new Date(base) : new Date();
  const safeStart = isNaN(start.getTime()) ? new Date() : start;
  // If period already expired, extend from now (don't add to a past date).
  const anchor = safeStart.getTime() < Date.now() ? new Date() : safeStart;
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString();
}

const reasonSchema = z.string().trim().min(10, "Reason must be at least 10 characters").max(1000);

// =====================================================================
// 1. extendSubscription
// =====================================================================

export const extendSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        subscriptionId: z.string().uuid(),
        days: z.number().int().min(1).max(365),
        reason: reasonSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sub = await fetchAccountSubscription(data.subscriptionId);
    const newEnd = addDaysISO(sub.period_end, data.days);
    const { error } = await sb
      .from("account_subscriptions")
      .update({ period_end: newEnd, status: "active" })
      .eq("id", data.subscriptionId);
    if (error) throw new Error(error.message);
    const adjustmentId = await insertAdjustment({
      accountSubscriptionId: sub.id,
      kind: "manual_extension",
      periodDeltaDays: data.days,
      reason: data.reason,
      actorId: context.userId,
    });
    await writeAuditLog({
      actorId: context.userId,
      action: "billing.extend",
      targetTable: "account_subscriptions",
      targetId: sub.id,
      diff: { days: data.days, from: sub.period_end, to: newEnd, adjustmentId },
    });
    return { ok: true, newPeriodEnd: newEnd, adjustmentId };
  });

// =====================================================================
// 2. grantComplimentaryPeriod  (same mechanics, different kind)
// =====================================================================

export const grantComplimentaryPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        subscriptionId: z.string().uuid(),
        days: z.number().int().min(1).max(365),
        reason: reasonSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sub = await fetchAccountSubscription(data.subscriptionId);
    const newEnd = addDaysISO(sub.period_end, data.days);
    const { error } = await sb
      .from("account_subscriptions")
      .update({ period_end: newEnd, status: "active" })
      .eq("id", data.subscriptionId);
    if (error) throw new Error(error.message);
    const adjustmentId = await insertAdjustment({
      accountSubscriptionId: sub.id,
      kind: "comp_extension",
      periodDeltaDays: data.days,
      reason: data.reason,
      actorId: context.userId,
    });
    await writeAuditLog({
      actorId: context.userId,
      action: "billing.comp",
      targetTable: "account_subscriptions",
      targetId: sub.id,
      diff: { days: data.days, from: sub.period_end, to: newEnd, adjustmentId },
    });
    return { ok: true, newPeriodEnd: newEnd, adjustmentId };
  });

// =====================================================================
// 3. changePlan
// =====================================================================

export const changePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        subscriptionId: z.string().uuid(),
        newPlanId: z.string().uuid(),
        prorate: z.boolean().default(false),
        reason: reasonSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const sub = await fetchAccountSubscription(data.subscriptionId);
    if (sub.plan_id === data.newPlanId) {
      throw new Error("Subscription is already on that plan.");
    }
    const { data: newPlan, error: pErr } = await sb
      .from("plans")
      .select("id, name, interval, price_usd, is_active, max_stores")
      .eq("id", data.newPlanId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!newPlan || !newPlan.is_active) throw new Error("Target plan not active.");

    // DOWNGRADE GUARD: check if user has too many stores for the new plan
    const newMaxStores = Number(newPlan.max_stores ?? 0);
    const { count: tenantCount, error: countErr } = await supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", sub.user_id);
    if (countErr) throw new Error(countErr.message);
    const currentCount = tenantCount ?? 0;
    if (currentCount > newMaxStores) {
      throw new Error(
        `Cannot downgrade: user has ${currentCount} stores but new plan allows ${newMaxStores}. They must delete stores first.`,
      );
    }

    const update: Record<string, unknown> = { plan_id: data.newPlanId };

    if (data.prorate && sub.period_start && sub.period_end) {
      const start = new Date(sub.period_start).getTime();
      const end = new Date(sub.period_end).getTime();
      const now = Date.now();
      const oldPrice = Number(sub.plans?.price_usd ?? 0);
      const newPrice = Number(newPlan.price_usd ?? 0);
      if (end > start && newPrice > 0) {
        const remainingMs = Math.max(0, end - now);
        const remainingValue = (remainingMs / (end - start)) * oldPrice;
        const remainingMsAtNewRate = (remainingValue / newPrice) * (end - start);
        const newEnd = new Date(now + remainingMsAtNewRate).toISOString();
        update.period_end = newEnd;
      }
    }

    const { error } = await sb
      .from("account_subscriptions")
      .update(update)
      .eq("id", sub.id);
    if (error) throw new Error(error.message);

    const adjustmentId = await insertAdjustment({
      accountSubscriptionId: sub.id,
      kind: "plan_change",
      fromPlanId: sub.plan_id,
      toPlanId: data.newPlanId,
      reason: data.reason,
      actorId: context.userId,
    });
    await writeAuditLog({
      actorId: context.userId,
      action: "billing.plan_change",
      targetTable: "account_subscriptions",
      targetId: sub.id,
      diff: {
        from_plan_id: sub.plan_id,
        to_plan_id: data.newPlanId,
        prorate: data.prorate,
        new_period_end: update.period_end ?? sub.period_end,
        adjustmentId,
      },
    });
    return { ok: true, adjustmentId, newPeriodEnd: update.period_end ?? sub.period_end };
  });

// =====================================================================
// 3b. upgradeAccountPlan (merchant self-service upgrade)
// =====================================================================

export const upgradeAccountPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        newPlanSlug: z.string().min(1).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    assertSameOrigin();

    // Fetch user's active account_subscription with current plan
    const { data: activeSub, error: asErr } = await sb
      .from("account_subscriptions")
      .select("id, user_id, plan_id, status, plans!inner(id, name, slug, max_stores, has_custom_domain)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (asErr) throw new Error(asErr.message);
    if (!activeSub) throw new Error("No active subscription found.");

    const currentPlan = activeSub.plans;

    // Fetch new plan by slug
    const { data: newPlan, error: npErr } = await sb
      .from("plans")
      .select("id, name, slug, price_usd, interval, is_active, max_stores, has_custom_domain")
      .eq("slug", data.newPlanSlug)
      .maybeSingle();
    if (npErr) throw new Error(npErr.message);
    if (!newPlan) throw new Error("Plan not found.");
    if (!newPlan.is_active) throw new Error("Target plan is not active.");

    // Validate it's an UPGRADE (higher tier)
    const currentMaxStores = Number(currentPlan?.max_stores ?? 0);
    const newMaxStores = Number(newPlan.max_stores ?? 0);
    if (newMaxStores <= currentMaxStores) {
      throw new Error("New plan must be a higher tier than your current plan.");
    }

    // Create new pending account_subscription
    const { data: newSub, error: insErr } = await sb
      .from("account_subscriptions")
      .insert({
        user_id: userId,
        plan_id: newPlan.id,
        status: "pending_payment",
        currency: "USD",
        price_usd_snapshot: newPlan.price_usd,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    // Insert billing adjustment for audit trailing
    const adjustmentId = await insertAdjustment({
      accountSubscriptionId: newSub.id,
      kind: "plan_change",
      fromPlanId: activeSub.plan_id,
      toPlanId: newPlan.id,
      reason: `Self-service upgrade request from ${currentPlan?.name ?? "unknown"} to ${newPlan.name}`,
      actorId: userId,
    });

    // Write audit log
    await writeAuditLog({
      actorId: userId,
      action: "billing.self_upgrade_requested",
      targetTable: "account_subscriptions",
      targetId: newSub.id,
      diff: {
        from_plan_id: activeSub.plan_id,
        to_plan_id: newPlan.id,
        from_plan_slug: currentPlan?.slug,
        to_plan_slug: newPlan.slug,
        adjustmentId,
      },
    });

    return {
      ok: true,
      subscriptionId: newSub.id,
    };
  });

// =====================================================================
// 4. issueRefund
// =====================================================================

export const issueRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        proofId: z.string().uuid(),
        amountUsd: z.number().positive().max(100000),
        externalReference: z.string().trim().min(1).max(120),
        reason: reasonSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // New flow: proofs reference account_subscription_id, not a per-tenant
    // subscription_id. We still select the legacy column for backwards-compat
    // (some old rows may have a non-null subscription_id), but the refund is
    // recorded against the account subscription.
    const { data: proof, error: pErr } = await sb
      .from("payment_proofs")
      .select("id, tenant_id, account_subscription_id, amount_usd, status, refunded_at, account_subscriptions(user_id)")
      .eq("id", data.proofId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proof) throw new Error("Proof not found");
    if (proof.status !== "approved") throw new Error("Only approved proofs can be refunded.");
    if (proof.refunded_at) throw new Error("Proof already refunded.");
    if (data.amountUsd > Number(proof.amount_usd ?? 0) + 0.001) {
      throw new Error("Refund amount exceeds original payment.");
    }

    const accountSubId = proof.account_subscription_id ?? null;
    if (!accountSubId) {
      // Proof has no account_subscription_id (shouldn't happen for new proofs
      // but can happen for old backfill rows). Refuse to refund rather than
      // writing a dangling billing_adjustments row.
      throw new Error("This proof is not linked to an account subscription and cannot be refunded.");
    }

    const adjustmentId = await insertAdjustment({
      tenantId: proof.tenant_id ?? null,
      accountSubscriptionId: accountSubId,
      kind: "refund",
      amountUsd: -Math.abs(data.amountUsd),
      reason: data.reason,
      externalReference: data.externalReference,
      actorId: context.userId,
    });

    const { error: uErr } = await sb
      .from("payment_proofs")
      .update({ refunded_at: new Date().toISOString() })
      .eq("id", data.proofId);
    if (uErr) throw new Error(uErr.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "billing.refund",
      targetTable: "payment_proofs",
      targetId: data.proofId,
      diff: {
        amount_usd: data.amountUsd,
        external_reference: data.externalReference,
        adjustmentId,
        account_subscription_id: accountSubId,
      },
    });

    // Fire tenant-scoped webhook (best-effort): resolve the owner's first
    // tenant. In the new flow the owner may not have a tenant yet — that's
    // fine, we skip.
    const ownerUserId = proof.account_subscriptions?.user_id ?? null;
    if (ownerUserId) {
      const { data: tenantRow } = await sb
        .from("tenants")
        .select("id")
        .eq("owner_id", ownerUserId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (tenantRow?.id) {
        void enqueueWebhookEvent({
          tenantId: tenantRow.id,
          eventType: "refund.issued",
          payload: {
            proof_id: data.proofId,
            tenant_id: tenantRow.id,
            account_subscription_id: accountSubId,
            amount_usd: data.amountUsd,
            external_reference: data.externalReference,
            reason: data.reason,
            adjustment_id: adjustmentId,
            issued_at: new Date().toISOString(),
          },
        }).catch((e: unknown) => console.error("[issueRefund] webhook enqueue failed", e));
      }
    }

    return { ok: true, adjustmentId };
  });

// =====================================================================
// 5. grantCredit  (account-level credit; tenant_id is optional legacy)
// =====================================================================
//
// Tenant-scoped credits are still meaningful in some hybrid flows (existing
// tenants may carry a balance from the old model), so this fn keeps accepting
// an optional tenantId. In the new flow, tenantId should typically be null —
// pass an accountSubscriptionId to record the credit against the account
// (preferred).

export const grantCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      tenantId: z.string().uuid().optional(),
      accountSubscriptionId: z.string().uuid().optional(),
      amountUsd: z.number().positive().max(100000),
      reason: reasonSchema,
    })
      .refine(
        (v) => Boolean(v.tenantId) || Boolean(v.accountSubscriptionId),
        "Either tenantId or accountSubscriptionId is required.",
      )
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const adjustmentId = await insertAdjustment({
      tenantId: data.tenantId ?? null,
      accountSubscriptionId: data.accountSubscriptionId ?? null,
      kind: "credit_grant",
      amountUsd: Math.abs(data.amountUsd),
      reason: data.reason,
      actorId: context.userId,
    });
    await writeAuditLog({
      actorId: context.userId,
      action: "billing.credit_grant",
      targetTable: "billing_adjustments",
      targetId: adjustmentId,
      diff: {
        amount_usd: data.amountUsd,
        tenant_id: data.tenantId ?? null,
        account_subscription_id: data.accountSubscriptionId ?? null,
      },
    });
    return { ok: true, adjustmentId };
  });

// =====================================================================
// 6. listBillingAdjustments
// =====================================================================

export const listBillingAdjustments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        tenantId: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
        accountSubscriptionId: z.string().uuid().optional(),
        page: z.number().int().min(1).max(1000).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const from = (data.page - 1) * data.pageSize;

    let query = sb
      .from("billing_adjustments")
      .select(
        "id, kind, amount_usd, period_delta_days, from_plan_id, to_plan_id, reason, external_reference, actor_id, created_at, subscription_id, tenant_id",
        { count: "exact" },
      );

    if (data.tenantId) {
      query = query.eq("tenant_id", data.tenantId);
    }
    if (data.accountSubscriptionId) {
      // subscription_id on billing_adjustments is now the account subscription id
      query = query.eq("subscription_id", data.accountSubscriptionId);
    }
    if (data.userId) {
      // Resolve the user's account_subscription IDs and filter by them.
      const { data: userSubs } = await sb
        .from("account_subscriptions")
        .select("id")
        .eq("user_id", data.userId);
      const subIds = (userSubs ?? []).map((s: any) => s.id);
      if (subIds.length > 0) {
        query = query.in("subscription_id", subIds);
      } else {
        // No subscriptions for this user, return empty
        return { adjustments: [], total: 0, creditBalanceUsd: 0 };
      }
    }

    const { data: rows, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);

    let creditBalanceUsd = 0;
    if (data.tenantId) {
      // tenant_credits view still works for legacy balances. The new model
      // uses account-level adjustments, which are summed below.
      const { data: balanceRow } = await sb
        .from("tenant_credits")
        .select("balance_usd")
        .eq("tenant_id", data.tenantId)
        .maybeSingle();
      creditBalanceUsd = Number(balanceRow?.balance_usd ?? 0);
    } else if (data.accountSubscriptionId || data.userId) {
      // Sum net USD of credit_grant + credit_consumed + refund adjustments
      // for the requested scope. Manual extensions, comps, and plan changes
      // are excluded since they don't change the cash balance.
      const subFilter = data.accountSubscriptionId
        ? `subscription_id.eq.${data.accountSubscriptionId}`
        : (() => {
            // We already determined the user's sub IDs above; reuse `rows` is
            // unsafe (paginated), so re-query without range.
            return "";
          })();
      if (subFilter) {
        const { data: allBalance } = await sb
          .from("billing_adjustments")
          .select("amount_usd, kind")
          .eq("subscription_id", data.accountSubscriptionId)
          .in("kind", ["credit_grant", "credit_consumed", "refund"]);
        for (const r of (allBalance ?? []) as any[]) {
          creditBalanceUsd += Number(r.amount_usd ?? 0);
        }
      }
    }

    return {
      adjustments: rows ?? [],
      total: count ?? 0,
      creditBalanceUsd,
    };
  });

// =====================================================================
// 7. getDunningQueue
// =====================================================================

export const getDunningQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ window: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(7) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const now = new Date();
    const horizon = new Date(now);
    horizon.setUTCDate(horizon.getUTCDate() + data.window);

    // Query account_subscriptions (not subscriptions)
    const { data: subs, error } = await sb
      .from("account_subscriptions")
      .select(
        "id, status, period_end, user_id, plans(name, slug, interval, price_usd)",
      )
      .eq("status", "active")
      .gte("period_end", now.toISOString())
      .lte("period_end", horizon.toISOString())
      .order("period_end", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);

    const rows = (subs ?? []) as any[];
    const userIds = Array.from(
      new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]),
    );
    const emailMap = new Map<string, string>();
    for (const id of userIds) {
      const { data: u } = await sb.auth.admin.getUserById(id);
      if (u?.user?.email) emailMap.set(id, u.user.email);
    }

    const enriched = rows.map((r) => {
      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(r.period_end).getTime() - now.getTime()) / 86_400_000),
      );
      return {
        subscriptionId: r.id,
        userId: r.user_id,
        ownerEmail: r.user_id ? emailMap.get(r.user_id) ?? null : null,
        plan: r.plans?.name ?? null,
        interval: r.plans?.interval ?? null,
        priceUsd: Number(r.plans?.price_usd ?? 0),
        periodEnd: r.period_end,
        daysLeft,
      };
    });

    return { rows: enriched, window: data.window };
  });

// =====================================================================
// 8. generateInvoicePdf (idempotent)
// =====================================================================

export const generateInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ proofId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // 1. Reuse existing invoice if any.
    const { data: existing, error: exErr } = await sb
      .from("invoices")
      .select("id, invoice_number, storage_path, tenant_id")
      .eq("proof_id", data.proofId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);

    if (existing) {
      const signed = await sb.storage
        .from("invoices")
        .createSignedUrl(existing.storage_path, 60 * 60);
      if (signed.error) throw new Error(signed.error.message);
      return {
        invoiceNumber: existing.invoice_number,
        signedUrl: signed.data.signedUrl,
        cached: true,
      };
    }

    // 2. Load proof context — use account_subscriptions instead of subscriptions.
    const { data: proof, error: pErr } = await sb
      .from("payment_proofs")
      .select(
        "id, status, tenant_id, account_subscription_id, amount_usd, amount_egp, fx_rate, reference_number, created_at, payment_methods(label, kind)",
      )
      .eq("id", data.proofId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proof) throw new Error("Proof not found");
    if (proof.status !== "approved") throw new Error("Only approved proofs can be invoiced.");

    // Get tenant info if available (from payment_proofs.tenant_id). In the
    // new flow tenant_id is null and we render an "Account-Level" label.
    let tenantName = "Account-Level";
    let tenantSlug = "";
    if (proof.tenant_id) {
      const { data: tenantRow } = await sb
        .from("tenants")
        .select("name, slug")
        .eq("id", proof.tenant_id)
        .maybeSingle();
      if (tenantRow) {
        tenantName = tenantRow.name ?? "Tenant";
        tenantSlug = tenantRow.slug ?? "";
      }
    }

    // Get plan and period info from account_subscriptions
    let planName = "Subscription";
    let planInterval = "monthly";
    let periodStart: string | null = null;
    let periodEnd: string | null = null;

    const accountSubId = proof.account_subscription_id ?? null;
    if (accountSubId) {
      const { data: accSub } = await sb
        .from("account_subscriptions")
        .select("period_start, period_end, plans(name, interval)")
        .eq("id", accountSubId)
        .maybeSingle();
      if (accSub) {
        planName = accSub.plans?.name ?? "Subscription";
        planInterval = accSub.plans?.interval ?? "monthly";
        periodStart = accSub.period_start ?? null;
        periodEnd = accSub.period_end ?? null;
      }
    }

    // 3. Allocate invoice number via SECURITY DEFINER RPC.
    const year = new Date(proof.created_at).getUTCFullYear();
    const { data: seqRow, error: seqErr } = await sb.rpc("next_invoice_number");
    if (seqErr) throw new Error(seqErr.message);
    const seqVal = Number(seqRow);
    const invoiceNumber = `INV-${year}-${String(seqVal).padStart(6, "0")}`;

    // 4. Render PDF (dynamic import keeps the heavy renderer out of cold paths
    //    that don't need it).
    const [{ renderToBuffer }, { InvoiceDocument }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("@/lib/invoice-template.server"),
    ]);

    const pdfBuffer = await renderToBuffer(
      InvoiceDocument({
        data: {
          invoiceNumber,
          issuedAt: new Date().toISOString(),
          tenant: {
            name: tenantName,
            slug: tenantSlug,
          },
          plan: {
            name: planName,
            interval: planInterval,
          },
          paymentMethod: proof.payment_methods
            ? { label: proof.payment_methods.label, kind: proof.payment_methods.kind }
            : null,
          referenceNumber: proof.reference_number ?? "—",
          amountUsd: Number(proof.amount_usd ?? 0),
          amountEgp: proof.amount_egp != null ? Number(proof.amount_egp) : null,
          fxRate: proof.fx_rate != null ? Number(proof.fx_rate) : null,
          periodStart,
          periodEnd,
        },
      }) as any,
    );

    // 5. Upload to private storage bucket.
    const storagePath = proof.tenant_id
      ? `tenants/${proof.tenant_id}/${invoiceNumber}.pdf`
      : `accounts/${accountSubId ?? "unknown"}/${invoiceNumber}.pdf`;
    const upload = await sb.storage
      .from("invoices")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upload.error) throw new Error(upload.error.message);

    // 6. Persist invoice row.
    const { error: insErr } = await sb.from("invoices").insert({
      proof_id: proof.id,
      tenant_id: proof.tenant_id ?? null,
      subscription_id: accountSubId,
      invoice_number: invoiceNumber,
      storage_path: storagePath,
      total_usd: Number(proof.amount_usd ?? 0),
    });
    if (insErr) throw new Error(insErr.message);

    const signed = await sb.storage
      .from("invoices")
      .createSignedUrl(storagePath, 60 * 60);
    if (signed.error) throw new Error(signed.error.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "billing.invoice_generated",
      targetTable: "invoices",
      targetId: proof.id,
      diff: { invoice_number: invoiceNumber, storage_path: storagePath, account_subscription_id: accountSubId },
    });

    return { invoiceNumber, signedUrl: signed.data.signedUrl, cached: false };
  });
