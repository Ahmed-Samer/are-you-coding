import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAuditLog } from "@/lib/audit.server";

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

const StatusEnum = z.enum(["pending", "in_flight", "succeeded", "failed", "dead"]);

// ---------------------------------------------------------------- KPIs ------
export const getWebhookKPIs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ windowDays: z.number().int().min(1).max(90).default(1) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const since = new Date(Date.now() - data.windowDays * 86_400_000).toISOString();

    const { data: rows, error } = await sb
      .from("webhook_events")
      .select("status")
      .gte("created_at", since);
    if (error) throw new Error(error.message);

    const counts: Record<string, number> = {
      pending: 0,
      in_flight: 0,
      succeeded: 0,
      failed: 0,
      dead: 0,
    };
    for (const r of rows ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const total = (rows ?? []).length;
    const successRate = total ? counts.succeeded / total : 0;

    // Best-effort P95 latency from attempts (last windowDays).
    const { data: durations } = await sb
      .from("webhook_delivery_attempts")
      .select("duration_ms")
      .gte("attempted_at", since)
      .not("duration_ms", "is", null)
      .order("duration_ms", { ascending: true })
      .limit(5_000);
    let p95 = 0;
    if (durations && durations.length) {
      const arr = durations.map((d: { duration_ms: number }) => d.duration_ms);
      p95 = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))];
    }

    return { counts, total, successRate, p95LatencyMs: p95 };
  });

// -------------------------------------------------------------- list events -
export const listWebhookEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        status: z.array(StatusEnum).optional(),
        eventType: z.string().trim().min(1).max(100).optional(),
        endpointSearch: z.string().trim().min(1).max(200).optional(),
        tenantId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = sb
      .from("webhook_events")
      .select(
        "id, tenant_id, endpoint_id, event_type, status, attempt_count, last_error, created_at, next_attempt_at, delivered_at, webhook_endpoints!inner(url, is_active), tenants(name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.status?.length) q = q.in("status", data.status);
    if (data.eventType) q = q.eq("event_type", data.eventType);
    if (data.tenantId) q = q.eq("tenant_id", data.tenantId);
    if (data.endpointSearch) {
      q = q.ilike("webhook_endpoints.url", `%${data.endpointSearch}%`);
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    return {
      rows: (rows ?? []).map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        tenantName: r.tenants?.name ?? null,
        endpointId: r.endpoint_id,
        endpointUrl: r.webhook_endpoints?.url ?? null,
        endpointActive: r.webhook_endpoints?.is_active ?? false,
        eventType: r.event_type,
        status: r.status,
        attemptCount: r.attempt_count,
        lastError: r.last_error,
        createdAt: r.created_at,
        nextAttemptAt: r.next_attempt_at,
        deliveredAt: r.delivered_at,
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// --------------------------------------------------------------- get event --
export const getWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ eventId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: evt, error } = await sb
      .from("webhook_events")
      .select(
        "id, tenant_id, endpoint_id, event_type, payload, status, attempt_count, manual_retry_count, last_error, created_at, next_attempt_at, claimed_at, delivered_at, webhook_endpoints(url, is_active, description), tenants(name)",
      )
      .eq("id", data.eventId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!evt) throw new Error("Event not found");

    const { data: attempts, error: aerr } = await sb
      .from("webhook_delivery_attempts")
      .select("id, attempt_number, attempted_at, response_status, response_headers, response_body, duration_ms, error")
      .eq("event_id", data.eventId)
      .order("attempt_number", { ascending: false });
    if (aerr) throw new Error(aerr.message);

    return {
      event: {
        id: evt.id,
        tenantId: evt.tenant_id,
        tenantName: evt.tenants?.name ?? null,
        endpointId: evt.endpoint_id,
        endpointUrl: evt.webhook_endpoints?.url ?? null,
        endpointActive: evt.webhook_endpoints?.is_active ?? false,
        endpointDescription: evt.webhook_endpoints?.description ?? null,
        eventType: evt.event_type,
        payload: evt.payload,
        status: evt.status,
        attemptCount: evt.attempt_count,
        manualRetryCount: evt.manual_retry_count,
        lastError: evt.last_error,
        createdAt: evt.created_at,
        nextAttemptAt: evt.next_attempt_at,
        claimedAt: evt.claimed_at,
        deliveredAt: evt.delivered_at,
      },
      attempts: attempts ?? [],
    };
  });

// ---------------------------------------------------------- retry / mark ---
export const retryWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ eventId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: evt, error } = await sb
      .from("webhook_events")
      .select("id, status, manual_retry_count")
      .eq("id", data.eventId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!evt) throw new Error("Event not found");

    const { error: uerr } = await sb
      .from("webhook_events")
      .update({
        status: "pending",
        next_attempt_at: new Date().toISOString(),
        manual_retry_count: (evt.manual_retry_count ?? 0) + 1,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.eventId);
    if (uerr) throw new Error(uerr.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "webhook.manual_retry",
      targetTable: "webhook_events",
      targetId: data.eventId,
      diff: { previousStatus: evt.status },
    });
    return { ok: true };
  });

export const markWebhookEventDead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      eventId: z.string().uuid(),
      reason: z.string().trim().min(1).max(500),
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await sb
      .from("webhook_events")
      .update({
        status: "dead",
        last_error: `[manual] ${data.reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.eventId);
    if (error) throw new Error(error.message);
    await writeAuditLog({
      actorId: context.userId,
      action: "webhook.mark_dead",
      targetTable: "webhook_events",
      targetId: data.eventId,
      diff: { reason: data.reason },
    });
    return { ok: true };
  });

export const setEndpointActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      endpointId: z.string().uuid(),
      isActive: z.boolean(),
      reason: z.string().trim().min(1).max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await sb
      .from("webhook_endpoints")
      .update({ is_active: data.isActive, updated_at: new Date().toISOString() })
      .eq("id", data.endpointId);
    if (error) throw new Error(error.message);
    await writeAuditLog({
      actorId: context.userId,
      action: data.isActive ? "webhook.endpoint_enabled" : "webhook.endpoint_disabled",
      targetTable: "webhook_endpoints",
      targetId: data.endpointId,
      diff: { reason: data.reason ?? null },
    });
    return { ok: true };
  });
