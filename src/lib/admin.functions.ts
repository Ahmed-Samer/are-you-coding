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

// ============== EXISTING: payment proofs ==============

export const listPendingProofs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await sb
      .from("payment_proofs")
      .select("id, status, amount_usd, amount_egp, reference_number, created_at, tenants(name, slug), payment_methods(label, kind), subscriptions(plans(name, interval))")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { proofs: data ?? [] };
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
    const { error } = await sb
      .from("payment_proofs")
      .update({
        status: data.decision,
        reviewer_id: context.userId,
        reviewer_notes: data.reviewerNotes ?? null,
      })
      .eq("id", data.proofId);
    if (error) throw new Error(error.message);
    await audit(context.userId, `proof.${data.decision}`, "payment_proofs", data.proofId, { notes: data.reviewerNotes ?? null });

    // On approve: extend subscription period and activate tenant if pending.
    // On reject: leave subscription alone. Either way, queue a branded email.
    const { data: proof } = await sb
      .from("payment_proofs")
      .select("subscription_id, tenant_id, subscriptions(plan_id, plans(interval)), tenants(name, owner_id)")
      .eq("id", data.proofId)
      .maybeSingle();

    if (proof) {
      if (data.decision === "approved" && proof.subscription_id) {
        const interval = proof.subscriptions?.plans?.interval ?? "monthly";
        const now = new Date();
        const end = new Date(now);
        if (interval === "yearly") end.setUTCFullYear(end.getUTCFullYear() + 1);
        else end.setUTCMonth(end.getUTCMonth() + 1);
        await sb
          .from("subscriptions")
          .update({ status: "active", period_start: now.toISOString(), period_end: end.toISOString() })
          .eq("id", proof.subscription_id);
        if (proof.tenant_id) {
          await sb.from("tenants").update({ status: "active" }).eq("id", proof.tenant_id).eq("status", "pending");
        }

        // ---- Auto-consume any tenant credit balance against this invoice ----
        if (proof.tenant_id) {
          const { data: balRow } = await sb
            .from("tenant_credits")
            .select("balance_usd")
            .eq("tenant_id", proof.tenant_id)
            .maybeSingle();
          const balance = Number(balRow?.balance_usd ?? 0);
          if (balance > 0) {
            // Need invoice amount — fetch from proof row we already have? Not here; reload.
            const { data: amountRow } = await sb
              .from("payment_proofs")
              .select("amount_usd")
              .eq("id", data.proofId)
              .maybeSingle();
            const invoiceAmount = Number(amountRow?.amount_usd ?? 0);
            const consumed = Math.min(balance, invoiceAmount);
            if (consumed > 0) {
              const { error: cErr } = await sb.from("billing_adjustments").insert({
                tenant_id: proof.tenant_id,
                subscription_id: proof.subscription_id,
                kind: "credit_consumed",
                amount_usd: -consumed,
                reason: `Auto-applied to proof ${data.proofId}`,
                actor_id: context.userId,
              });
              if (!cErr) {
                await audit(
                  context.userId,
                  "billing.credit_auto_consumed",
                  "billing_adjustments",
                  data.proofId,
                  { consumed_usd: consumed, balance_before: balance },
                );
              }
            }
          }
        }
      }

      // Resolve owner email for the outbox.
      let toEmail: string | null = null;
      const ownerId = proof.tenants?.owner_id;
      if (ownerId) {
        const { data: userRes } = await sb.auth.admin.getUserById(ownerId);
        toEmail = userRes?.user?.email ?? null;
      }
      if (toEmail) {
        await sb.from("email_outbox").insert({
          to_email: toEmail,
          template: data.decision === "approved" ? "payment_proof_approved" : "payment_proof_rejected",
          payload: {
            tenant_name: proof.tenants?.name ?? null,
            reviewer_notes: data.reviewerNotes ?? null,
          },
        });
      }

      // Fire-and-forget webhook notifications.
      if (proof.tenant_id) {
        if (data.decision === "approved") {
          void enqueueWebhookEvent({
            tenantId: proof.tenant_id,
            eventType: "payment.approved",
            payload: {
              proof_id: data.proofId,
              tenant_id: proof.tenant_id,
              subscription_id: proof.subscription_id ?? null,
              reviewer_notes: data.reviewerNotes ?? null,
              reviewed_at: new Date().toISOString(),
            },
          }).catch((e: unknown) => console.error("[reviewPaymentProof] payment.approved webhook failed", e));

          if (proof.subscription_id) {
            void enqueueWebhookEvent({
              tenantId: proof.tenant_id,
              eventType: "subscription.extended",
              payload: {
                subscription_id: proof.subscription_id,
                tenant_id: proof.tenant_id,
                proof_id: data.proofId,
                interval: proof.subscriptions?.plans?.interval ?? "monthly",
                extended_at: new Date().toISOString(),
              },
            }).catch((e: unknown) => console.error("[reviewPaymentProof] subscription.extended webhook failed", e));
          }
        } else {
          void enqueueWebhookEvent({
            tenantId: proof.tenant_id,
            eventType: "payment.rejected",
            payload: {
              proof_id: data.proofId,
              tenant_id: proof.tenant_id,
              subscription_id: proof.subscription_id ?? null,
              reviewer_notes: data.reviewerNotes ?? null,
              reviewed_at: new Date().toISOString(),
            },
          }).catch((e: unknown) => console.error("[reviewPaymentProof] payment.rejected webhook failed", e));
        }
      }
    }

    return { ok: true };
  });

