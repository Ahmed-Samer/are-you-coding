import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSameOrigin, enforceRateLimit } from "@/lib/rate-limit.server";
import { TEMPLATE_SLUGS, isTemplateSelectable } from "@/lib/templates";

// ---------- PUBLIC READS ----------

export type PublicPlan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_usd: number;
  currency: string;
  interval: "monthly" | "yearly" | string;
  features: string[] | null;
  highlight: boolean;
  sort_order: number;
};

const PLANS_CACHE_TTL_MS = 5 * 60 * 1000;
let _plansCache: { at: number; plans: PublicPlan[] } | null = null;

export const listPlans = createServerFn({ method: "GET" }).handler(async (): Promise<{ plans: PublicPlan[] }> => {
  const now = Date.now();
  if (_plansCache && now - _plansCache.at < PLANS_CACHE_TTL_MS) {
    return { plans: _plansCache.plans };
  }
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select(
      "id, slug, name, description, price_usd, currency, interval, features, highlight, sort_order",
    )
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  const plans = (data ?? []) as unknown as PublicPlan[];
  _plansCache = { at: now, plans };
  return { plans };
});

export const listPaymentMethods = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("payment_methods")
    .select("id, kind, label, account_identifier, account_holder, instructions, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return { methods: data ?? [] };
});

export const getCurrentFxRate = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("fx_rates")
    .select("rate, base_currency, quote_currency, effective_at")
    .eq("base_currency", "USD")
    .eq("quote_currency", "EGP")
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("FX rate not configured");
  const rate = Number(data.rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("FX rate invalid");
  return {
    rate,
    base_currency: data.base_currency,
    quote_currency: data.quote_currency,
    effective_at: data.effective_at,
  };
});

// ---------- TENANT / SUBSCRIPTION (AUTH) ----------

const slugRe = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

export type CreateTenantErrorCode =
  | "SLUG_TAKEN"
  | "PLAN_NOT_AVAILABLE"
  | "PLAN_INTERVAL_MISMATCH"
  | "TEMPLATE_NOT_AVAILABLE"
  | "STORE_QUOTA_EXCEEDED"
  | "NO_ACTIVE_SUBSCRIPTION";

function createTenantError(
  code: CreateTenantErrorCode,
  message: string,
  step: "basics" | "plan" | "template" | "quota",
  field?: string,
): Error {
  return new Error(JSON.stringify({ code, message, step, field }));
}

export const createTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        slug: z.string().trim().toLowerCase().regex(slugRe, "Domain must start with a letter and contain only lowercase letters, numbers, and hyphens."),
        niche: z.string().trim().max(50).optional(),
        template: z.enum(TEMPLATE_SLUGS).default("classic"),
        idempotencyKey: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    assertSameOrigin();

    if (data.idempotencyKey) {
      const { data: existingTenant } = await supabaseAdmin
        .from("tenants")
        .select("id, slug")
        .eq("owner_id", userId)
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (existingTenant) {
        return {
          tenantId: existingTenant.id,
          slug: existingTenant.slug,
        };
      }
    }

    // Fetch user's active account subscription with plan details
    const { data: accountSub, error: asErr } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .select("id, user_id, plan_id, status, plans!inner(id, name, max_stores)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (asErr) throw new Error(asErr.message);
    if (!accountSub) {
      throw createTenantError(
        "NO_ACTIVE_SUBSCRIPTION",
        "You need an active subscription before creating a store.",
        "quota",
      );
    }

    const maxStores = Number(accountSub.plans?.max_stores ?? 0);
    const planName = String(accountSub.plans?.name ?? "Unknown");

    // Count current tenants
    const { count: tenantCount, error: countErr } = await supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);
    if (countErr) throw new Error(countErr.message);
    const currentCount = tenantCount ?? 0;

    if (currentCount >= maxStores) {
      throw createTenantError(
        "STORE_QUOTA_EXCEEDED",
        JSON.stringify({ currentCount, maxStores, planName }),
        "quota",
      );
    }

    await enforceRateLimit({
      table: "tenants",
      filters: { owner_id: userId },
      max: 5,
      windowSec: 60 * 60,
      label: "store signups",
    });

    if (!isTemplateSelectable(data.template)) {
      throw createTenantError(
        "TEMPLATE_NOT_AVAILABLE",
        "That template is not available. Pick another to continue.",
        "template",
        "template",
      );
    }

    // Check slug availability
    const { data: existing } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (existing) {
      throw createTenantError(
        "SLUG_TAKEN",
        "That store address is already taken.",
        "basics",
        "slug",
      );
    }

    // Insert tenant
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        owner_id: userId,
        slug: data.slug,
        name: data.name,
        niche: (data.niche || "retail") as any,
        template: data.template,
        status: "active" as any,
        idempotency_key: data.idempotencyKey ?? null,
      })
      .select("id, slug, name")
      .single();
    if (tErr) {
      const code = (tErr as any).code as string | undefined;
      if (code === "23505") {
        throw createTenantError(
          "SLUG_TAKEN",
          "That store address was just taken. Pick another.",
          "basics",
          "slug",
        );
      }
      throw new Error(tErr.message);
    }

    // Fire n8n webhook (no plan/interval/price since it's now account-level)
    const n8nUrl = process.env.N8N_WEBHOOK_URL || process.env.VITE_N8N_WEBHOOK_URL;
    if (n8nUrl) {
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
        const email = userData?.user?.email || "unknown";
        const fullName = userData?.user?.user_metadata?.full_name || "unknown";

        fetch(n8nUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "tenant.created",
            tenant: {
              id: tenant.id,
              slug: tenant.slug,
              name: tenant.name,
            },
            owner: {
              id: userId,
              email: email,
              name: fullName,
            },
            timestamp: new Date().toISOString(),
          }),
        }).catch((e) => console.error("[n8n] fetch error:", e));
      } catch (err) {
        console.error("[n8n] webhook dispatch failed:", err);
      }
    }

    return { tenantId: tenant.id, slug: tenant.slug };
  });

