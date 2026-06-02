import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const sb = supabaseAdmin as any;

/** Generate a random webhook signing secret (base64, 32 bytes). */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("base64");
}

/** HMAC-SHA256 hex signature of the raw JSON body. */
export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Constant-time verification for receiver-side use (exported for symmetry/tests). */
export function verifySignature(secret: string, body: string, signature: string): boolean {
  const expected = signPayload(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Enqueue a webhook event for every active endpoint subscribed to `eventType`.
 * Fire-and-forget from the caller's POV — never blocks on HTTP I/O.
 * Returns the number of rows enqueued (one per matching endpoint).
 */
export async function enqueueWebhookEvent(input: {
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<number> {
  const { data: endpoints, error } = await sb
    .from("webhook_endpoints")
    .select("id, events")
    .eq("tenant_id", input.tenantId)
    .eq("is_active", true);

  if (error) {
    console.error("[webhooks] endpoint lookup failed", error.message);
    return 0;
  }

  const matches = (endpoints ?? []).filter(
    (e: { events: string[] }) =>
      Array.isArray(e.events) && e.events.includes(input.eventType),
  );

  if (matches.length === 0) return 0;

  const rows = matches.map((e: { id: string }) => ({
    tenant_id: input.tenantId,
    endpoint_id: e.id,
    event_type: input.eventType,
    payload: input.payload,
    status: "pending",
    next_attempt_at: new Date().toISOString(),
  }));

  const { error: insErr } = await sb.from("webhook_events").insert(rows);
  if (insErr) {
    console.error("[webhooks] enqueue insert failed", insErr.message);
    return 0;
  }
  return rows.length;
}

/**
 * Exponential backoff with jitter for the dispatcher.
 *   attempt = 1 → ~30s
 *   attempt = 2 → ~1m
 *   attempt = 3 → ~2m … capped at 1h.
 */
export function backoffDelayMs(attempt: number): number {
  const base = 30_000;
  const cap = 60 * 60 * 1000;
  const exp = Math.min(base * Math.pow(2, Math.max(0, attempt - 1)), cap);
  const jitter = Math.floor(Math.random() * 10_000);
  return exp + jitter;
}
