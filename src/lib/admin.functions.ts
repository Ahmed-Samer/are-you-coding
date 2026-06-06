import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAuditLog } from "@/lib/audit.server";
import { enqueueWebhookEvent } from "@/lib/webhooks.server";

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

  // Optional: Re-auth enforcement logic could be verified here by checking user.last_sign_in_at
  // const { data: userRes } = await sb.auth.admin.getUserById(userId);
  // if (userRes?.user?.last_sign_in_at) { ... check against Date.now() - configured_window ... }
}

// Thin wrapper preserving the existing call sites in this file.
async function audit(
  actorId: string,
  action: string,
  table: string | null,
  targetId: string | null,
  diff: Record<string, unknown> = {},
) {
  await writeAuditLog({ actorId, action, targetTable: table, targetId, diff });
}

/**
 * Lightweight admin-claim probe used by the /admin route's `beforeLoad` guard.
 *
 * Returns `{ isAdmin: true }` when the authenticated user has the `admin`
 * role row in `public.user_roles`. Never throws on the "not admin" path —
 * the route guard expects a boolean, not a redirect.
 *
 * This is intentionally cheap: a single indexed lookup by (user_id, role).
 * For the dashboard's full admin checks (audit log writes, mutations),
 * use `assertAdmin(userId)` above.
 */
export const getMyAdminClaim = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    if (!userId) return { isAdmin: false };
    const { data, error } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) {
      // Don't leak errors to the client; treat as non-admin so the guard
      // redirects them to the dashboard.
      console.error("[admin] getMyAdminClaim lookup failed:", error.message);
      return { isAdmin: false };
    }
    return { isAdmin: Boolean(data) };
  });

/**
 * Look up an owner email from an account_subscription_id by joining
 * account_subscriptions.user_id → auth.admin.getUserById. Used in the
 * account-level flow where there is no tenants.owner_id fallback.
 */
async function emailForAccountSubscription(accountSubscriptionId: string): Promise<string | null> {
  if (!accountSubscriptionId) return null;
  const { data: sub } = await sb
    .from("account_subscriptions")
    .select("user_id")
    .eq("id", accountSubscriptionId)
    .maybeSingle();
  if (!sub?.user_id) return null;
  const { data: userRes } = await sb.auth.admin.getUserById(sub.user_id);
  return userRes?.user?.email ?? null;
}

/**
 * Fire a tenant-scoped webhook event by resolving the owner's first tenant
 * (if any). In the new account-level flow, webhooks are typically a per-tenant
 * concept; if the user has no tenants yet, this is a no-op.
 */