// ---------- ACCOUNT SUBSCRIPTION ----------

export const createAccountSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        planSlug: z.string().min(1).max(60),
        interval: z.enum(["monthly", "quarterly"]),
        idempotencyKey: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    assertSameOrigin();

    // Check idempotency
    if (data.idempotencyKey) {
      const { data: existingSub } = await (supabaseAdmin as any)
        .from("account_subscriptions" as any)
        .select("id, plan_id, status")
        .eq("user_id", userId)
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (existingSub) {
        return {
          subscriptionId: existingSub.id,
          planSlug: data.planSlug,
        };
      }
    }

    // Check if user already has an active subscription
    const { data: activeSub } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (activeSub) {
      throw new Error(JSON.stringify({ code: "ALREADY_SUBSCRIBED", message: "You already have an active subscription." }));
    }

    await enforceRateLimit({
      table: "account_subscriptions",
      filters: { user_id: userId },
      max: 3,
      windowSec: 60 * 60,
      label: "account subscriptions",
    });

    // Fetch plan
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("id, slug, price_usd, interval, is_active")
      .eq("slug", data.planSlug)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan || !plan.is_active) {
      throw new Error(JSON.stringify({ code: "PLAN_NOT_AVAILABLE", message: "That plan is no longer available." }));
    }
    if (plan.interval !== data.interval) {
      throw new Error(JSON.stringify({ code: "PLAN_INTERVAL_MISMATCH", message: "Plan and billing period do not match." }));
    }

    // Insert account subscription
    const { data: row, error: insErr } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .insert({
        user_id: userId,
        plan_id: plan.id,
        status: "pending_payment",
        currency: "USD",
        price_usd_snapshot: Number(plan.price_usd),
        idempotency_key: data.idempotencyKey ?? null,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return { subscriptionId: row.id, planSlug: plan.slug };
  });

export const getMyAccountSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // Get latest account subscription with plan details
    const { data: sub, error: sErr } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .select("id, user_id, plan_id, status, period_start, period_end, currency, price_usd_snapshot, reference_code, created_at, updated_at, plans!inner(id, name, slug, price_usd, interval, max_stores, has_custom_domain)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);

    // Count tenants
    const { count: tenantCount, error: countErr } = await supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);
    if (countErr) throw new Error(countErr.message);
    const currentStoreCount = tenantCount ?? 0;

    if (!sub) {
      return {
        subscription: null,
        currentStoreCount,
        quota: {
          maxStores: 0,
          hasCustomDomain: false,
          canCreateMore: false,
        },
      };
    }

    const maxStores = Number(sub.plans?.max_stores ?? 0);
    const hasCustomDomain = Boolean(sub.plans?.has_custom_domain ?? false);

    return {
      subscription: sub,
      currentStoreCount,
      quota: {
        maxStores,
        hasCustomDomain,
        canCreateMore: currentStoreCount < maxStores,
      },
    };
  });

