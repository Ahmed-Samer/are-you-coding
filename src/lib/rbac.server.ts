// src/lib/rbac.server.ts
// Server-only helpers for Sprint 1 staff RBAC. Imported exclusively by
// rbac.functions.ts so this never leaks into the client bundle.
import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getCookie } from "@tanstack/react-start/server";
import { IMPERSONATION_COOKIE, verifyEnvelope } from "@/lib/impersonation.server";

const sb = supabaseAdmin as any;

/**
 * Defense layer B: any guard that gates a write must call this first.
 * Layer A is the global `enforceImpersonationReadOnly` middleware in
 * src/start.ts. This is the per-call backstop.
 */
export function assertNotImpersonating(): void {
  try {
    const env = verifyEnvelope(getCookie(IMPERSONATION_COOKIE));
    if (env) {
      throw new Error("IMPERSONATION_READ_ONLY: writes are disabled during impersonation");
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("IMPERSONATION_READ_ONLY")) throw e;
    // getCookie outside a request context throws — treat as not impersonating.
  }
}

export type TenantMemberRole = "owner" | "manager" | "staff" | "viewer";

/** Generate a 36-byte cryptographically random base64url invite token. */
export function generateInviteToken(): string {
  return randomBytes(36).toString("base64url");
}

/** sha256 hash of the raw token, lowercase hex. */
export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Normalize an email: trim + lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Fetch the tenant row needed for guards: root owner_id + slug/name.
 * Throws NOT_FOUND if missing.
 */
export async function loadTenantHeader(tenantId: string): Promise<{
  id: string;
  owner_id: string;
  name: string;
  slug: string;
}> {
  const { data, error } = await sb
    .from("tenants")
    .select("id, owner_id, name, slug")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("NOT_FOUND: tenant");
  return data;
}

/** Returns true if the caller is a platform admin (`user_roles.role='admin'`). */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

/** Returns the caller's tenant_members.role or null. */
export async function getCallerRole(
  tenantId: string,
  userId: string,
): Promise<TenantMemberRole | null> {
  const { data, error } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.role as TenantMemberRole | undefined) ?? null;
}

/**
 * Throws FORBIDDEN if the caller cannot manage members (owner | manager |
 * tenant.owner_id | platform admin).
 */
export async function assertCanManageMembers(
  tenantId: string,
  userId: string,
): Promise<{ tenant: Awaited<ReturnType<typeof loadTenantHeader>>; callerRole: TenantMemberRole | null; isAdmin: boolean }> {
  assertNotImpersonating();
  const [tenant, callerRole, isAdmin] = await Promise.all([
    loadTenantHeader(tenantId),
    getCallerRole(tenantId, userId),
    isPlatformAdmin(userId),
  ]);
  const allowed =
    isAdmin ||
    tenant.owner_id === userId ||
    callerRole === "owner" ||
    callerRole === "manager";
  if (!allowed) throw new Error("FORBIDDEN: cannot manage tenant members");
  return { tenant, callerRole, isAdmin };
}

/** Throws FORBIDDEN if the caller cannot at least read members. */
export async function assertCanReadMembers(
  tenantId: string,
  userId: string,
): Promise<{ tenant: Awaited<ReturnType<typeof loadTenantHeader>>; callerRole: TenantMemberRole | null; isAdmin: boolean }> {
  const [tenant, callerRole, isAdmin] = await Promise.all([
    loadTenantHeader(tenantId),
    getCallerRole(tenantId, userId),
    isPlatformAdmin(userId),
  ]);
  const allowed = isAdmin || tenant.owner_id === userId || callerRole !== null;
  if (!allowed) throw new Error("FORBIDDEN: not a member of this tenant");
  return { tenant, callerRole, isAdmin };
}

/**
 * Last-owner guard. Throws LAST_OWNER if removing or demoting the target
 * would leave the tenant with zero owners.
 * Pass the target's CURRENT role; we only block when current === 'owner'.
 */
export async function assertNotLastOwner(
  tenantId: string,
  targetCurrentRole: TenantMemberRole,
): Promise<void> {
  if (targetCurrentRole !== "owner") return;
  const { count, error } = await sb
    .from("tenant_members")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("role", "owner");
  if (error) throw new Error(error.message);
  if ((count ?? 0) <= 1) {
    throw new Error("LAST_OWNER: cannot remove or demote the last owner");
  }
}

/** Resolve a user_id from email via auth.users (admin scope). */
export async function findAuthUserByEmail(
  email: string,
): Promise<{ id: string; email: string | null } | null> {
  // listUsers is paginated; for tenant invite resolution we only need the
  // first hit. We bound to 200 per page; if email isn't in the first page we
  // treat as "no existing user" — the invite flow handles new users anyway.
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(error.message);
  const needle = normalizeEmail(email);
  const hit = (data?.users ?? []).find(
    (u: { email?: string | null }) => (u.email ?? "").toLowerCase() === needle,
  );
  return hit ? { id: hit.id, email: hit.email ?? null } : null;
}

/** Fetch one user's email by id (admin scope). */
export async function getUserEmailById(userId: string): Promise<string | null> {
  const { data, error } = await sb.auth.admin.getUserById(userId);
  if (error) return null;
  return data?.user?.email ?? null;
}
