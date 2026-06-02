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
  interval: "monthly" | "quarterly" | string;
  features: string[] | null;
  highlight: boolean;
  sort_order: number;
};

/**
 * Plans rarely change. Cache the full list in module scope for a few minutes
 * so repeat invocations on the same edge isolate are near-instant. Worker
 * isolates are short-lived, so this is a soft cache; it never serves stale
 * data longer than `PLANS_CACHE_TTL_MS`.
 */
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

/**
 * Read the most recent USD→EGP rate from `fx_rates`. No silent fallback —
 * if the table is empty we throw, so the UI must surface the error instead
 * of quoting a wrong EGP total. Hourly refresh comes from
 * `/api/public/cron/fx-rates`. Numeric columns come back as strings from
 * pg, so explicitly cast.
 */
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

const slugRe = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

/**
 * Structured failure encoder for create-time errors. The onboarding wizard
 * unpacks this on the client to route the user back to the owning step
 * (slug → basics, plan → plan, template → template) and flag the field.
 * Falls back to a human-readable string on the wire so any other consumer
 * still gets a usable error message.
 */
export type CreateTenantErrorCode =
  | "SLUG_TAKEN"
  | "PLAN_NOT_AVAILABLE"
  | "PLAN_INTERVAL_MISMATCH"
  | "TEMPLATE_NOT_AVAILABLE";

function createTenantError(
  code: CreateTenantErrorCode,
  message: string,
  step: "basics" | "plan" | "template",
  field?: string,
): Error {
  return new Error(JSON.stringify({ code, message, step, field }));
}

export const createTenantAndSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        slug: z.string().trim().toLowerCase().regex(slugRe, "Use lowercase letters, numbers, and hyphens."),
        planSlug: z.string().min(1).max(60),
        interval: z.enum(["monthly", "quarterly"]),
        niche: z.enum(["retail", "clinic", "pharmacy"]).optional(),
        template: z.enum(TEMPLATE_SLUGS).default("atelier"),
        idempotencyKey: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    assertSameOrigin();

    // -- Idempotency: if this owner has already submitted with the same key,
    // return the existing tenant+subscription instead of creating a duplicate.
    if (data.idempotencyKey) {
      const { data: existingTenant } = await (supabaseAdmin
        .from("tenants") as any)
        .select("id, slug")
        .eq("owner_id", userId)
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (existingTenant) {
        const { data: existingSub } = await supabaseAdmin
          .from("subscriptions")
          .select("id")
          .eq("tenant_id", existingTenant.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingSub) {
          return {
            tenantId: existingTenant.id,
            subscriptionId: existingSub.id,
            slug: existingTenant.slug,
          };
        }
      }
    }

    // Cap brand-new store creation: 5 per owner per hour.
    await enforceRateLimit({
      table: "tenants",
      filters: { owner_id: userId },
      max: 5,
      windowSec: 60 * 60,
      label: "store signups",
    });

    // Authoritative template guard — registry is the single source of truth.
    if (!isTemplateSelectable(data.template)) {
      throw createTenantError(
        "TEMPLATE_NOT_AVAILABLE",
        "That template is not available. Pick another to continue.",
        "template",
        "template",
      );
    }

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("id, slug, price_usd, interval, is_active")
      .eq("slug", data.planSlug)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan || !plan.is_active) {
      throw createTenantError(
        "PLAN_NOT_AVAILABLE",
        "That plan is no longer available. Pick another to continue.",
        "plan",
        "planSlug",
      );
    }
    // Tamper guard: the client-supplied interval must match the plan row.
    if (plan.interval !== data.interval) {
      throw createTenantError(
        "PLAN_INTERVAL_MISMATCH",
        "Plan and billing period do not match. Reselect your plan.",
        "plan",
        "interval",
      );
    }

    // Advisory pre-check — the authoritative anti-race is the UNIQUE index
    // on tenants.slug, which raises Postgres 23505 below if a concurrent
    // signup wins the race.
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

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        owner_id: userId,
        slug: data.slug,
        name: data.name,
        niche: data.niche ?? "retail",
        template: data.template,
        status: "pending",
        idempotency_key: data.idempotencyKey ?? null,
      } as any)
      .select("id, slug, name")
      .single();
    if (tErr) {
      // 23505 = unique_violation. The only unique constraints on this insert
      // path are tenants_slug_key and the partial (owner_id, idempotency_key)
      // index — both indicate the user already has a matching record.
      const code = (tErr as any).code as string | undefined;
      if (code === "23505") {
        // Race: another tab or signup grabbed this slug in the same window.
        throw createTenantError(
          "SLUG_TAKEN",
          "That store address was just taken. Pick another.",
          "basics",
          "slug",
        );
      }
      throw new Error(tErr.message);
    }

    const { data: sub, error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        tenant_id: tenant.id,
        plan_id: plan.id,
        status: "pending_payment",
        currency: "USD",
        price_usd_snapshot: Number(plan.price_usd),
      } as any)
      .select("id")
      .single();
    if (sErr) {
      // Compensating action: the tenant row was created but we couldn't
      // attach a subscription. Roll it back so a retry doesn't strand an
      // orphan tenant with the now-claimed slug.
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      throw new Error(sErr.message);
    }

    return { tenantId: tenant.id, subscriptionId: sub.id, slug: tenant.slug };
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
        // `amountUsd`, `amountEgp` and `fxRate` are intentionally NOT accepted
        // from the client — they are recomputed server-side from the plan
        // price and the live FX rate so an attacker can't quote themselves a
        // 1 USD subscription. Any value the browser sends is ignored.
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    assertSameOrigin();
    const { data: sub, error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .select("id, tenant_id, tenants!inner(owner_id), plans!inner(price_usd)")
      .eq("id", data.subscriptionId)
      .single<{
        id: string;
        tenant_id: string;
        tenants: { owner_id: string };
        plans: { price_usd: number | string };
      }>();
    if (sErr || !sub) throw new Error("Subscription not found");
    if (sub.tenants.owner_id !== userId) throw new Error("Forbidden");

    // Cap proof submissions: 10 per subscription per hour.
    await enforceRateLimit({
      table: "payment_proofs",
      filters: { subscription_id: data.subscriptionId },
      max: 10,
      windowSec: 60 * 60,
      label: "payment proofs",
    });

    // Authoritative amount + FX rate — both pulled from trusted server tables.
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

    const { error } = await supabaseAdmin.from("payment_proofs").insert({
      subscription_id: data.subscriptionId,
      tenant_id: sub.tenant_id,
      payment_method_id: data.paymentMethodId,
      reference_number: data.referenceNumber,
      amount_usd: amountUsd,
      amount_egp: amountEgp,
      fx_rate: fxRate,
      screenshot_path: data.screenshotPath ?? null,
      notes: data.notes ?? null,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true, amountUsd, amountEgp, fxRate };
  });

