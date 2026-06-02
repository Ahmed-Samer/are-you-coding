// src/lib/impersonation.functions.ts
// Thin server-fn module: createServerFn declarations only.
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAuditLog } from "@/lib/audit.server";
import {
  decodeMeta,
  encodeMeta,
  IMPERSONATION_COOKIE,
  IMPERSONATION_MAX_AGE_SEC,
  IMPERSONATION_META_COOKIE,
  signEnvelope,
  verifyEnvelope,
  type ImpersonationEnvelope,
} from "@/lib/impersonation.server";
import {
  getUserEmailById,
  isPlatformAdmin,
  loadTenantHeader,
} from "@/lib/rbac.server";

function clientMeta() {
  const req = getRequest();
  const ua = req?.headers.get("user-agent") ?? null;
  const ip =
    req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req?.headers.get("cf-connecting-ip") ??
    null;
  return { ip, ua };
}

// ============================================================================
// startImpersonation — admin enters read-only impersonation of a tenant.
// ============================================================================
export const startImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const adminId = context.userId;
    const isAdmin = await isPlatformAdmin(adminId);
    if (!isAdmin) throw new Error("FORBIDDEN: platform admin required");

    const tenant = await loadTenantHeader(data.tenantId);
    const asUserId = tenant.owner_id;
    const asUserEmail = await getUserEmailById(asUserId);

    const now = Date.now();
    const exp = now + IMPERSONATION_MAX_AGE_SEC * 1000;
    const envelope: ImpersonationEnvelope = {
      v: 1,
      adminId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      asUserId,
      asUserEmail,
      startedAt: now,
      exp,
    };
    const cookieValue = signEnvelope(envelope);
    const metaValue = encodeMeta({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      asUserEmail,
      startedAt: now,
      exp,
    });

    setCookie(IMPERSONATION_COOKIE, cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: IMPERSONATION_MAX_AGE_SEC,
    });
    setCookie(IMPERSONATION_META_COOKIE, metaValue, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: IMPERSONATION_MAX_AGE_SEC,
    });

    const { ip, ua } = clientMeta();
    await writeAuditLog({
      actorId: adminId,
      actorRole: "admin",
      action: "impersonation_started",
      targetTable: "tenants",
      targetId: tenant.id,
      diff: { asUserId, asUserEmail, startedAt: now, exp },
      ip,
      userAgent: ua,
    });

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      asUserEmail,
    };
  });

// ============================================================================
// stopImpersonation — admin exits impersonation.
// ============================================================================
export const stopImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const raw = getCookie(IMPERSONATION_COOKIE);
    const env = verifyEnvelope(raw);

    deleteCookie(IMPERSONATION_COOKIE, { path: "/" });
    deleteCookie(IMPERSONATION_META_COOKIE, { path: "/" });

    if (env) {
      const { ip, ua } = clientMeta();
      await writeAuditLog({
        actorId: env.adminId || context.userId,
        actorRole: "admin",
        action: "impersonation_ended",
        targetTable: "tenants",
        targetId: env.tenantId,
        diff: {
          asUserId: env.asUserId,
          durationMs: Date.now() - env.startedAt,
        },
        ip,
        userAgent: ua,
      });
    }
    return { ok: true as const };
  });

// ============================================================================
// getImpersonationState — read-only state probe for the UI banner.
// ============================================================================
export const getImpersonationState = createServerFn({ method: "GET" })
  .handler(async () => {
    const raw = getCookie(IMPERSONATION_COOKIE);
    const env = verifyEnvelope(raw);
    if (!env) {
      // Belt + suspenders: clean a stale meta cookie if the signed one is gone.
      const meta = decodeMeta(getCookie(IMPERSONATION_META_COOKIE));
      if (meta) deleteCookie(IMPERSONATION_META_COOKIE, { path: "/" });
      return null;
    }
    return {
      tenantId: env.tenantId,
      tenantSlug: env.tenantSlug,
      tenantName: env.tenantName,
      asUserEmail: env.asUserEmail,
      startedAt: env.startedAt,
      exp: env.exp,
    };
  });