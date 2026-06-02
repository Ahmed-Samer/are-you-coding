// Server functions for Sprint 2 Abandoned Cart Recovery.
// - syncAbandonedCart: storefront upserts cart state (public, rate-limited)
// - attachCartContact:  storefront attaches phone/email/name to a cart
// - getRecoveredCart:   public lookup by recovery_token (deep link)
// - listAbandonedCarts: owner-only paginated list for the analytics UI
// - getCartRecoveryStats: owner-only KPI snapshot
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSameOrigin, enforceRateLimit } from "@/lib/rate-limit.server";
import { generateRecoveryToken } from "@/lib/abandoned-carts.server";

const sb = supabaseAdmin as any;

// E.164: leading +, 8–15 digits.
const e164 = z.string().trim().regex(/^\+[1-9]\d{7,14}$/);

const cartItemSchema = z.object({
  lineKey: z.string().min(1).max(200),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  variantLabel: z.string().max(200).nullable().optional(),
  name: z.string().min(1).max(200),
  priceCents: z.number().int().min(0).max(100_000_000),
  imageUrl: z.string().max(2048).nullable().optional(),
  quantity: z.number().int().min(1).max(999),
});

async function ensureTenantOwner(tenantId: string, userId: string) {
  const { data, error } = await sb
    .from("tenants")
    .select("id, owner_id, name, slug, currency, cart_recovery_enabled, cart_recovery_delay_minutes")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.owner_id !== userId) throw new Error("Forbidden");
  return data as {
    id: string; owner_id: string; name: string; slug: string;
    currency: string;
    cart_recovery_enabled: boolean;
    cart_recovery_delay_minutes: number;
  };
}

// =================== PUBLIC STOREFRONT ENDPOINTS ====================

/**
 * Upsert the live cart state for a storefront session. Public — no auth.
 * Rate-limited per session+tenant to absorb the debounced sync from the client.
 */
export const syncAbandonedCart = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      sessionId: z.string().min(8).max(120),
      items: z.array(cartItemSchema).max(100),
      subtotalCents: z.number().int().min(0).max(1_000_000_000),
      currency: z.string().min(3).max(8),
      promoCode: z.string().trim().max(64).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    assertSameOrigin();
    await enforceRateLimit({
      table: "abandoned_carts",
      filters: { tenant_id: data.tenantId, session_id: data.sessionId },
      timestampColumn: "updated_at",
      max: 30,
      windowSec: 60,
      label: "cart sync calls",
    });

    const { data: existing, error: selErr } = await sb
      .from("abandoned_carts")
      .select("id, recovery_token, status")
      .eq("tenant_id", data.tenantId)
      .eq("session_id", data.sessionId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    const now = new Date().toISOString();

    if (!existing) {
      const token = generateRecoveryToken();
      const { data: inserted, error } = await sb
        .from("abandoned_carts")
        .insert({
          tenant_id: data.tenantId,
          session_id: data.sessionId,
          items: data.items,
          subtotal_cents: data.subtotalCents,
          currency: data.currency,
          promo_code: data.promoCode ?? null,
          recovery_token: token,
          status: "active",
          last_activity_at: now,
        })
        .select("id, recovery_token")
        .single();
      if (error) throw new Error(error.message);
      return { id: inserted.id, recoveryToken: inserted.recovery_token };
    }

    // Once converted/recovered we don't keep mutating — just no-op.
    if (existing.status === "converted" || existing.status === "recovered") {
      return { id: existing.id, recoveryToken: existing.recovery_token };
    }

    const { error } = await sb
      .from("abandoned_carts")
      .update({
        items: data.items,
        subtotal_cents: data.subtotalCents,
        currency: data.currency,
        promo_code: data.promoCode ?? null,
        status: "active",                 // returning user resets the timer
        abandoned_at: null,
        last_activity_at: now,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { id: existing.id, recoveryToken: existing.recovery_token };
  });

/**
 * Attach customer contact (phone is the recovery channel). Public — no auth.
 * Phone is validated as E.164; email/name optional. Only updates fields that
 * are provided (so the phone-blur handler doesn't wipe name).
 */
export const attachCartContact = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      sessionId: z.string().min(8).max(120),
      customerName: z.string().trim().min(1).max(120).optional(),
      customerPhone: e164.optional(),
      customerEmail: z.string().trim().toLowerCase().email().max(254).optional(),
      consent: z.literal(true),       // explicit storefront acknowledgement
    }).parse(i),
  )
  .handler(async ({ data }) => {
    assertSameOrigin();
    await enforceRateLimit({
      table: "abandoned_carts",
      filters: { tenant_id: data.tenantId, session_id: data.sessionId },
      timestampColumn: "updated_at",
      max: 20,
      windowSec: 60,
      label: "contact updates",
    });

    const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
    if (data.customerName) patch.customer_name = data.customerName;
    if (data.customerPhone) patch.customer_phone = data.customerPhone;
    if (data.customerEmail) patch.customer_email = data.customerEmail;

    const { data: row, error } = await sb
      .from("abandoned_carts")
      .update(patch)
      .eq("tenant_id", data.tenantId)
      .eq("session_id", data.sessionId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, id: row?.id ?? null };
  });