export const getMyTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("tenants")
      .select("id, slug, name, status, niche, created_at, subscriptions(id, status, period_end, plans(name, slug, price_usd, interval))")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { tenants: data ?? [] };
  });

// ---------- CHECKOUT REVIEW (Screen 19) ----------

/**
 * Structured failure encoder for the Checkout review read. The route
 * component unpacks this to pick the right error panel (404 / 403 / retry)
 * instead of surfacing one generic toast for every failure mode.
 */
export type CheckoutErrorCode = "NOT_FOUND" | "FORBIDDEN" | "TRANSIENT";

function createCheckoutError(code: CheckoutErrorCode, message: string): Error {
  return new Error(JSON.stringify({ code, message }));
}

/**
 * Deterministic, id-derived reference code for a subscription. MUST stay in
 * lock-step with `public.compute_subscription_reference` (SQL) so the value
 * computed in TypeScript matches the value stored at insert time by the
 * subscriptions_set_reference trigger.
 *
 * Format: REF-<last 8 hex chars of UUID, uppercase>-<check digit>
 * Check digit = (sum of hex-digit values) mod 10.
 */
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

    // This payload is user-scoped and must never be shared across users
    // or wrapped in an edge cache.
    const { setResponseHeaders } = await import("@tanstack/react-start/server");
    try {
      setResponseHeaders(new Headers({ "Cache-Control": "private, no-store" }));
    } catch {
      // Header setting is best-effort; route still functions if the helper
      // is unavailable (e.g. unit tests outside the request context).
    }

    // Ownership check first — keeps RLS edge cases out of the nested read.
    const { data: ownerCheck, error: ownerErr } = await supabaseAdmin
      .from("subscriptions")
      .select("id, tenants!inner(owner_id)")
      .eq("id", data.subscriptionId)
      .maybeSingle<{ id: string; tenants: { owner_id: string } }>();
    if (ownerErr) throw createCheckoutError("TRANSIENT", ownerErr.message);
    if (!ownerCheck) throw createCheckoutError("NOT_FOUND", "Subscription not found");
    if (ownerCheck.tenants.owner_id !== userId) {
      throw createCheckoutError("FORBIDDEN", "You don't have access to this checkout.");
    }

    const { data: sub, error } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, status, currency, created_at, tenant_id, price_usd_snapshot, plan_id, reference_code, instructions_email_sent_at, tenants(name, slug), plans(id, slug, name, price_usd, interval, currency, is_active), payment_proofs(id, status, created_at, reference_number)",
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
        : livePriceUsd; // legacy rows without a snapshot fall back to live
    const planRemoved = !subAny.plans || subAny.plans.is_active === false;
    const priceChanged =
      livePriceUsd != null &&
      snapshotUsd != null &&
      Math.abs(livePriceUsd - snapshotUsd) > 0.005;

    // Reference code should always be present (SQL trigger fills it at
    // insert + the Screen 20 backfill migration covers historical rows).
    // Defensive fallback: if a legacy row somehow has NULL, compute +
    // persist on read so it's stable for the next caller.
    let referenceCode: string = subAny.reference_code ?? "";
    if (!referenceCode) {
      referenceCode = computeReferenceCode(subAny.id);
      await (supabaseAdmin.from("subscriptions") as any)
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

/**
 * Structured failure encoder for the bank-instructions email resend. The
 * UI branches on the code to show a contextual toast (cooldown vs not-
 * configured vs transient retry).
 */
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

    const { data: sub, error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, status, currency, reference_code, instructions_email_sent_at, price_usd_snapshot, tenants!inner(owner_id, name, slug), plans(name, price_usd, interval, currency)",
      )
      .eq("id", data.subscriptionId)
      .maybeSingle<{
        id: string;
        status: string;
        currency: string | null;
        reference_code: string | null;
        instructions_email_sent_at: string | null;
        price_usd_snapshot: number | string | null;
        tenants: { owner_id: string; name: string; slug: string };
        plans: { name: string; price_usd: number | string; interval: string; currency: string | null } | null;
      }>();
    if (sErr) throw createResendError("TRANSIENT", sErr.message);
    if (!sub) throw createResendError("NOT_FOUND", "Subscription not found");
    if (sub.tenants.owner_id !== userId) {
      throw createResendError("FORBIDDEN", "Not your subscription.");
    }
    if (sub.status !== "pending_payment") {
      throw createResendError(
        "WRONG_STATUS",
        "This checkout is no longer awaiting payment.",
        { status: sub.status },
      );
    }

    // Per-subscription cooldown. Cheap defensive throttle so a stuck retry
    // loop on the client can't fan out into an email storm.
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
    const storeName = sub.tenants.name;
    const planName = sub.plans?.name ?? "Subscription";

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      throw createResendError(
        "EMAIL_NOT_CONFIGURED",
        "Email delivery isn't configured. Copy the details on screen and try again later.",
      );
    }
    const from = process.env.EMAIL_FROM ?? "CoreWeb <onboarding@resend.dev>";

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
        <h1 style="font-size:20px;margin:0 0 8px;">Your CoreWeb payment instructions</h1>
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
      `Your CoreWeb payment instructions`,
      ``,
      `Store: ${storeName}`,
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
          subject: `Payment instructions for ${storeName} — ${referenceCode}`,
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
    await (supabaseAdmin.from("subscriptions") as any)
      .update({ instructions_email_sent_at: sentAt })
      .eq("id", sub.id);

    return { ok: true, sentAt, recipient };
  });

// ---------- CANCEL pending subscription ----------

export const cancelPendingSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ subscriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: sub, error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status, tenant_id, tenants!inner(owner_id)")
      .eq("id", data.subscriptionId)
      .single<{ id: string; status: string; tenant_id: string; tenants: { owner_id: string } }>();
    if (sErr || !sub) throw new Error("Subscription not found");
    if (sub.tenants.owner_id !== context.userId) throw new Error("Forbidden");
    if (sub.status !== "pending_payment") throw new Error("Only pending checkouts can be cancelled.");

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", data.subscriptionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- SUPERSEDE pending proof (edit/resend) ----------

export const supersedePendingProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ subscriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: sub, error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .select("id, tenant_id, tenants!inner(owner_id)")
      .eq("id", data.subscriptionId)
      .single<{ id: string; tenant_id: string; tenants: { owner_id: string } }>();
    if (sErr || !sub) throw new Error("Subscription not found");
    if (sub.tenants.owner_id !== context.userId) throw new Error("Forbidden");

    // Mark every still-pending proof for this subscription as superseded so
    // the next insert is the canonical one.
    const { error } = await supabaseAdmin
      .from("payment_proofs")
      .update({ status: "rejected", notes: "Superseded by resubmission" })
      .eq("subscription_id", data.subscriptionId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