async function enqueueOwnerWebhook(args: {
  userId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  if (!args.userId) return;
  const { data: tenantRow } = await sb
    .from("tenants")
    .select("id")
    .eq("owner_id", args.userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!tenantRow?.id) return; // no tenant yet — skip
  await enqueueWebhookEvent({
    tenantId: tenantRow.id,
    eventType: args.eventType,
    payload: args.payload,
  }).catch((e: unknown) => console.error(`[admin] ${args.eventType} webhook enqueue failed`, e));
}

// ============== EXISTING: payment proofs ==============

export const listPendingProofs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    status: z.enum(["all", "pending", "approved", "rejected"]).default("pending"),
    search: z.string().optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  }).parse(input))
  .handler(async ({ data: input, context }) => {
    await assertAdmin(context.userId);
    // New flow: proofs are account-level (tenant_id is null). Join to
    // account_subscriptions (not tenants) and look up the owner via user_id.
    let q = sb
      .from("payment_proofs")
      .select("id, status, amount_usd, amount_egp, reference_number, created_at, screenshot_path, account_subscription_id, payment_methods(label, kind), account_subscriptions(id, user_id, plans(name, interval))", { count: "exact" });

    if (input.status !== "all") {
      q = q.eq("status", input.status);
    }

    if (input.search) {
      q = q.ilike("reference_number", `%${input.search}%`);
    }

    const from = (input.page - 1) * input.pageSize;
    const { data: proofsData, error, count } = await q.order("created_at", { ascending: false }).range(from, from + input.pageSize - 1);
    if (error) throw new Error(error.message);

    const rows = proofsData ?? [];
    const proofIds = rows.map((p: any) => p.id);

    // Fetch audits for these proofs to show reviewers' history
    let allAudits: any[] = [];
    if (proofIds.length > 0) {
      const { data: auditData } = await sb
        .from("audit_logs")
        .select("id, action, target_id, created_at, diff")
        .eq("target_table", "payment_proofs")
        .in("target_id", proofIds)
        .order("created_at", { ascending: false });
      allAudits = auditData ?? [];
    }

    // Resolve owner emails in bulk so the admin UI can show "who paid".
    const userIds = Array.from(
      new Set(
        rows
          .map((p: any) => p.account_subscriptions?.user_id)
          .filter(Boolean) as string[],
      ),
    );
    const emailMap = new Map<string, string>();
    for (const uid of userIds) {
      const { data: u } = await sb.auth.admin.getUserById(uid);
      if (u?.user?.email) emailMap.set(uid, u.user.email);
    }

    const proofs = await Promise.all(rows.map(async (p: any) => {
      let signedUrl = null;
      if (p.screenshot_path) {
        // Fetch secure short-ttl signed URL for the screenshot
        const { data: urlData } = await sb.storage.from("payment_proofs").createSignedUrl(p.screenshot_path, 3600);
        signedUrl = urlData?.signedUrl ?? null;
      }

      const proofAudits = allAudits.filter(a => a.target_id === p.id);
      const ownerUserId = p.account_subscriptions?.user_id ?? null;

      return {
        ...p,
        signedUrl,
        auditLogs: proofAudits,
        ownerEmail: ownerUserId ? emailMap.get(ownerUserId) ?? null : null,
        ownerUserId,
      };
    }));

    return { proofs, total: count ?? 0 };
  });

export const reviewPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      proofId: z.string().uuid(),
      decision: z.enum(["approved", "rejected"]),
      reviewerNotes: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // 1. Load proof and ensure it is pending. In the new flow we join
    //    account_subscriptions (which carries user_id, plan interval) — not tenants.
    const { data: proof, error: pErr } = await sb
      .from("payment_proofs")
      .select("id, status, account_subscription_id, amount_usd, account_subscriptions(id, user_id, plan_id, status, plans(interval))")
      .eq("id", data.proofId)
      .maybeSingle();

    if (pErr) throw new Error(pErr.message);
    if (!proof) throw new Error("Proof not found");

    // Idempotency: if already decided, return early
    if (proof.status === data.decision) {
       return { ok: true, message: "Decision already applied" };
    }
    if (proof.status !== "pending" && proof.status !== "review") {
      throw new Error(`Cannot review proof with status: ${proof.status}`);
    }

    // 2. Update proof status
    const { error: updateErr } = await sb
      .from("payment_proofs")
      .update({
        status: data.decision,
        reviewer_id: context.userId,
        reviewer_notes: data.reviewerNotes ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.proofId);
    if (updateErr) throw new Error(updateErr.message);

    await audit(context.userId, `proof.${data.decision}`, "payment_proofs", data.proofId, { notes: data.reviewerNotes ?? null });

    // 3. Process decision effect on Account Subscription.
    //    No more "tenants.status = 'pending'" — tenants are only created via
    //    createTenant AFTER the account subscription is active, and they are
    //    always inserted with status = 'active' (see billing.functions.ts).
    if (data.decision === "approved" && proof.account_subscription_id) {
      const accountSubId: string = proof.account_subscription_id;
      let interval = proof.account_subscriptions?.plans?.interval;
      
      // Robust fallback in case PostgREST nested join drops the interval in some versions
      if (!interval && proof.account_subscriptions?.plan_id) {
        const { data: fallbackPlan } = await sb
          .from("plans")
          .select("interval")
          .eq("id", proof.account_subscriptions.plan_id)
          .maybeSingle();
        if (fallbackPlan?.interval) {
          interval = fallbackPlan.interval;
        }
      }
      interval = interval ?? "monthly";

      const now = new Date();
      const end = new Date(now);
      if (interval === "yearly") end.setUTCFullYear(end.getUTCFullYear() + 1);
      else if (interval === "quarterly") end.setUTCMonth(end.getUTCMonth() + 3);
      else end.setUTCMonth(end.getUTCMonth() + 1);

      // Before activating, cancel any existing active subscriptions for this user to support upgrades
      const ownerUserId = proof.account_subscriptions?.user_id ?? null;
      if (ownerUserId) {
        await sb.from("account_subscriptions")
          .update({ status: "cancelled" })
          .eq("user_id", ownerUserId)
          .eq("status", "active")
          .neq("id", accountSubId);
      }

      await sb
        .from("account_subscriptions")
        .update({ status: "active", period_start: now.toISOString(), period_end: end.toISOString() })
        .eq("id", accountSubId);
    } else if (data.decision === "rejected") {
      // Revert subscription status to allow them to re-upload. No tenant to
      // touch — there is no tenant in the new flow until the user provisions one.
      if (proof.account_subscription_id) {
        await sb.from("account_subscriptions").update({ status: "pending_payment" }).eq("id", proof.account_subscription_id);
      }
    }

    // 4. Resolve owner email for outbox queuing. In the new flow the owner
    //    is the account_subscriptions.user_id, NOT proof.tenants.owner_id.
    const toEmail = await emailForAccountSubscription(proof.account_subscription_id);

    if (toEmail) {
      await sb.from("email_outbox").insert({
        to_email: toEmail,
        template: data.decision === "approved" ? "payment_proof_approved" : "payment_proof_rejected",
        payload: {
          tenant_name: null,
          reviewer_notes: data.reviewerNotes ?? null,
        },
      });
    }

    // 5. Fire-and-forget webhook notifications. In the new flow, webhooks
    //    are tenant-scoped; we resolve the owner's first tenant (if any).
    const ownerUserId = proof.account_subscriptions?.user_id ?? null;
    if (data.decision === "approved") {
      await enqueueOwnerWebhook({
        userId: ownerUserId,
        eventType: "payment.approved",
        payload: {
          proof_id: data.proofId,
          subscription_id: proof.account_subscription_id ?? null,
          reviewer_notes: data.reviewerNotes ?? null,
          reviewed_at: new Date().toISOString(),
        },
      });

      if (proof.account_subscription_id) {
        await enqueueOwnerWebhook({
          userId: ownerUserId,
          eventType: "subscription.extended",
          payload: {
            subscription_id: proof.account_subscription_id,
            proof_id: data.proofId,
            interval: proof.account_subscriptions?.plans?.interval ?? "monthly",
            extended_at: new Date().toISOString(),
          },
        });
      }
    } else {
      await enqueueOwnerWebhook({
        userId: ownerUserId,
        eventType: "payment.rejected",
        payload: {
          proof_id: data.proofId,
          subscription_id: proof.account_subscription_id ?? null,
          reviewer_notes: data.reviewerNotes ?? null,
          reviewed_at: new Date().toISOString(),
        },
      });
    }

    // Signal frontend cache invalidations
    return { ok: true, invalidate: ["my-tenants", "admin", "proofs"] };
  });

// ============== TENANTS ==============

export const listAllTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      status: z.enum(["active", "inactive", "suspended"]).optional(),
      search: z.string().trim().max(80).optional(),
      page: z.number().int().min(1).max(1000).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // tenant_status enum does not include "pending" — the legacy "pending"
    // tenants.state is gone. Filter the input schema to the real enum values.
    let q = sb
      .from("tenants")
      .select("id, slug, name, niche, status, created_at, owner_id", { count: "exact" });
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.or(`name.ilike.%${data.search}%\,slug.ilike.%${data.search}%`);
    const from = (data.page - 1) * data.pageSize;
    q = q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { tenants: rows ?? [], total: count ?? 0 };
  });

export const getTenantDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: tenant } = await sb.from("tenants").select("*").eq("id", data.tenantId).maybeSingle();
    if (!tenant) throw new Error("Not found");

    // In the new flow proofs are account-level (tenant_id is always null on new
    // rows). To still show relevant proofs for this tenant's owner, look up
    // the owner's account_subscriptions and filter proofs by those IDs.
    const { data: ownerSubs } = tenant.owner_id
      ? await sb
          .from("account_subscriptions")
          .select("id, status, currency, period_end, created_at, plans(name, slug, interval, price_usd)")
          .eq("user_id", tenant.owner_id)
          .order("created_at", { ascending: false })
      : { data: [] as any[] };
    const ownerSubIds = (ownerSubs ?? []).map((s: any) => s.id);

    const [{ data: audits }, { data: proofs }] = await Promise.all([
      sb.from("audit_logs").select("id, action, actor_id, diff, created_at").eq("target_table", "tenants").eq("target_id", data.tenantId).order("created_at", { ascending: false }).limit(50),
      ownerSubIds.length > 0
        ? sb
            .from("payment_proofs")
            .select("id, status, amount_usd, amount_egp, reference_number, created_at, account_subscription_id")
            .in("account_subscription_id", ownerSubIds)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    return {
      tenant,
      subscriptions: ownerSubs ?? [],
      proofs: proofs ?? [],
      audit: audits ?? [],
    };
  });

export const suspendTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: tenant } = await sb
      .from("tenants")
      .select("name, owner_id")
      .eq("id", data.tenantId)
      .maybeSingle();
    const { error } = await sb.from("tenants").update({ status: "suspended" }).eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    await audit(context.userId, "tenant.suspend", "tenants", data.tenantId, { reason: data.reason ?? null });

    if (tenant?.owner_id) {
      const { data: userRes } = await sb.auth.admin.getUserById(tenant.owner_id);
      const toEmail = userRes?.user?.email ?? null;
      if (toEmail) {
        await sb.from("email_outbox").insert({
          to_email: toEmail,
          template: "tenant_suspended",
          payload: { tenant_name: tenant.name, reason: data.reason ?? null },
        });
      }
    }
    return { ok: true };
  });

export const reactivateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("tenants").update({ status: "active" }).eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    await audit(context.userId, "tenant.reactivate", "tenants", data.tenantId);
    return { ok: true };
  });

export const forceDeleteTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      confirmSlug: z.string().trim().min(1).max(60),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: tenant, error: tErr } = await sb
      .from("tenants")
      .select("slug, name, owner_id")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!tenant) throw new Error("Tenant not found");
    if (tenant.slug !== data.confirmSlug) {
      throw new Error("confirmSlug does not match tenant slug");
    }
    await audit(context.userId, "tenant.force_delete", "tenants", data.tenantId, {
      slug: tenant.slug,
      name: tenant.name,
      owner_id: tenant.owner_id,
    });
    const { error } = await sb.from("tenants").delete().eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============== PLANS ==============

export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      id: z.string().uuid().optional(),
      slug: z.string().trim().toLowerCase().min(1).max(60).regex(/^[a-z0-9-]+$/),
      name: z.string().trim().min(1).max(80),
      description: z.string().trim().max(500).optional().nullable(),
      priceUsd: z.number().min(0).max(100000),
      interval: z.enum(["monthly", "quarterly", "yearly"]),
      maxStores: z.number().int().min(0).max(1000).default(1),
      hasCustomDomain: z.boolean().default(false),
      features: z.array(z.string().max(120)).max(50).default([]),
      sortOrder: z.number().int().min(0).max(9999).default(0),
      isActive: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload: Record<string, unknown> = {
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      price_usd: data.priceUsd,
      interval: data.interval,
      max_stores: data.maxStores,
      has_custom_domain: data.hasCustomDomain,
      features: data.features,
      sort_order: data.sortOrder,
      is_active: data.isActive,
    };
    let q;
    if (data.id) {
      q = sb.from("plans").update(payload).eq("id", data.id);
    } else {
      q = sb.from("plans").insert(payload);
    }
    const { data: row, error } = await q.select("id").single();
    if (error) throw new Error(error.message);
    await audit(context.userId, data.id ? "plan.update" : "plan.create", "plans", row.id, { slug: data.slug });
    return { ok: true, planId: row.id };
  });

export const togglePlanActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("plans").update({ is_active: data.isActive }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "plan.toggle", "plans", data.id, { is_active: data.isActive });
    return { ok: true };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // Block delete if any account_subscription references this plan.
    const { count } = await sb
      .from("account_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("Cannot delete a plan that has active or historical subscriptions. Mark it inactive instead.");
    }
    const { error } = await sb.from("plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "plan.delete", "plans", data.id);
    return { ok: true };
  });

export const listPlansAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await sb.from("plans").select("*").order("sort_order").order("price_usd");
    if (error) throw new Error(error.message);
    return { plans: data ?? [] };
  });

// ============== PAYMENT METHODS ==============

export const upsertPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      id: z.string().uuid().optional(),
      kind: z.enum(["instapay", "vodafone_cash", "bank_transfer"]),
      label: z.string().trim().min(1).max(80),
      accountIdentifier: z.string().trim().min(1).max(120),
      accountHolder: z.string().trim().max(120).optional().nullable(),
      instructions: z.string().trim().max(1000).optional().nullable(),
      sortOrder: z.number().int().min(0).max(9999).default(0),
      isActive: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload: Record<string, unknown> = {
      kind: data.kind,
      label: data.label,
      account_identifier: data.accountIdentifier,
      account_holder: data.accountHolder ?? null,
      instructions: data.instructions ?? null,
      sort_order: data.sortOrder,
      is_active: data.isActive,
    };
    const q = data.id
      ? sb.from("payment_methods").update(payload).eq("id", data.id)
      : sb.from("payment_methods").insert(payload);
    const { data: row, error } = await q.select("id").single();
    if (error) throw new Error(error.message);
    await audit(context.userId, data.id ? "payment_method.update" : "payment_method.create", "payment_methods", row.id, { label: data.label });
    return { ok: true, paymentMethodId: row.id };
  });

export const togglePaymentMethodActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("payment_methods").update({ is_active: data.isActive }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "payment_method.toggle", "payment_methods", data.id, { is_active: data.isActive });
    return { ok: true };
  });

export const deletePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("payment_methods").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "payment_method.delete", "payment_methods", data.id);
    return { ok: true };
  });

export const listPaymentMethodsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await sb.from("payment_methods").select("*").order("sort_order");
    if (error) throw new Error(error.message);
    return { methods: data ?? [] };
  });

// ============== FX RATES ==============

export const insertFxRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      baseCurrency: z.string().trim().min(3).max(8).default("USD"),
      quoteCurrency: z.string().trim().min(3).max(8).default("EGP"),
      rate: z.number().positive().max(100000),
      effectiveAt: z.string().datetime().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await sb
      .from("fx_rates")
      .insert({
        base_currency: data.baseCurrency,
        quote_currency: data.quoteCurrency,
        rate: data.rate,
        effective_at: data.effectiveAt ?? new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context.userId, "fx_rate.insert", "fx_rates", row.id, { rate: data.rate, base: data.baseCurrency, quote: data.quoteCurrency });
    return { ok: true, fxRateId: row.id };
  });

export const listFxRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      baseCurrency: z.string().trim().min(3).max(8).default("USD"),
      quoteCurrency: z.string().trim().min(3).max(8).default("EGP"),
      page: z.number().int().min(1).max(1000).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const from = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await sb
      .from("fx_rates")
      .select("*", { count: "exact" })
      .eq("base_currency", data.baseCurrency)
      .eq("quote_currency", data.quoteCurrency)
      .order("effective_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);
    return { rates: rows ?? [], total: count ?? 0 };
  });

// ============== FEATURE FLAGS ==============

export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await sb.from("feature_flags").select("*").order("key");
    if (error) throw new Error(error.message);
    return { flags: data ?? [] };
  });

export const toggleFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ key: z.string().min(1).max(120), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("feature_flags").update({ enabled: data.enabled }).eq("key", data.key);
    if (error) throw new Error(error.message);
    await audit(context.userId, "feature_flag.toggle", "feature_flags", null, { key: data.key, enabled: data.enabled });
    return { ok: true };
  });