export const submitPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        subscriptionId: z.string().uuid(),
        paymentMethodId: z.string().uuid(),
        referenceNumber: z.string().trim().min(3).max(80),
        screenshotPath: z.string().max(500).optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    assertSameOrigin();
    
    // Query account_subscriptions to verify ownership
    const { data: sub, error: sErr } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .select("id, user_id, plan_id, plans!inner(price_usd)")
      .eq("id", data.subscriptionId)
      .single();
    if (sErr || !sub) throw new Error("Subscription not found");
    if (sub.user_id !== userId) throw new Error("Forbidden");

    await enforceRateLimit({
      table: "payment_proofs",
      filters: { account_subscription_id: data.subscriptionId },
      max: 10,
      windowSec: 60 * 60,
      label: "payment proofs",
    });

    const amountUsd = Number(sub.plans.price_usd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw new Error("Plan price is invalid");
    }
    const { data: fxRow, error: fxErr } = await supabaseAdmin
      .from("fx_rates")
      .select("rate")
      .eq("base_currency", "USD")
      .eq("quote_currency", "EGP")
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fxErr) throw new Error(fxErr.message);
    if (!fxRow) throw new Error("FX rate not configured");
    const fxRate = Number(fxRow.rate);
    if (!Number.isFinite(fxRate) || fxRate <= 0) throw new Error("FX rate invalid");
    const amountEgp = Math.round(amountUsd * fxRate * 100) / 100;

    // 1. Insert the payment proof with account_subscription_id
    const { error: proofErr } = await supabaseAdmin.from("payment_proofs").insert({
      subscription_id: null,
      account_subscription_id: data.subscriptionId,
      tenant_id: null,
      payment_method_id: data.paymentMethodId,
      reference_number: data.referenceNumber,
      amount_usd: amountUsd,
      amount_egp: amountEgp,
      fx_rate: fxRate,
      screenshot_path: data.screenshotPath ?? null,
      notes: data.notes ?? null,
      status: "pending",
    } as any);
    if (proofErr) throw new Error(proofErr.message);

    // 2. Update the account subscription status
    const { error: subUpdateErr } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .update({ status: "pending_review" })
      .eq("id", data.subscriptionId);
    
    if (subUpdateErr) {
      console.error("[billing.functions] Failed to update account subscription status:", subUpdateErr);
    }

    return { ok: true, amountUsd, amountEgp, fxRate };
  });

export const getMyTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    // SOLUTION: Use supabaseAdmin here to bypass the RLS "has_role" function error
    // We already assert the user is getting their own data via .eq("owner_id", userId)
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id, slug, name, status, niche, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("[getMyTenants] DB Error:", error);
      throw new Error(error.message);
    }

    const tenants = data ?? [];

    // Get account subscription with plan for quota
    const { data: accountSub } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .select("id, status, plans!inner(name, max_stores, has_custom_domain)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const maxStores = Number(accountSub?.plans?.max_stores ?? 0);
    const planName = String(accountSub?.plans?.name ?? "None");
    const hasCustomDomain = Boolean(accountSub?.plans?.has_custom_domain ?? false);
    const currentCount = tenants.length;

    return {
      tenants,
      quota: {
        maxStores,
        currentCount,
        planName,
        hasCustomDomain,
        canCreateMore: currentCount < maxStores,
      },
    };
  });

// ---------- CHECKOUT REVIEW (Screen 19) ----------

export type CheckoutErrorCode = "NOT_FOUND" | "FORBIDDEN" | "TRANSIENT";

function createCheckoutError(code: CheckoutErrorCode, message: string): Error {
  return new Error(JSON.stringify({ code, message }));
}

export function computeReferenceCode(subscriptionId: string): string {
  const hex = subscriptionId.replace(/-/g, "").toUpperCase();
  const chars = hex.slice(-8);
  let sum = 0;
  for (const c of chars) {
    const digit = parseInt(c, 16);
    if (!Number.isNaN(digit)) sum += digit;
  }
  return `REF-${chars}-${sum % 10}`;
}

