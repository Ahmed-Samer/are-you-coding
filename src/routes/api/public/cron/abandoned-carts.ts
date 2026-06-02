// Cron: flips qualifying `active` carts to `abandoned`, sends one WhatsApp
// recovery message via Meta Cloud API, and expires very old rows. Designed
// to run every ~10 minutes. MVP cap: 1 attempt per cart.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendWhatsAppRecovery,
  formatMoney,
} from "@/lib/abandoned-carts.server";
import { enqueueWebhookEvent } from "@/lib/webhooks.server";

const sb = supabaseAdmin as any;

const BATCH = 50;
const EXPIRE_AFTER_DAYS = 30;

function requireCronAuth(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("not configured", { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  return null;
}

function buildRecoveryUrl(origin: string, slug: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/store/${encodeURIComponent(slug)}?recover=${encodeURIComponent(token)}`;
}

export const Route = createFileRoute("/api/public/cron/abandoned-carts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = requireCronAuth(request);
        if (auth) return auth;

        const origin = new URL(request.url).origin;

        // ---- 1. Expire very stale carts (>30 days inactivity, never recovered)
        const expireCutoff = new Date(
          Date.now() - EXPIRE_AFTER_DAYS * 86_400_000,
        ).toISOString();
        await sb
          .from("abandoned_carts")
          .update({ status: "expired" })
          .in("status", ["active", "abandoned"])
          .lt("last_activity_at", expireCutoff);

        // ---- 2. Find carts to abandon + dispatch.
        // We can't express tenant-specific `delay_minutes` in one SELECT, so
        // we pull every candidate older than the minimum allowed delay (30m)
        // and filter per-tenant in app code. Cheap enough at MVP scale.
        // Atomic claim — SELECT … FOR UPDATE SKIP LOCKED so two cron workers
        // can't pick the same cart. The RPC sets `claimed_at = now()` and
        // returns the locked rows; it pre-filters by min-age (30m), phone
        // presence, and non-empty items. Per-tenant delay_minutes is still
        // enforced in app code below since it varies per tenant.
        const { data: candidates, error: selErr } = await sb.rpc(
          "claim_abandoned_cart_batch",
          { p_limit: BATCH, p_min_age_minutes: 30, p_stale_minutes: 10 },
        );
        if (selErr) {
          return Response.json({ ok: false, error: selErr.message }, { status: 500 });
        }

        const results: Array<{ id: string; result: string }> = [];
        if (!candidates || candidates.length === 0) {
          return Response.json({ ok: true, processed: 0, results });
        }

        // Batch-load the tenant rows we need (delay/template/slug/whatsapp).
        const tenantIds = Array.from(new Set(candidates.map((c: any) => c.tenant_id)));
        const { data: tenantRows, error: tErr } = await sb
          .from("tenants")
          .select("id, name, slug, currency, whatsapp_e164, cart_recovery_enabled, cart_recovery_delay_minutes")
          .in("id", tenantIds);
        if (tErr) {
          return Response.json({ ok: false, error: tErr.message }, { status: 500 });
        }
        const tenantMap = new Map<string, any>(
          (tenantRows ?? []).map((t: any) => [t.id, t]),
        );

        for (const cart of candidates) {
          const tenant = tenantMap.get(cart.tenant_id);
          if (!tenant || !tenant.cart_recovery_enabled || !tenant.whatsapp_e164) {
            results.push({ id: cart.id, result: "skipped_tenant" });
            continue;
          }

          // Respect per-tenant delay.
          const ageMs = Date.now() - new Date(cart.last_activity_at).getTime();
          if (ageMs < (tenant.cart_recovery_delay_minutes ?? 60) * 60_000) {
            results.push({ id: cart.id, result: "too_soon" });
            continue;
          }

          // MVP de-dup: only one attempt ever.
          const { count: priorAttempts } = await sb
            .from("cart_recovery_attempts")
            .select("*", { count: "exact", head: true })
            .eq("cart_id", cart.id);
          if ((priorAttempts ?? 0) >= 1) {
            // Already attempted; just flip status if still active.
            await sb
              .from("abandoned_carts")
              .update({ status: "abandoned", abandoned_at: new Date().toISOString() })
              .eq("id", cart.id)
              .eq("status", "active");
            results.push({ id: cart.id, result: "already_attempted" });
            continue;
          }

          const items = Array.isArray(cart.items) ? cart.items : [];
          const itemCount = items.reduce(
            (s: number, it: any) => s + (Number(it?.quantity) || 0),
            0,
          );
          const recoveryUrl = buildRecoveryUrl(origin, tenant.slug, cart.recovery_token);

          const dispatch = await sendWhatsAppRecovery({
            toE164: cart.customer_phone,
            storeName: tenant.name,
            customerName: cart.customer_name,
            itemCount,
            subtotalDisplay: formatMoney(cart.subtotal_cents, cart.currency),
            recoveryUrl,
          });

          await sb.from("cart_recovery_attempts").insert({
            cart_id: cart.id,
            tenant_id: cart.tenant_id,
            channel: "whatsapp",
            sent_to: cart.customer_phone,
            status: dispatch.ok ? "sent" : "failed",
            attempt_number: 1,
            sent_at: dispatch.ok ? new Date().toISOString() : null,
            provider_message_id: dispatch.ok ? dispatch.providerMessageId : null,
            error: dispatch.ok ? null : dispatch.error,
          });

          await sb
            .from("abandoned_carts")
            .update({
              status: "abandoned",
              abandoned_at: new Date().toISOString(),
            })
            .eq("id", cart.id);

          // Fire-and-forget webhook notification.
          void enqueueWebhookEvent({
            tenantId: cart.tenant_id,
            eventType: "cart.abandoned",
            payload: {
              cart_id: cart.id,
              tenant_id: cart.tenant_id,
              session_id: cart.session_id,
              customer_name: cart.customer_name,
              customer_phone: cart.customer_phone,
              items: cart.items,
              subtotal_cents: cart.subtotal_cents,
              currency: cart.currency,
              recovery_token: cart.recovery_token,
              recovery_url: recoveryUrl,
              whatsapp_dispatched: dispatch.ok,
              abandoned_at: new Date().toISOString(),
            },
          }).catch((e: unknown) => console.error("[cron/abandoned-carts] webhook enqueue failed", e));

          results.push({ id: cart.id, result: dispatch.ok ? "sent" : `failed:${dispatch.error}` });
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});