export const setFeatureFlagRollout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      key: z.string().min(1).max(120),
      rolloutPct: z.number().int().min(0).max(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("feature_flags").update({ rollout_pct: data.rolloutPct }).eq("key", data.key);
    if (error) throw new Error(error.message);
    await audit(context.userId, "feature_flag.rollout", "feature_flags", null, { key: data.key, rollout_pct: data.rolloutPct });
    return { ok: true };
  });

// ============== AUDIT LOG ==============

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
      action: z.string().max(120).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const from = (data.page - 1) * data.pageSize;
    let q = sb.from("audit_logs").select("*", { count: "exact" });
    if (data.action) q = q.eq("action", data.action);
    const { data: rows, error, count } = await q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);
    return { entries: rows ?? [], total: count ?? 0 };
  });

// ============== ERROR REPORTS ==============

export const listErrorReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
      scope: z.enum(["client", "server", "edge"]).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = sb.from("error_reports").select("*", { count: "exact" });
    if (data.scope) q = q.eq("scope", data.scope);
    const from = (data.page - 1) * data.pageSize;
    q = q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { entries: rows ?? [], total: count ?? 0 };
  });

export const markErrorResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      id: z.string().uuid(),
      resolved: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const updates: Record<string, unknown> = {
      resolved: data.resolved,
      resolved_at: data.resolved ? new Date().toISOString() : null,
      resolved_by: data.resolved ? context.userId : null,
    };
    const { error } = await sb.from("error_reports").update(updates).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, data.resolved ? "error_report.resolve" : "error_report.reopen", "error_reports", data.id);
    return { ok: true };
  });

// ============== EMAIL TEMPLATES ==============

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await sb.from("email_templates").select("*").order("key");
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

export const upsertEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      key: z.string().trim().min(1).max(120),
      subject: z.string().trim().min(1).max(200),
      bodyHtml: z.string().max(50000),
      bodyText: z.string().max(50000).optional().nullable(),
      isActive: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: existing } = await sb
      .from("email_templates")
      .select("id")
      .eq("key", data.key)
      .maybeSingle();
    const payload: Record<string, unknown> = {
      key: data.key,
      subject: data.subject,
      body_html: data.bodyHtml,
      body_text: data.bodyText ?? null,
      is_active: data.isActive,
    };
    let rowId: string;
    if (existing) {
      const { error } = await sb.from("email_templates").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
      rowId = existing.id;
    } else {
      const { data: row, error } = await sb
        .from("email_templates")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      rowId = row.id;
    }
    await audit(context.userId, existing ? "email_template.update" : "email_template.create", "email_templates", rowId, { key: data.key });
    return { ok: true, templateId: rowId };
  });

// ============== KPIs ==============

export const getAdminDashboardKPIs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const since12w = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const [
      { count: pendingProofs },
      { count: activeTenants },
      { count: totalTenants },
      { count: newTenants30d },
      { count: activatedTenants30d },
      { count: churned30d },
      { data: activeSubs },
      { data: revenueRows },
    ] = await Promise.all([
      sb.from("payment_proofs").select("*", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("tenants").select("*", { count: "exact", head: true }).eq("status", "active"),
      sb.from("tenants").select("*", { count: "exact", head: true }),
      sb.from("tenants").select("*", { count: "exact", head: true }).gt("created_at", since30),
      sb.from("tenants").select("*", { count: "exact", head: true }).eq("status", "active").gt("created_at", since30),
      sb.from("account_subscriptions").select("*", { count: "exact", head: true }).eq("status", "cancelled").gt("updated_at", since30),
      sb.from("account_subscriptions")
        .select("plans(price_usd, interval)")
        .eq("status", "active")
        .or(`period_end.is.null,period_end.gt.${nowIso}`),
      sb.from("payment_proofs")
        .select("created_at, amount_usd")
        .eq("status", "approved")
        .gt("created_at", since12w)
        .order("created_at", { ascending: true }),
    ]);

    let mrrUsd = 0;
    for (const s of (activeSubs ?? []) as any[]) {
      const p = s.plans;
      if (!p) continue;
      const interval = String(p.interval ?? "monthly");
      const price = Number(p.price_usd ?? 0);
      // Normalize any interval to a monthly equivalent.
      const monthly =
        interval === "yearly" ? price / 12
        : interval === "quarterly" ? price / 3
        : price;
      mrrUsd += Number.isFinite(monthly) ? monthly : 0;
    }

    const weekly = new Map<string, number>();
    for (const r of (revenueRows ?? []) as any[]) {
      const d = new Date(r.created_at);
      const day = d.getUTCDay();
      const diff = (day + 6) % 7;
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
      const key = monday.toISOString().slice(0, 10);
      weekly.set(key, (weekly.get(key) ?? 0) + (Number(r.amount_usd) || 0));
    }
    const revenueTimeline = Array.from(weekly.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, total]) => ({ week, total: Math.round(total * 100) / 100 }));

    const tenantsStarted30d = newTenants30d ?? 0;
    const tenantsActivated30d = activatedTenants30d ?? 0;
    const conversionRate = tenantsStarted30d > 0
      ? Math.round((tenantsActivated30d / tenantsStarted30d) * 1000) / 10
      : 0;

    return {
      pendingProofs: pendingProofs ?? 0,
      activeTenants: activeTenants ?? 0,
      totalTenants: totalTenants ?? 0,
      activeSubscriptions: (activeSubs ?? []).length,
      mrrUsd: Math.round(mrrUsd * 100) / 100,
      arrUsd: Math.round(mrrUsd * 12 * 100) / 100,
      newTenants30d: tenantsStarted30d,
      activatedTenants30d: tenantsActivated30d,
      churned30d: churned30d ?? 0,
      conversionRate,
      revenueTimeline,
    };
  });