// ============== TENANTS ==============

export const listAllTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      status: z.enum(["pending", "active", "suspended"]).optional(),
      search: z.string().trim().max(80).optional(),
      page: z.number().int().min(1).max(1000).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = sb
      .from("tenants")
      .select("id, slug, name, niche, status, created_at, owner_id", { count: "exact" });
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.or(`name.ilike.%${data.search}%,slug.ilike.%${data.search}%`);
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
    const [{ data: tenant }, { data: subs }, { data: proofs }, { data: audits }] = await Promise.all([
      sb.from("tenants").select("*").eq("id", data.tenantId).maybeSingle(),
      sb.from("subscriptions").select("id, status, currency, period_end, created_at, plans(name, slug, interval, price_usd)").eq("tenant_id", data.tenantId).order("created_at", { ascending: false }),
      sb.from("payment_proofs").select("id, status, amount_usd, amount_egp, reference_number, created_at").eq("tenant_id", data.tenantId).order("created_at", { ascending: false }).limit(50),
      sb.from("audit_logs").select("id, action, actor_id, diff, created_at").eq("target_table", "tenants").eq("target_id", data.tenantId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (!tenant) throw new Error("Not found");
    return { tenant, subscriptions: subs ?? [], proofs: proofs ?? [], audit: audits ?? [] };
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

    // Queue suspension email to owner.
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
    // Audit BEFORE the cascade delete (target_id will be orphaned but preserved).
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
      interval: z.enum(["monthly", "yearly"]),
      features: z.array(z.string().max(120)).max(50).default([]),
      sortOrder: z.number().int().min(0).max(9999).default(0),
      isActive: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload = {
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      price_usd: data.priceUsd,
      interval: data.interval,
      features: data.features,
      sort_order: data.sortOrder,
      is_active: data.isActive,
    };
    if (data.id) {
      const { error } = await sb.from("plans").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context.userId, "plan.update", "plans", data.id, payload);
      return { id: data.id };
    }
    const { data: row, error } = await sb.from("plans").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    await audit(context.userId, "plan.create", "plans", row.id, payload);
    return { id: row.id };
  });

export const togglePlanActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("plans").update({ is_active: data.isActive }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "plan.toggle", "plans", data.id, { isActive: data.isActive });
    return { ok: true };
  });

// ============== PAYMENT METHODS ==============

export const upsertPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      id: z.string().uuid().optional(),
      kind: z.enum(["instapay", "vodafone_cash", "bank_transfer"]),
      label: z.string().trim().min(1).max(80),
      accountIdentifier: z.string().trim().max(120).optional().nullable(),
      accountHolder: z.string().trim().max(120).optional().nullable(),
      instructions: z.string().trim().max(1000).optional().nullable(),
      sortOrder: z.number().int().min(0).max(9999).default(0),
      isActive: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload = {
      kind: data.kind,
      label: data.label,
      account_identifier: data.accountIdentifier ?? null,
      account_holder: data.accountHolder ?? null,
      instructions: data.instructions ?? null,
      sort_order: data.sortOrder,
      is_active: data.isActive,
    };
    if (data.id) {
      const { error } = await sb.from("payment_methods").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context.userId, "payment_method.update", "payment_methods", data.id, payload);
      return { id: data.id };
    }
    const { data: row, error } = await sb.from("payment_methods").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    await audit(context.userId, "payment_method.create", "payment_methods", row.id, payload);
    return { id: row.id };
  });

export const togglePaymentMethodActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("payment_methods").update({ is_active: data.isActive }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "payment_method.toggle", "payment_methods", data.id, { isActive: data.isActive });
    return { ok: true };
  });

// ============== FX RATES ==============

