import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const sb = supabaseAdmin as any;

function verifySignature(body: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Find an order id token inside a free-text message body. Outbound `wa.me`
// links embed `#order:<uuid>` so the customer's reply still contains it.
const ORDER_TOKEN_RE = /order[:#\-_\s]+([0-9a-f-]{36})/i;
const CONFIRM_WORDS = /\b(confirm|confirmed|تأكيد|اكدت|أكدت|ok|نعم|yes)\b/i;

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      // Provider verification handshake (Meta-style: ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...)
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
        if (!verifyToken) return new Response("not configured", { status: 503 });
        if (mode === "subscribe" && token === verifyToken && challenge) {
          return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
        }
        return new Response("forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
        if (!secret) return new Response("not configured", { status: 503 });

        const body = await request.text();
        const signatureHeader =
          request.headers.get("x-hub-signature-256") ?? request.headers.get("x-signature-256");
        const verified = verifySignature(body, signatureHeader, secret);

        // Always persist the raw event (verified flag tracks trust).
        let payload: any = {};
        try {
          payload = body ? JSON.parse(body) : {};
        } catch {
          payload = { raw: body };
        }

        if (!verified) {
          await sb.from("whatsapp_webhook_events").insert({
            provider: "whatsapp",
            signature: signatureHeader,
            verified: false,
            payload,
            error: "invalid signature",
          });
          return new Response("invalid signature", { status: 401 });
        }

        // Dedupe by Meta's top-level entry id (falls back to first message id).
        // Meta retries non-2xx for up to ~7 days; without dedupe a slow handler
        // or transient 5xx would replay every side-effect.
        const providerEventId: string | null =
          payload?.entry?.[0]?.id ??
          payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id ??
          null;

        if (providerEventId) {
          const { error: dupErr } = await sb
            .from("whatsapp_webhook_events")
            .insert({
              provider: "whatsapp",
              provider_event_id: providerEventId,
              signature: signatureHeader,
              verified: true,
              payload,
              processed_at: null,
            });
          // 23505 = unique_violation → already processed; ack and stop.
          if (dupErr && (dupErr as any).code === "23505") {
            return Response.json({ ok: true, deduped: true });
          }
          if (dupErr) {
            // Storage failed for some other reason — surface 500 so Meta retries.
            return new Response("storage error", { status: 500 });
          }
        }

        // Best-effort: resolve tenant from the "to" number and try to update order status.
        let tenantId: string | null = null;
        let processedError: string | null = null;
        try {
          const entry = payload?.entry?.[0]?.changes?.[0]?.value;
          const toNumber: string | undefined = entry?.metadata?.display_phone_number;
          const message = entry?.messages?.[0];
          const text: string = message?.text?.body ?? message?.button?.text ?? "";

          if (toNumber) {
            const normalized = toNumber.replace(/\D+/g, "");
            const { data: tenant } = await sb
              .from("tenants")
              .select("id")
              .eq("whatsapp_e164", normalized)
              .maybeSingle();
            tenantId = tenant?.id ?? null;
          }

          if (text) {
            const match = text.match(ORDER_TOKEN_RE);
            if (match && CONFIRM_WORDS.test(text)) {
              const orderId = match[1];
              let upd = sb
                .from("orders")
                .update({ status: "confirmed" })
                .eq("id", orderId)
                .eq("status", "whatsapp_sent");
              if (tenantId) upd = upd.eq("tenant_id", tenantId);
              await upd;
            }
          }
        } catch (e: any) {
          processedError = e?.message ?? String(e);
        }

        // Mark the deduped row as processed (or insert a fresh row for events
        // missing a provider_event_id — legacy/test payloads).
        if (providerEventId) {
          await sb
            .from("whatsapp_webhook_events")
            .update({
              tenant_id: tenantId,
              processed_at: new Date().toISOString(),
              error: processedError,
            })
            .eq("provider", "whatsapp")
            .eq("provider_event_id", providerEventId);
        } else {
          await sb.from("whatsapp_webhook_events").insert({
            provider: "whatsapp",
            signature: signatureHeader,
            verified: true,
            tenant_id: tenantId,
            payload,
            processed_at: new Date().toISOString(),
            error: processedError,
          });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