/**
 * Resolve a recovery_token from a deep link. Public, GET.
 * Records the click (best-effort) so the merchant analytics see CTR.
 */
export const getRecoveredCart = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z.object({ token: z.string().min(20).max(120) }).parse(i),
  )
  .handler(async ({ data }) => {
    const { data: cart, error } = await sb
      .from("abandoned_carts")
      .select("id, tenant_id, session_id, items, subtotal_cents, currency, promo_code, status, customer_name, customer_phone, customer_email")
      .eq("recovery_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cart) return { found: false as const };

    // Mark the most-recent queued/sent attempt as clicked. Fire-and-forget.
    try {
      const { data: lastAttempt } = await sb
        .from("cart_recovery_attempts")
        .select("id, status")
        .eq("cart_id", cart.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastAttempt && (lastAttempt.status === "sent" || lastAttempt.status === "queued")) {
        await sb
          .from("cart_recovery_attempts")
          .update({ status: "clicked", clicked_at: new Date().toISOString() })
          .eq("id", lastAttempt.id);
      }
    } catch (e) {
      console.error("[recovered-cart] click track failed", (e as Error).message);
    }

    return {
      found: true as const,
      cart: {
        id: cart.id,
        tenantId: cart.tenant_id,
        sessionId: cart.session_id,
        items: cart.items,
        subtotalCents: cart.subtotal_cents,
        currency: cart.currency,
        promoCode: cart.promo_code,
        status: cart.status,
        customerName: cart.customer_name,
        customerPhone: cart.customer_phone,
        customerEmail: cart.customer_email,
      },
    };
  });

// =================== OWNER / MERCHANT ENDPOINTS =====================

export const listAbandonedCarts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      status: z
        .enum(["active", "abandoned", "recovered", "expired", "converted"])
        .optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await ensureTenantOwner(data.tenantId, context.userId);
    let q = sb
      .from("abandoned_carts")
      .select("id, customer_name, customer_phone, customer_email, items, subtotal_cents, currency, status, last_activity_at, abandoned_at, recovered_order_id, created_at")
      .eq("tenant_id", data.tenantId)
      .order("last_activity_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { carts: rows ?? [] };
  });

export const getCartRecoveryStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      windowDays: z.number().int().min(1).max(365).default(30),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await ensureTenantOwner(data.tenantId, context.userId);
    const since = new Date(Date.now() - data.windowDays * 86_400_000).toISOString();

    // Header counts via head=true; cheap and index-friendly.
    const baseQ = () =>
      sb
        .from("abandoned_carts")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId)
        .gte("created_at", since);

    const [{ count: totalCarts }, { count: abandonedCount }, { count: recoveredCount }] =
      await Promise.all([
        baseQ(),
        baseQ().in("status", ["abandoned", "expired", "recovered", "converted"]),
        baseQ().in("status", ["recovered", "converted"]),
      ]);

    // Recovered $ — small fetch is fine; cap at 1k rows.
    const { data: recoveredRows, error: recErr } = await sb
      .from("abandoned_carts")
      .select("subtotal_cents")
      .eq("tenant_id", data.tenantId)
      .in("status", ["recovered", "converted"])
      .gte("created_at", since)
      .limit(1000);
    if (recErr) throw new Error(recErr.message);
    const recoveredCents = (recoveredRows ?? []).reduce(
      (s: number, r: any) => s + (r.subtotal_cents ?? 0),
      0,
    );

    const [{ count: sentCount }, { count: clickedCount }] = await Promise.all([
      sb.from("cart_recovery_attempts").select("*", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId).eq("status", "sent").gte("created_at", since),
      sb.from("cart_recovery_attempts").select("*", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId).eq("status", "clicked").gte("created_at", since),
    ]);

    const abandoned = abandonedCount ?? 0;
    const recovered = recoveredCount ?? 0;
    return {
      windowDays: data.windowDays,
      totalCarts: totalCarts ?? 0,
      abandoned,
      recovered,
      recoveryRate: abandoned > 0 ? recovered / abandoned : 0,
      recoveredCents,
      messagesSent: sentCount ?? 0,
      messagesClicked: clickedCount ?? 0,
    };
  });

// ============ Owner-only: tenant recovery settings mutation ============

export const updateCartRecoverySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      enabled: z.boolean(),
      delayMinutes: z.union([z.literal(30), z.literal(60), z.literal(120), z.literal(360)]),
      messageTemplate: z.string().trim().max(1000).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await ensureTenantOwner(data.tenantId, context.userId);
    const { error } = await sb
      .from("tenants")
      .update({
        cart_recovery_enabled: data.enabled,
        cart_recovery_delay_minutes: data.delayMinutes,
        cart_recovery_message_template: data.messageTemplate ?? null,
      })
      .eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });