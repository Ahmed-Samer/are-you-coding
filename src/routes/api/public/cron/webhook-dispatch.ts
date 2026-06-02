import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { backoffDelayMs, signPayload } from "@/lib/webhooks.server";

const sb = supabaseAdmin as any;

const MAX_BATCH = 25;
const MAX_ATTEMPTS = 6;
const HTTP_TIMEOUT_MS = 10_000;
const STUCK_MINUTES = 2;
const MAX_BODY_CAPTURE = 8 * 1024; // 8KB

type ClaimedRow = {
  id: string;
  tenant_id: string;
  endpoint_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  url: string;
  secret: string;
  endpoint_active: boolean;
};

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…[truncated]" : s;
}

function pickHeaders(h: Headers): Record<string, string> {
  const keep = ["content-type", "content-length", "server", "x-request-id", "date"];
  const out: Record<string, string> = {};
  for (const k of keep) {
    const v = h.get(k);
    if (v) out[k] = v;
  }
  return out;
}

async function dispatchOne(row: ClaimedRow): Promise<{
  ok: boolean;
  status: number | null;
  headers: Record<string, string> | null;
  body: string | null;
  duration_ms: number;
  error: string | null;
}> {
  const started = Date.now();

  if (!row.endpoint_active) {
    return {
      ok: false,
      status: null,
      headers: null,
      body: null,
      duration_ms: 0,
      error: "Endpoint disabled",
    };
  }

  const body = JSON.stringify({
    id: row.id,
    event: row.event_type,
    tenant_id: row.tenant_id,
    data: row.payload,
  });
  const timestamp = Math.floor(started / 1000).toString();
  const signature = signPayload(row.secret, body);

  try {
    const res = await fetch(row.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Id": row.id,
        "X-Webhook-Event": row.event_type,
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    let text = "";
    try {
      text = await res.text();
    } catch {
      /* ignore */
    }
    return {
      ok: res.ok,
      status: res.status,
      headers: pickHeaders(res.headers),
      body: text ? truncate(text, MAX_BODY_CAPTURE) : null,
      duration_ms: Date.now() - started,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: null,
      headers: null,
      body: null,
      duration_ms: Date.now() - started,
      error: e?.name === "TimeoutError"
        ? `Timeout after ${HTTP_TIMEOUT_MS}ms`
        : (e?.message ?? "Transport error"),
    };
  }
}

export const Route = createFileRoute("/api/public/cron/webhook-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return new Response("not configured", { status: 503 });
        const header = request.headers.get("authorization") ?? "";
        if (header !== `Bearer ${secret}`) {
          return new Response("unauthorized", { status: 401 });
        }

        // Step 1 — revive stuck in_flight rows.
        const { data: recovered } = await sb.rpc("recover_stuck_webhook_events", {
          p_stale_minutes: STUCK_MINUTES,
        });

        // Step 2 — claim a batch atomically.
        const { data: claimed, error: claimErr } = await sb.rpc("claim_webhook_batch", {
          p_limit: MAX_BATCH,
        });
        if (claimErr) {
          return Response.json({ ok: false, error: claimErr.message }, { status: 500 });
        }

        const rows: ClaimedRow[] = (claimed ?? []) as ClaimedRow[];

        // Step 3 — dispatch in parallel.
        const settled = await Promise.allSettled(
          rows.map(async (row) => ({ row, result: await dispatchOne(row) })),
        );

        let succeeded = 0;
        let failed = 0;
        let dead = 0;

        for (const s of settled) {
          if (s.status !== "fulfilled") continue;
          const { row, result } = s.value;
          const nextAttempt = row.attempt_count + 1;
          const nowIso = new Date().toISOString();

          // Always record the attempt.
          await sb.from("webhook_delivery_attempts").insert({
            event_id: row.id,
            attempt_number: nextAttempt,
            response_status: result.status,
            response_headers: result.headers,
            response_body: result.body,
            duration_ms: result.duration_ms,
            error: result.error,
          });

          if (result.ok) {
            await sb
              .from("webhook_events")
              .update({
                status: "succeeded",
                attempt_count: nextAttempt,
                delivered_at: nowIso,
                last_error: null,
                updated_at: nowIso,
              })
              .eq("id", row.id);
            await sb
              .from("webhook_endpoints")
              .update({ last_success_at: nowIso, updated_at: nowIso })
              .eq("id", row.endpoint_id);
            succeeded++;
          } else if (nextAttempt >= MAX_ATTEMPTS) {
            await sb
              .from("webhook_events")
              .update({
                status: "dead",
                attempt_count: nextAttempt,
                last_error: result.error,
                updated_at: nowIso,
              })
              .eq("id", row.id);
            await sb
              .from("webhook_endpoints")
              .update({ last_failure_at: nowIso, updated_at: nowIso })
              .eq("id", row.endpoint_id);
            dead++;
          } else {
            const nextAt = new Date(Date.now() + backoffDelayMs(nextAttempt)).toISOString();
            await sb
              .from("webhook_events")
              .update({
                status: "failed",
                attempt_count: nextAttempt,
                next_attempt_at: nextAt,
                last_error: result.error,
                updated_at: nowIso,
              })
              .eq("id", row.id);
            await sb
              .from("webhook_endpoints")
              .update({ last_failure_at: nowIso, updated_at: nowIso })
              .eq("id", row.endpoint_id);
            failed++;
          }
        }

        return Response.json({
          ok: true,
          recovered: recovered ?? 0,
          processed: rows.length,
          succeeded,
          failed,
          dead,
        });
      },
    },
  },
});
