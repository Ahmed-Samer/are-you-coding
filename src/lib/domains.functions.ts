import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enforceRateLimit } from "@/lib/rate-limit.server";

const sb = supabaseAdmin as any;

const hostRe = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;

async function assertOwnerOfTenant(tenantId: string, userId: string) {
  const { data, error } = await sb
    .from("tenants")
    .select("id, owner_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.owner_id !== userId) throw new Error("Forbidden");
}

export const listMyDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwnerOfTenant(data.tenantId, context.userId);
    const { data: rows, error } = await sb
      .from("domains")
      .select("id, host, kind, status, verification_token, verified_at, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { domains: rows ?? [] };
  });

export const addDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      host: z.string().trim().toLowerCase().min(3).max(253).regex(hostRe),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOfTenant(data.tenantId, context.userId);
    const { data: existing } = await sb.from("domains").select("id").eq("host", data.host).maybeSingle();
    if (existing) throw new Error("Domain already registered.");
    const { data: row, error } = await sb
      .from("domains")
      .insert({
        tenant_id: data.tenantId,
        host: data.host,
        kind: "custom",
        status: "pending",
      })
      .select("id, host, verification_token")
      .single();
    if (error) throw new Error(error.message);
    return { domain: row };
  });

export const removeDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ tenantId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOfTenant(data.tenantId, context.userId);
    const { data: d } = await sb
      .from("domains")
      .select("id, kind")
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!d) throw new Error("Not found");
    if (d.kind === "subdomain") throw new Error("Cannot remove the primary subdomain.");
    const { error } = await sb.from("domains").delete().eq("id", data.id).eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const triggerDomainVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ tenantId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOfTenant(data.tenantId, context.userId);
    await enforceRateLimit({
      table: "domain_verification_attempts",
      filters: { domain_id: data.id },
      max: 10,
      windowSec: 3600,
      label: "domain verification attempts",
    });
    const { data: d, error } = await sb
      .from("domains")
      .select("id, host, verification_token, status")
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!d) throw new Error("Not found");

    // Best-effort TXT lookup via Cloudflare DoH.
    let found: string | null = null;
    let success = false;
    let attemptError: string | null = null;
    try {
      const res = await fetch(
        `https://cloudflare-dns.com/dns-query?name=_rentwebify-verify.${encodeURIComponent(d.host)}&type=TXT`,
        { headers: { accept: "application/dns-json" } },
      );
      const json: any = await res.json();
      const answers: string[] = (json.Answer ?? []).map((a: any) => String(a.data ?? "").replace(/^"|"$/g, ""));
      found = answers.join(",") || null;
      success = answers.some((a) => a.includes(d.verification_token));
    } catch (e: any) {
      attemptError = e?.message ?? "DNS lookup failed";
    }

    await sb.from("domain_verification_attempts").insert({
      domain_id: d.id,
      record_type: "TXT",
      expected: d.verification_token,
      found,
      success,
      error: attemptError,
    });

    const nextStatus = success ? "verified" : "failed";
    await sb
      .from("domains")
      .update({ status: nextStatus, verified_at: success ? new Date().toISOString() : null })
      .eq("id", d.id);

    return { success, status: nextStatus, found };
  });

export const setPrimaryDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ tenantId: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOfTenant(data.tenantId, context.userId);
    const { data: d } = await sb
      .from("domains")
      .select("id, status")
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!d) throw new Error("Not found");
    if (d.status !== "verified") throw new Error("Domain must be verified before promotion.");
    // No explicit `is_primary` column in current schema; emit an audit row so
    // the admin console can surface the action and revisit when the column lands.
    await sb.from("audit_logs").insert({
      actor_id: context.userId,
      action: "domain.set_primary",
      target_table: "domains",
      target_id: data.id,
      diff: { tenantId: data.tenantId },
    });
    return { ok: true };
  });