export const insertFxRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      baseCurrency: z.string().trim().length(3).default("USD"),
      quoteCurrency: z.string().trim().length(3).default("EGP"),
      rate: z.number().positive().max(100000),
      effectiveAt: z.string().datetime().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await sb
      .from("fx_rates")
      .insert({
        base_currency: data.baseCurrency.toUpperCase(),
        quote_currency: data.quoteCurrency.toUpperCase(),
        rate: data.rate,
        ...(data.effectiveAt ? { effective_at: data.effectiveAt } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context.userId, "fx.insert", "fx_rates", row.id, { rate: data.rate });
    return { id: row.id };
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
  .inputValidator((i) =>
    z.object({
      key: z.string().trim().min(1).max(80).regex(/^[a-z0-9_.-]+$/),
      enabled: z.boolean(),
      rolloutPercent: z.number().int().min(0).max(100).optional(),
      description: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload: any = { key: data.key, enabled: data.enabled, updated_by: context.userId };
    if (data.rolloutPercent !== undefined) payload.rollout_percent = data.rolloutPercent;
    if (data.description !== undefined) payload.description = data.description;
    const { error } = await sb.from("feature_flags").upsert(payload, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await audit(context.userId, "flag.toggle", "feature_flags", null, payload);
    return { ok: true };
  });

// ============== AUDIT + ERRORS ==============

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      actorId: z.string().uuid().optional(),
      targetTable: z.string().max(60).optional(),
      page: z.number().int().min(1).max(1000).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = sb.from("audit_logs").select("*", { count: "exact" });
    if (data.actorId) q = q.eq("actor_id", data.actorId);
    if (data.targetTable) q = q.eq("target_table", data.targetTable);
    const from = (data.page - 1) * data.pageSize;
    q = q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { entries: rows ?? [], total: count ?? 0 };
  });

export const listErrorReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      scope: z.enum(["client", "server"]).optional(),
      page: z.number().int().min(1).max(1000).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
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
      sb.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "cancelled").gt("updated_at", since30),
      sb.from("subscriptions")
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
      const monthly = p.interval === "yearly" ? p.price_usd / 12 : p.price_usd;
      mrrUsd += Number(monthly) || 0;
    }

    // Aggregate weekly revenue (12-week sparkline).
    const weekly = new Map<string, number>();
    for (const r of (revenueRows ?? []) as any[]) {
      const d = new Date(r.created_at);
      // ISO week-start (Monday)
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
      conversionRate, // percent
      revenueTimeline,
    };
  });

// ============== ADMIN LIST READS ==============

export const listPlansAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await sb.from("plans").select("*").order("sort_order").order("price_usd");
    if (error) throw new Error(error.message);
    return { plans: data ?? [] };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "plan.delete", "plans", data.id);
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

export const listFxRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await sb
      .from("fx_rates")
      .select("*")
      .order("effective_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { rates: data ?? [] };
  });

// Get current admin's claim — used by the /admin guard
export const getMyAdminClaim = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { isAdmin: !!data };
  });

// ============== FEATURE FLAGS — rollout ==============

export const setFeatureFlagRollout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      key: z.string().trim().min(1).max(80).regex(/^[a-z0-9_.-]+$/),
      rolloutPercent: z.number().int().min(0).max(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb
      .from("feature_flags")
      .update({ rollout_percent: data.rolloutPercent, updated_by: context.userId })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    await audit(context.userId, "flag.rollout", "feature_flags", null, {
      key: data.key,
      rollout_percent: data.rolloutPercent,
    });
    return { ok: true };
  });

// ============== ERROR REPORTS — mark resolved ==============

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
    const { error } = await sb
      .from("error_reports")
      .update({
        resolved: data.resolved,
        resolved_at: data.resolved ? new Date().toISOString() : null,
        resolved_by: data.resolved ? context.userId : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, data.resolved ? "error.resolve" : "error.reopen", "error_reports", data.id);
    return { ok: true };
  });

// ============== EMAIL TEMPLATES ==============

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await sb
      .from("email_templates")
      .select("*")
      .order("key");
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

export const upsertEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      key: z.string().trim().min(1).max(80).regex(/^[a-z0-9_.-]+$/),
      subject: z.string().trim().min(1).max(200),
      bodyHtml: z.string().min(1).max(50_000),
      bodyText: z.string().max(50_000).optional().nullable(),
      description: z.string().max(500).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload = {
      key: data.key,
      subject: data.subject,
      body_html: data.bodyHtml,
      body_text: data.bodyText ?? null,
      description: data.description ?? null,
      updated_by: context.userId,
    };
    const { error } = await sb
      .from("email_templates")
      .upsert(payload, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await audit(context.userId, "email_template.upsert", "email_templates", null, { key: data.key });
    return { ok: true };
  });
