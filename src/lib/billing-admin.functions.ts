import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAuditLog } from "@/lib/audit.server";
import { enqueueWebhookEvent } from "@/lib/webhooks.server";

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

async function insertAdjustment(input: {
  tenantId: string;
  subscriptionId?: string | null;
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
      tenant_id: input.tenantId,
      subscription_id: input.subscriptionId ?? null,
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

async function fetchSubscription(subscriptionId: string) {
  const { data, error } = await sb
    .from("subscriptions")
    .select(
      "id, tenant_id, plan_id, status, period_start, period_end, plans(id, name, interval, price_usd, is_active)",
    )
    .eq("id", subscriptionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Subscription not found");
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
    const sub = await fetchSubscription(data.subscriptionId);
    const newEnd = addDaysISO(sub.period_end, data.days);
    const { error } = await sb
      .from("subscriptions")
      .update({ period_end: newEnd, status: "active" })
      .eq("id", data.subscriptionId);
    if (error) throw new Error(error.message);
    const adjustmentId = await insertAdjustment({
      tenantId: sub.tenant_id,
      subscriptionId: sub.id,
      kind: "manual_extension",
      periodDeltaDays: data.days,
      reason: data.reason,
      actorId: context.userId,
    });
    await writeAuditLog({
      actorId: context.userId,
      action: "billing.extend",
      targetTable: "subscriptions",
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
    const sub = await fetchSubscription(data.subscriptionId);
    const newEnd = addDaysISO(sub.period_end, data.days);
    const { error } = await sb
      .from("subscriptions")
      .update({ period_end: newEnd, status: "active" })
      .eq("id", data.subscriptionId);
    if (error) throw new Error(error.message);
    const adjustmentId = await insertAdjustment({
      tenantId: sub.tenant_id,
      subscriptionId: sub.id,
      kind: "comp_extension",
      periodDeltaDays: data.days,
      reason: data.reason,
      actorId: context.userId,
    });
    await writeAuditLog({
      actorId: context.userId,
      action: "billing.comp",
      targetTable: "subscriptions",
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
    const sub = await fetchSubscription(data.subscriptionId);
    if (sub.plan_id === data.newPlanId) {
      throw new Error("Subscription is already on that plan.");
    }
    const { data: newPlan, error: pErr } = await sb
      .from("plans")
      .select("id, name, interval, price_usd, is_active")
      .eq("id", data.newPlanId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!newPlan || !newPlan.is_active) throw new Error("Target plan not active.");

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
      .from("subscriptions")
      .update(update)
      .eq("id", sub.id);
    if (error) throw new Error(error.message);

    const adjustmentId = await insertAdjustment({
      tenantId: sub.tenant_id,
      subscriptionId: sub.id,
      kind: "plan_change",
      fromPlanId: sub.plan_id,
      toPlanId: data.newPlanId,
      reason: data.reason,
      actorId: context.userId,
    });
    await writeAuditLog({
      actorId: context.userId,
      action: "billing.plan_change",
      targetTable: "subscriptions",
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
    const { data: proof, error: pErr } = await sb
      .from("payment_proofs")
      .select("id, tenant_id, subscription_id, amount_usd, status, refunded_at")
      .eq("id", data.proofId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proof) throw new Error("Proof not found");
    if (proof.status !== "approved") throw new Error("Only approved proofs can be refunded.");
    if (proof.refunded_at) throw new Error("Proof already refunded.");
    if (data.amountUsd > Number(proof.amount_usd ?? 0) + 0.001) {
      throw new Error("Refund amount exceeds original payment.");
    }

    const adjustmentId = await insertAdjustment({
      tenantId: proof.tenant_id,
      subscriptionId: proof.subscription_id,
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
      },
    });

    void enqueueWebhookEvent({
      tenantId: proof.tenant_id,
      eventType: "refund.issued",
      payload: {
        proof_id: data.proofId,
        tenant_id: proof.tenant_id,
        subscription_id: proof.subscription_id ?? null,
        amount_usd: data.amountUsd,
        external_reference: data.externalReference,
        reason: data.reason,
        adjustment_id: adjustmentId,
        issued_at: new Date().toISOString(),
      },
    }).catch((e: unknown) => console.error("[issueRefund] webhook enqueue failed", e));

    return { ok: true, adjustmentId };
  });

// =====================================================================
// 5. grantCredit
// =====================================================================

export const grantCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        tenantId: z.string().uuid(),
        amountUsd: z.number().positive().max(100000),
        reason: reasonSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const adjustmentId = await insertAdjustment({
      tenantId: data.tenantId,
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
      diff: { amount_usd: data.amountUsd },
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
        tenantId: z.string().uuid(),
        page: z.number().int().min(1).max(1000).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const from = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await sb
      .from("billing_adjustments")
      .select(
        "id, kind, amount_usd, period_delta_days, from_plan_id, to_plan_id, reason, external_reference, actor_id, created_at, subscription_id",
        { count: "exact" },
      )
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);

    const { data: balanceRow } = await sb
      .from("tenant_credits")
      .select("balance_usd")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();

    return {
      adjustments: rows ?? [],
      total: count ?? 0,
      creditBalanceUsd: Number(balanceRow?.balance_usd ?? 0),
    };
  });

// =====================================================================
// 7. getDunningQueue
// =====================================================================

export const getDunningQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ window: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(7) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const now = new Date();
    const horizon = new Date(now);
    horizon.setUTCDate(horizon.getUTCDate() + data.window);

    const { data: subs, error } = await sb
      .from("subscriptions")
      .select(
        "id, status, period_end, tenant_id, tenants(id, name, slug, owner_id, status), plans(name, slug, interval, price_usd)",
      )
      .eq("status", "active")
      .gte("period_end", now.toISOString())
      .lte("period_end", horizon.toISOString())
      .order("period_end", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);

    const rows = (subs ?? []) as any[];
    const ownerIds = Array.from(
      new Set(rows.map((r) => r.tenants?.owner_id).filter(Boolean) as string[]),
    );
    const emailMap = new Map<string, string>();
    for (const id of ownerIds) {
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
        tenantId: r.tenant_id,
        tenantName: r.tenants?.name ?? null,
        tenantSlug: r.tenants?.slug ?? null,
        ownerEmail: r.tenants?.owner_id ? emailMap.get(r.tenants.owner_id) ?? null : null,
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

    // 2. Load proof context.
    const { data: proof, error: pErr } = await sb
      .from("payment_proofs")
      .select(
        "id, status, tenant_id, subscription_id, amount_usd, amount_egp, fx_rate, reference_number, created_at, payment_methods(label, kind), tenants(id, name, slug), subscriptions(period_start, period_end, plans(name, interval))",
      )
      .eq("id", data.proofId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proof) throw new Error("Proof not found");
    if (proof.status !== "approved") throw new Error("Only approved proofs can be invoiced.");

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
            name: proof.tenants?.name ?? "Tenant",
            slug: proof.tenants?.slug ?? "",
          },
          plan: {
            name: proof.subscriptions?.plans?.name ?? "Subscription",
            interval: proof.subscriptions?.plans?.interval ?? "monthly",
          },
          paymentMethod: proof.payment_methods
            ? { label: proof.payment_methods.label, kind: proof.payment_methods.kind }
            : null,
          referenceNumber: proof.reference_number ?? "—",
          amountUsd: Number(proof.amount_usd ?? 0),
          amountEgp: proof.amount_egp != null ? Number(proof.amount_egp) : null,
          fxRate: proof.fx_rate != null ? Number(proof.fx_rate) : null,
          periodStart: proof.subscriptions?.period_start ?? null,
          periodEnd: proof.subscriptions?.period_end ?? null,
        },
      }) as any,
    );

    // 5. Upload to private storage bucket.
    const storagePath = `tenants/${proof.tenant_id}/${invoiceNumber}.pdf`;
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
      tenant_id: proof.tenant_id,
      subscription_id: proof.subscription_id,
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
      diff: { invoice_number: invoiceNumber, storage_path: storagePath },
    });

    return { invoiceNumber, signedUrl: signed.data.signedUrl, cached: false };
  });