export const getCheckoutContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ subscriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { setResponseHeaders } = await import("@tanstack/react-start/server");
    try {
      setResponseHeaders(new Headers({ "Cache-Control": "private, no-store" }));
    } catch {}

    // Verify ownership via account_subscriptions
    const { data: ownerCheck, error: ownerErr } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .select("id, user_id")
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (ownerErr) throw createCheckoutError("TRANSIENT", ownerErr.message);
    if (!ownerCheck) throw createCheckoutError("NOT_FOUND", "Subscription not found");
    if (ownerCheck.user_id !== userId) {
      throw createCheckoutError("FORBIDDEN", "You don't have access to this checkout.");
    }

    const { data: sub, error } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .select(
        "id, status, currency, created_at, price_usd_snapshot, plan_id, reference_code, instructions_email_sent_at, user_id, plans(id, slug, name, price_usd, interval, currency, is_active), payment_proofs:payment_proofs(id, status, created_at, reference_number)",
      )
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (error) throw createCheckoutError("TRANSIENT", error.message);
    if (!sub) throw createCheckoutError("NOT_FOUND", "Subscription not found");

    const subAny = sub as any;
    const livePriceUsd = subAny.plans?.price_usd != null ? Number(subAny.plans.price_usd) : null;
    const snapshotUsd =
      subAny.price_usd_snapshot != null
        ? Number(subAny.price_usd_snapshot)
        : livePriceUsd;

    const planRemoved = !subAny.plans || subAny.plans.is_active === false;
    const priceChanged =
      livePriceUsd != null &&
      snapshotUsd != null &&
      Math.abs(livePriceUsd - snapshotUsd) > 0.005;

    let referenceCode: string = subAny.reference_code ?? "";
    if (!referenceCode) {
      referenceCode = computeReferenceCode(subAny.id);
      await (supabaseAdmin as any).from("account_subscriptions" as any)
        .update({ reference_code: referenceCode })
        .eq("id", subAny.id);
    }

    return {
      subscription: sub,
      priceSnapshotUsd: snapshotUsd,
      livePriceUsd,
      priceChanged,
      planRemoved,
      referenceCode,
      instructionsEmailLastSentAt: (subAny.instructions_email_sent_at as string | null) ?? null,
    };
  });

// ---------- RESEND BANK INSTRUCTIONS EMAIL (Screen 20) ----------

export type ResendInstructionsErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "WRONG_STATUS"
  | "RATE_LIMITED"
  | "EMAIL_NOT_CONFIGURED"
  | "NO_RECIPIENT"
  | "NO_ACTIVE_METHODS"
  | "TRANSIENT";

function createResendError(
  code: ResendInstructionsErrorCode,
  message: string,
  extra?: Record<string, unknown>,
): Error {
  return new Error(JSON.stringify({ code, message, ...(extra ?? {}) }));
}

function escapeHtmlBasic(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const RESEND_COOLDOWN_SECONDS = 60;

export const resendBankInstructionsEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ subscriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    assertSameOrigin();

    const recipient: string | undefined =
      typeof (claims as any)?.email === "string" ? (claims as any).email : undefined;
    if (!recipient) {
      throw createResendError(
        "NO_RECIPIENT",
        "We don't have an email address on file for your account.",
      );
    }

    // Query account_subscriptions instead of subscriptions
    const { data: sub, error: sErr } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .select(
        "id, status, currency, reference_code, instructions_email_sent_at, price_usd_snapshot, user_id, plans(name, price_usd, interval, currency)",
      )
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (sErr) throw createResendError("TRANSIENT", sErr.message);
    if (!sub) throw createResendError("NOT_FOUND", "Subscription not found");
    if (sub.user_id !== userId) {
      throw createResendError("FORBIDDEN", "Not your subscription.");
    }
    if (sub.status !== "pending_payment") {
      throw createResendError(
        "WRONG_STATUS",
        "This checkout is no longer awaiting payment.",
        { status: sub.status },
      );
    }

    if (sub.instructions_email_sent_at) {
      const last = new Date(sub.instructions_email_sent_at).getTime();
      const ageSec = Math.floor((Date.now() - last) / 1000);
      if (ageSec < RESEND_COOLDOWN_SECONDS) {
        throw createResendError(
          "RATE_LIMITED",
          `Please wait ${RESEND_COOLDOWN_SECONDS - ageSec}s before requesting again.`,
          { retryAfterSeconds: RESEND_COOLDOWN_SECONDS - ageSec },
        );
      }
    }

    const { data: methods, error: mErr } = await supabaseAdmin
      .from("payment_methods")
      .select("kind, label, account_identifier, account_holder, instructions, sort_order")
      .eq("is_active", true)
      .order("sort_order");
    if (mErr) throw createResendError("TRANSIENT", mErr.message);
    if (!methods || methods.length === 0) {
      throw createResendError(
        "NO_ACTIVE_METHODS",
        "No payment methods are currently configured.",
      );
    }

    const referenceCode = sub.reference_code ?? computeReferenceCode(sub.id);
    const planPrice = sub.plans?.price_usd != null ? Number(sub.plans.price_usd) : null;
    const snapshotPrice =
      sub.price_usd_snapshot != null ? Number(sub.price_usd_snapshot) : planPrice;
    const amountUsd = planPrice ?? snapshotPrice ?? 0;
    const currency = sub.currency || sub.plans?.currency || "USD";
    const planName = sub.plans?.name ?? "Subscription";
    // For account-level subs, use the plan name as the store name context
    const storeName = planName;

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      throw createResendError(
        "EMAIL_NOT_CONFIGURED",
        "Email delivery isn't configured. Copy the details on screen and try again later.",
      );
    }
    const from = process.env.EMAIL_FROM ?? "RentWebify <onboarding@rentwebify.com>";

    const methodRowsHtml = methods
      .map((m: any) => {
        const safeLabel = escapeHtmlBasic(String(m.label ?? ""));
        const safeAcct = escapeHtmlBasic(String(m.account_identifier ?? ""));
        const safeHolder = m.account_holder ? escapeHtmlBasic(String(m.account_holder)) : "";
        const safeInstr = m.instructions ? escapeHtmlBasic(String(m.instructions)) : "";
        return `
          <tr>
            <td style="padding:10px 0;border-top:1px solid #eee;">
              <div style="font-weight:600;font-size:14px;color:#111;">${safeLabel}</div>
              <div style="font-size:13px;color:#333;margin-top:2px;">Account: <span style="font-family:Menlo,Consolas,monospace;">${safeAcct}</span></div>
              ${safeHolder ? `<div style="font-size:13px;color:#555;">Beneficiary: ${safeHolder}</div>` : ""}
              ${safeInstr ? `<div style="font-size:12px;color:#666;margin-top:4px;">${safeInstr}</div>` : ""}
            </td>
          </tr>`;
      })
      .join("");

    const methodLinesText = methods
      .map((m: any) =>
        [
          `- ${m.label}`,
          `  Account: ${m.account_identifier}`,
          m.account_holder ? `  Beneficiary: ${m.account_holder}` : null,
          m.instructions ? `  ${m.instructions}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n");

    const amountFormatted = (() => {
      try {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
          maximumFractionDigits: currency.toUpperCase() === "EGP" ? 0 : 2,
        }).format(amountUsd);
      } catch {
        return `${currency} ${amountUsd}`;
      }
    })();

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
        <h1 style="font-size:20px;margin:0 0 8px;">Your RentWebify payment instructions</h1>
        <p style="font-size:14px;color:#555;margin:0 0 20px;">
          Use the details below to complete your transfer for
          <strong>${escapeHtmlBasic(storeName)}</strong> (${escapeHtmlBasic(planName)}).
        </p>
        <div style="background:#f7f7f8;border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:20px;">
          <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.04em;">Reference code</div>
          <div style="font-family:Menlo,Consolas,monospace;font-size:18px;font-weight:700;margin-top:4px;">${escapeHtmlBasic(referenceCode)}</div>
          <div style="font-size:12px;color:#666;margin-top:10px;text-transform:uppercase;letter-spacing:.04em;">Amount due</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px;">${escapeHtmlBasic(amountFormatted)}</div>
        </div>
        <h2 style="font-size:15px;margin:0 0 4px;">Payment methods</h2>
        <table style="width:100%;border-collapse:collapse;">${methodRowsHtml}</table>
        <p style="font-size:12px;color:#888;margin-top:24px;">
          Important: include the reference code <strong>${escapeHtmlBasic(referenceCode)}</strong>
          on your transfer so we can match the payment to your subscription.
        </p>
      </div>
    `;
    const text = [
      `Your RentWebify payment instructions`,
      ``,
      `Plan: ${planName}`,
      `Amount due: ${amountFormatted}`,
      `Reference code: ${referenceCode}`,
      ``,
      `Payment methods:`,
      methodLinesText,
      ``,
      `Important: include the reference code ${referenceCode} on your transfer so we can match the payment.`,
    ].join("\n");

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [recipient],
          subject: `Payment instructions for ${planName} — ${referenceCode}`,
          html,
          text,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[billing] resendBankInstructionsEmail Resend failed", res.status, body);
        throw createResendError("TRANSIENT", "Email service rejected the request. Try again in a moment.");
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("{")) throw err;
      console.error("[billing] resendBankInstructionsEmail threw", err);
      throw createResendError("TRANSIENT", "Couldn't reach the email service. Try again in a moment.");
    }

    const sentAt = new Date().toISOString();
    await (supabaseAdmin as any).from("account_subscriptions" as any)
      .update({ instructions_email_sent_at: sentAt })
      .eq("id", sub.id);

    return { ok: true, sentAt, recipient };
  });

