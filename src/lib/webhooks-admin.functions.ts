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

// =====================================================================
// 0. Fetch Tenants for Dropdown
// =====================================================================
export const getWebhookTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await sb
      .from("tenants")
      .select("id, name")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

// =====================================================================
// 1. Endpoints Management
// =====================================================================

export const getWebhookEndpoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await sb
      .from("webhook_endpoints")
      .select("id, tenant_id, url, events, is_active, description, created_at, last_success_at, last_failure_at, tenants(name, slug)")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      tenantId: z.string().uuid(),
      url: z.string().url(),
      secret: z.string().min(16),
      events: z.array(z.string()).min(1),
      description: z.string().optional()
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("webhook_endpoints").insert({
      tenant_id: data.tenantId,
      url: data.url,
      secret: data.secret,
      events: data.events,
      description: data.description,
      is_active: true
    });

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "webhook_endpoint.created",
      targetTable: "webhook_endpoints",
      diff: { url: data.url, tenant_id: data.tenantId }
    });

    return { ok: true };
  });

export const toggleWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("webhook_endpoints").update({ is_active: data.isActive, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await sb.from("webhook_endpoints").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =====================================================================
// 2. Events & Deliveries Management
// =====================================================================

export const getWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => 
    z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      statusFilter: z.enum(["all", "pending", "success", "failed"]).default("all")
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let query = sb.from("webhook_events")
      .select("id, event_type, status, attempt_count, last_error, created_at, webhook_endpoints(url), tenants(name)", { count: "exact" });

    if (data.statusFilter !== "all") {
      query = query.eq("status", data.statusFilter);
    }

    const { data: rows, error, count } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw new Error(error.message);

    return { events: rows ?? [], total: count ?? 0 };
  });

export const retryWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    
    // Fetch event
    const { data: event, error: fetchErr } = await sb.from("webhook_events").select("*").eq("id", data.eventId).single();
    if (fetchErr || !event) throw new Error("Event not found");

    // Reset status to pending to be picked up by the worker/cron
    const { error: updateErr } = await sb.from("webhook_events").update({
      status: "pending",
      manual_retry_count: (event.manual_retry_count || 0) + 1,
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", data.eventId);

    if (updateErr) throw new Error(updateErr.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "webhook_event.retried",
      targetTable: "webhook_events",
      targetId: data.eventId,
      diff: { manual_retry: true }
    });

    return { ok: true };
  });

// =====================================================================
// 3. Single Event Detail
// =====================================================================

export const getWebhookEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ eventId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: event, error } = await sb
      .from("webhook_events")
      .select(
        "id, event_type, status, attempt_count, last_error, payload, created_at, tenant_id, endpoint_id, webhook_endpoints(id, url, is_active), tenants(id, name)"
      )
      .eq("id", data.eventId)
      .single();
    if (error) throw new Error(error.message);
    if (!event) throw new Error("Event not found");

    const { data: attempts, error: aErr } = await sb
      .from("webhook_attempts")
      .select("id, attempt_number, response_status, duration_ms, error, response_body, attempted_at")
      .eq("event_id", data.eventId)
      .order("attempt_number", { ascending: true });
    if (aErr) throw new Error(aErr.message);

    return {
      event: {
        id: event.id,
        eventType: event.event_type,
        status: event.status,
        attemptCount: event.attempt_count ?? 0,
        lastError: event.last_error,
        payload: event.payload,
        createdAt: event.created_at,
        tenantId: event.tenant_id,
        tenantName: event.tenants?.name ?? null,
        endpointId: event.endpoint_id ?? event.webhook_endpoints?.id,
        endpointUrl: event.webhook_endpoints?.url ?? "—",
        endpointActive: event.webhook_endpoints?.is_active ?? false,
      },
      attempts: attempts ?? [],
    };
  });

// =====================================================================
// 4. Mark Event Dead
// =====================================================================

export const markWebhookEventDead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ eventId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error } = await sb
      .from("webhook_events")
      .update({
        status: "dead",
        last_error: data.reason ?? "Manually marked dead by admin",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.eventId);
    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "webhook_event.marked_dead",
      targetTable: "webhook_events",
      targetId: data.eventId,
      diff: { reason: data.reason ?? "manual" },
    });

    return { ok: true };
  });

// =====================================================================
// 5. Set Endpoint Active / Inactive
// =====================================================================

export const setEndpointActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      endpointId: z.string().uuid(),
      isActive: z.boolean(),
      reason: z.string().max(500).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error } = await sb
      .from("webhook_endpoints")
      .update({
        is_active: data.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.endpointId);
    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorId: context.userId,
      action: data.isActive ? "webhook_endpoint.enabled" : "webhook_endpoint.disabled",
      targetTable: "webhook_endpoints",
      targetId: data.endpointId,
      diff: { reason: data.reason ?? "admin action" },
    });

    return { ok: true };
  });

// =====================================================================
// 6. KPIs — Aggregate counts for the dashboard tiles
// =====================================================================

export const getWebhookKPIs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ windowDays: z.number().min(1).max(90).default(1) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const since = new Date(Date.now() - data.windowDays * 86400_000).toISOString();

    // Aggregate counts per status
    const { data: rows, error } = await sb
      .from("webhook_events")
      .select("status")
      .gte("created_at", since);
    if (error) throw new Error(error.message);

    const counts = { pending: 0, in_flight: 0, succeeded: 0, failed: 0, dead: 0 };
    for (const r of (rows ?? [])) {
      const s = r.status as keyof typeof counts;
      if (s in counts) counts[s]++;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const successRate = total > 0 ? counts.succeeded / total : 0;

    // P95 latency from attempts in the same window
    const { data: latencies, error: lErr } = await sb
      .from("webhook_attempts")
      .select("duration_ms")
      .gte("attempted_at", since)
      .not("duration_ms", "is", null)
      .order("duration_ms", { ascending: true });

    let p95LatencyMs = 0;
    if (!lErr && latencies && latencies.length > 0) {
      const idx = Math.floor(latencies.length * 0.95);
      p95LatencyMs = latencies[Math.min(idx, latencies.length - 1)]?.duration_ms ?? 0;
    }

    return { counts, successRate, p95LatencyMs };
  });