// =====================================================================
// runKillSwitchBackfill — one-shot recovery for orphaned active tenants
// =====================================================================
//
// Scans account_subscriptions for users whose ONLY non-terminal subscription
// is in (`cancelled`,`expired`) and forces all of their `active` tenants into
// `suspended`. Idempotent — safe to run repeatedly.
//
// Use after deploying the kill-switch DB trigger to clean up historical
// accounts that were cancelled before the trigger existed.

export const runKillSwitchBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // 1. Find every owner with at least one cancelled/expired sub.
    const { data: deadSubs, error: dErr } = await sb
      .from("account_subscriptions")
      .select("user_id, status")
      .in("status", ["cancelled", "expired"]);
    if (dErr) throw new Error(dErr.message);

    const candidateUserIds = Array.from(
      new Set((deadSubs ?? []).map((r: any) => r.user_id as string)),
    );
    if (candidateUserIds.length === 0) {
      return { ok: true, scanned: 0, usersAffected: 0, tenantsSuspended: 0 };
    }

    // 2. Filter to users with NO active subscription left.
    const { data: activeRows, error: aErr } = await sb
      .from("account_subscriptions")
      .select("user_id")
      .in("user_id", candidateUserIds)
      .eq("status", "active");
    if (aErr) throw new Error(aErr.message);
    const stillActive = new Set((activeRows ?? []).map((r: any) => r.user_id as string));
    const orphanedUserIds = candidateUserIds.filter((u) => !stillActive.has(u));

    if (orphanedUserIds.length === 0) {
      return {
        ok: true,
        scanned: candidateUserIds.length,
        usersAffected: 0,
        tenantsSuspended: 0,
      };
    }

    // 3. Suspend in bulk.
    const nowIso = new Date().toISOString();
    const { data: suspended, error: uErr } = await sb
      .from("tenants")
      .update({
        status: "suspended",
        suspended_at: nowIso,
        suspended_reason: "kill_switch_backfill",
      })
      .in("owner_id", orphanedUserIds)
      .eq("status", "active")
      .select("id, owner_id");
    if (uErr) throw new Error(uErr.message);

    const tenantsSuspended = Array.isArray(suspended) ? suspended.length : 0;
    const usersAffected = new Set(
      (suspended ?? []).map((r: any) => r.owner_id as string),
    ).size;

    await audit(context.userId, "kill_switch.backfill", "tenants", null, {
      scanned: candidateUserIds.length,
      orphaned_users: orphanedUserIds.length,
      tenants_suspended: tenantsSuspended,
    });

    return {
      ok: true,
      scanned: candidateUserIds.length,
      usersAffected,
      tenantsSuspended,
    };
  });