// ---------- CANCEL pending subscription ----------

export const cancelPendingSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ subscriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Atomic, status-scoped cancel. The status filter is part of the WHERE
    // clause itself so we can never accidentally cancel an `active` row even
    // if the caller passes a stale/wrong id. Ownership is enforced the same
    // way. We rely on the row count to detect "nothing matched".
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .update({ status: "cancelled" })
      .eq("id", data.subscriptionId)
      .eq("user_id", context.userId)
      .in("status", ["pending_payment", "pending_review"])
      .select("id");
    if (error) throw new Error(error.message);
    const cancelled = Array.isArray(rows) ? rows.length : 0;
    if (cancelled === 0) {
      throw new Error(
        "Only pending checkouts can be cancelled. This subscription is no longer pending or does not belong to you.",
      );
    }
    return { ok: true, cancelled };
  });

// ---------- SUPERSEDE pending proof (edit/resend) ----------

export const supersedePendingProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ subscriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: sub, error: sErr } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .select("id, user_id")
      .eq("id", data.subscriptionId)
      .single();
    if (sErr || !sub) throw new Error("Subscription not found");
    if (sub.user_id !== context.userId) throw new Error("Forbidden");

    const { error } = await supabaseAdmin
      .from("payment_proofs")
      .update({ status: "rejected", notes: "Superseded by resubmission" } as any)
      .eq("account_subscription_id" as any, data.subscriptionId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .update({ status: "pending_payment" })
      .eq("id", data.subscriptionId);

    return { ok: true };
  });

// ---------- READ: pending-only subscription (used by cancel UI) ----------
//
// Returns ONLY the row whose status is `pending_payment` or `pending_review`.
// Callers that drive a "cancel pending" affordance MUST source the id from
// here — never from `getMyAccountSubscription`, which returns the latest row
// regardless of status and can race against a freshly-created pending row.

export const getMyPendingSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (supabaseAdmin as any)
      .from("account_subscriptions" as any)
      .select("id, status, plan_id, created_at")
      .eq("user_id", context.userId)
      .in("status", ["pending_payment", "pending_review"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { subscription: data ?? null };
  });

// ---------- KILL-SWITCH: manual tenant suspension ----------
//
// Mirrors the `suspend_account_tenants` DB trigger for cases where we need to
// run the suspension imperatively (admin recovery, historical backfill, or
// environments that haven't picked up the trigger yet). Idempotent.
//
// Authorization: the caller must either be an admin OR be the owner of the
// targeted user's tenants. We re-check ownership server-side.

export const suspendAccountTenants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid().optional(),
        accountSubscriptionId: z.string().uuid().optional(),
        reason: z.string().trim().min(3).max(120).default("account_subscription_cancelled"),
      })
      .refine((v) => v.userId || v.accountSubscriptionId, {
        message: "Provide userId or accountSubscriptionId",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = supabaseAdmin as any;

    // Resolve target user id.
    let targetUserId = data.userId ?? null;
    if (!targetUserId && data.accountSubscriptionId) {
      const { data: sub, error: sErr } = await sb
        .from("account_subscriptions")
        .select("user_id")
        .eq("id", data.accountSubscriptionId)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);
      if (!sub) throw new Error("Subscription not found");
      targetUserId = sub.user_id as string;
    }
    if (!targetUserId) throw new Error("Could not resolve target user");

    // Authorization: self OR admin.
    if (targetUserId !== context.userId) {
      const { data: roleRow, error: rErr } = await sb
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (rErr) throw new Error(rErr.message);
      if (!roleRow) throw new Error("Forbidden");
    }

    // Guard: do NOT suspend if the user still has an active account subscription.
    const { data: activeRow, error: aErr } = await sb
      .from("account_subscriptions")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (activeRow) {
      return { ok: true, suspended: 0, reason: "user_has_active_subscription" };
    }

    const nowIso = new Date().toISOString();
    const { data: rows, error: uErr } = await sb
      .from("tenants")
      .update({
        status: "suspended",
        suspended_at: nowIso,
        suspended_reason: data.reason,
      })
      .eq("owner_id", targetUserId)
      .eq("status", "active")
      .select("id");
    if (uErr) throw new Error(uErr.message);

    return { ok: true, suspended: Array.isArray(rows) ? rows.length : 0 };
  });