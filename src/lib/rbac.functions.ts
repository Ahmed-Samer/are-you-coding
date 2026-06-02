// src/lib/rbac.functions.ts
// Sprint 1 — Staff Accounts & RBAC server functions.
// Thin file: only createServerFn declarations + their imports. All helpers
// live in rbac.server.ts to keep the import graph client-safe.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit.server";
import { writeAuditLog } from "@/lib/audit.server";
import {
  assertCanManageMembers,
  assertCanReadMembers,
  assertNotLastOwner,
  findAuthUserByEmail,
  generateInviteToken,
  getUserEmailById,
  hashInviteToken,
  isPlatformAdmin,
  loadTenantHeader,
  normalizeEmail,
  type TenantMemberRole,
} from "@/lib/rbac.server";

const sb = supabaseAdmin as any;

// ---- shared zod primitives ----
const tenantIdSchema = z.string().uuid();
const memberIdSchema = z.string().uuid();
const inviteIdSchema = z.string().uuid();
const roleSchema = z.enum(["owner", "manager", "staff", "viewer"]);
const inviteRoleSchema = z.enum(["manager", "staff", "viewer"]); // owners can't be invited
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const tokenSchema = z.string().trim().min(10).max(200);

// ============================================================================
// listTenantMembers
// ============================================================================
export const listTenantMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: tenantIdSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { callerRole, isAdmin, tenant } = await assertCanReadMembers(
      data.tenantId,
      context.userId,
    );

    const { data: rows, error } = await sb
      .from("tenant_members")
      .select("id, user_id, role, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const members = await Promise.all(
      (rows ?? []).map(async (m: { id: string; user_id: string; role: TenantMemberRole; created_at: string }) => {
        const email = await getUserEmailById(m.user_id);
        // profile is best-effort enrichment; missing rows are fine.
        const { data: prof } = await sb
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", m.user_id)
          .maybeSingle();
        return {
          id: m.id,
          userId: m.user_id,
          role: m.role,
          email,
          fullName: prof?.full_name ?? null,
          avatarUrl: prof?.avatar_url ?? null,
          createdAt: m.created_at,
          isRootOwner: m.user_id === tenant.owner_id,
        };
      }),
    );

    const { data: invites, error: invErr } = await sb
      .from("tenant_invites")
      .select("id, email, role, status, expires_at, created_at")
      .eq("tenant_id", data.tenantId)
      .in("status", ["pending"])
      .order("created_at", { ascending: false });
    if (invErr) throw new Error(invErr.message);

    return {
      members,
      pendingInvites: (invites ?? []).map((r: {
        id: string; email: string; role: TenantMemberRole;
        status: string; expires_at: string; created_at: string;
      }) => ({
        id: r.id,
        email: r.email,
        role: r.role,
        status: r.status,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
      })),
      callerRole: (isAdmin ? "owner" : callerRole) as TenantMemberRole | null,
      canManage: isAdmin || callerRole === "owner" || callerRole === "manager" || tenant.owner_id === context.userId,
    };
  });

// ============================================================================
// inviteTenantMember
// ============================================================================
export const inviteTenantMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: tenantIdSchema,
      email: emailSchema,
      role: inviteRoleSchema,
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenant } = await assertCanManageMembers(data.tenantId, context.userId);
    const email = normalizeEmail(data.email);

    // 1) Reject if that email already corresponds to an existing member.
    const existingAuthUser = await findAuthUserByEmail(email);
    if (existingAuthUser) {
      const { data: existingMember, error: memErr } = await sb
        .from("tenant_members")
        .select("id")
        .eq("tenant_id", data.tenantId)
        .eq("user_id", existingAuthUser.id)
        .maybeSingle();
      if (memErr) throw new Error(memErr.message);
      if (existingMember) throw new Error("ALREADY_MEMBER: user is already a member of this tenant");
    }

    // 2) Mint token + hash. Raw token is returned ONLY in-memory to the
    //    server fn caller's audit/email pipeline — never stored.
    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // 3) Upsert by (tenant_id, lower(email)). If a pending invite already
    //    exists, refresh its token + role + expiry (the "resend" path).
    const { data: existingInvite, error: exErr } = await sb
      .from("tenant_invites")
      .select("id, status")
      .eq("tenant_id", data.tenantId)
      .ilike("email", email)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);

    let inviteId: string;
    if (existingInvite) {
      const { error: updErr } = await sb
        .from("tenant_invites")
        .update({
          email,
          role: data.role,
          token_hash: tokenHash,
          invited_by: context.userId,
          status: "pending",
          expires_at: expiresAt,
          accepted_by: null,
          accepted_at: null,
        })
        .eq("id", existingInvite.id);
      if (updErr) throw new Error(updErr.message);
      inviteId = existingInvite.id;
    } else {
      const { data: ins, error: insErr } = await sb
        .from("tenant_invites")
        .insert({
          tenant_id: data.tenantId,
          email,
          role: data.role,
          token_hash: tokenHash,
          invited_by: context.userId,
          status: "pending",
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      inviteId = ins.id;
    }

    // 4) Enqueue the invite email. Token rides in the payload only; the
    //    consumer (email worker) uses the project's public host to build
    //    the accept URL.
    const { error: emailErr } = await sb.from("email_outbox").insert({
      to_email: email,
      template: "tenant_invite",
      payload: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        role: data.role,
        inviteId,
        token: rawToken,
        expiresAt,
      },
      status: "queued",
    });
    if (emailErr) {
      // Non-fatal but worth surfacing — the invite row exists, the email
      // didn't queue. Caller can resend.
      console.error("[rbac.invite] email_outbox insert failed:", emailErr.message);
    }

    await writeAuditLog({
      actorId: context.userId,
      action: "tenant_member.invited",
      targetTable: "tenant_invites",
      targetId: inviteId,
      diff: { tenantId: data.tenantId, email, role: data.role },
    });

    return { inviteId, expiresAt };
  });

// ============================================================================
// updateTenantMemberRole
// ============================================================================
export const updateTenantMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: tenantIdSchema,
      memberId: memberIdSchema,
      role: roleSchema,
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenant, callerRole } = await assertCanManageMembers(
      data.tenantId,
      context.userId,
    );

    // Load target with tenant-scope check (defense in depth).
    const { data: target, error: tErr } = await sb
      .from("tenant_members")
      .select("id, tenant_id, user_id, role")
      .eq("id", data.memberId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!target || target.tenant_id !== data.tenantId) {
      throw new Error("NOT_FOUND: member");
    }
    const current = target.role as TenantMemberRole;
    if (current === data.role) {
      return { id: target.id, role: current, unchanged: true };
    }

    // Promotion to 'owner' is restricted to the tenant root owner OR an admin.
    if (data.role === "owner") {
      const isRoot = tenant.owner_id === context.userId;
      const isAdmin = await isPlatformAdmin(context.userId);
      if (!isRoot && !isAdmin) {
        throw new Error("FORBIDDEN: only tenant root owner or admin can grant 'owner'");
      }
    }

    // Demoting an owner — must leave at least one owner standing.
    if (current === "owner" && data.role !== "owner") {
      await assertNotLastOwner(data.tenantId, current);
      // Also block demoting the tenant's root owner_id user via this fn;
      // ownership transfer must be explicit.
      if (target.user_id === tenant.owner_id) {
        throw new Error("CANNOT_DEMOTE_ROOT_OWNER: transfer ownership first");
      }
    }

    const { error: updErr } = await sb
      .from("tenant_members")
      .update({ role: data.role })
      .eq("id", data.memberId)
      .eq("tenant_id", data.tenantId);
    if (updErr) throw new Error(updErr.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "tenant_member.role_changed",
      targetTable: "tenant_members",
      targetId: data.memberId,
      diff: { tenantId: data.tenantId, from: current, to: data.role, callerRole },
    });

    return { id: data.memberId, role: data.role, unchanged: false };
  });

// ============================================================================
// removeTenantMember
// ============================================================================
export const removeTenantMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: tenantIdSchema,
      memberId: memberIdSchema,
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenant } = await assertCanManageMembers(data.tenantId, context.userId);

    const { data: target, error: tErr } = await sb
      .from("tenant_members")
      .select("id, tenant_id, user_id, role")
      .eq("id", data.memberId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!target || target.tenant_id !== data.tenantId) {
      throw new Error("NOT_FOUND: member");
    }

    // Cannot remove the tenant's root creator — ownership must be transferred
    // via updateTenantMemberRole first (and even that is blocked until a
    // future transferTenantOwnership fn exists).
    if (target.user_id === tenant.owner_id) {
      throw new Error("CANNOT_REMOVE_ROOT_OWNER: this is the tenant creator");
    }

    // Last-owner guard (covers the rare case of a second owner who is not the
    // root creator being the only remaining owner — root would still exist,
    // but this catches the general invariant).
    await assertNotLastOwner(data.tenantId, target.role as TenantMemberRole);

    const { error: delErr } = await sb
      .from("tenant_members")
      .delete()
      .eq("id", data.memberId)
      .eq("tenant_id", data.tenantId);
    if (delErr) throw new Error(delErr.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "tenant_member.removed",
      targetTable: "tenant_members",
      targetId: data.memberId,
      diff: { tenantId: data.tenantId, userId: target.user_id, role: target.role },
    });

    return { ok: true };
  });

// ============================================================================
// revokeTenantInvite
// ============================================================================
export const revokeTenantInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ tenantId: tenantIdSchema, inviteId: inviteIdSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageMembers(data.tenantId, context.userId);

    const { data: invite, error: invErr } = await sb
      .from("tenant_invites")
      .select("id, tenant_id, email, role, status")
      .eq("id", data.inviteId)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!invite || invite.tenant_id !== data.tenantId) {
      throw new Error("NOT_FOUND: invite");
    }
    if (invite.status !== "pending") {
      return { ok: true, alreadyFinal: true };
    }

    const { error: updErr } = await sb
      .from("tenant_invites")
      .update({ status: "revoked" })
      .eq("id", data.inviteId);
    if (updErr) throw new Error(updErr.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "tenant_member.invite_revoked",
      targetTable: "tenant_invites",
      targetId: data.inviteId,
      diff: { tenantId: data.tenantId, email: invite.email, role: invite.role },
    });

    return { ok: true };
  });

// ============================================================================
// resendTenantInvite
// ============================================================================
export const resendTenantInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ tenantId: tenantIdSchema, inviteId: inviteIdSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenant } = await assertCanManageMembers(data.tenantId, context.userId);

    const { data: invite, error: invErr } = await sb
      .from("tenant_invites")
      .select("id, tenant_id, email, role, status")
      .eq("id", data.inviteId)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!invite || invite.tenant_id !== data.tenantId) {
      throw new Error("NOT_FOUND: invite");
    }
    if (invite.status === "accepted") {
      throw new Error("ALREADY_ACCEPTED: invite has already been accepted");
    }

    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: updErr } = await sb
      .from("tenant_invites")
      .update({
        token_hash: tokenHash,
        status: "pending",
        expires_at: expiresAt,
        invited_by: context.userId,
        accepted_by: null,
        accepted_at: null,
      })
      .eq("id", data.inviteId);
    if (updErr) throw new Error(updErr.message);

    const { error: emailErr } = await sb.from("email_outbox").insert({
      to_email: invite.email,
      template: "tenant_invite",
      payload: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        role: invite.role,
        inviteId: data.inviteId,
        token: rawToken,
        expiresAt,
      },
      status: "queued",
    });
    if (emailErr) {
      console.error("[rbac.resend] email_outbox insert failed:", emailErr.message);
    }

    await writeAuditLog({
      actorId: context.userId,
      action: "tenant_member.invite_resent",
      targetTable: "tenant_invites",
      targetId: data.inviteId,
      diff: { tenantId: data.tenantId, email: invite.email, role: invite.role },
    });

    return { inviteId: data.inviteId, expiresAt };
  });

// ============================================================================
// acceptTenantInvite
// ----------------------------------------------------------------------------
// Returns typed results instead of throwing for known invite-state branches.
// The accept route renders a distinct UI for each reason.
// ============================================================================
export type AcceptInviteResult =
  | { ok: true; tenantId: string; tenantSlug: string; tenantName: string; role: TenantMemberRole }
  | { ok: false; reason: "already_accepted" }
  | { ok: false; reason: "revoked" }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "email_mismatch"; expectedEmail: string }
  | { ok: false; reason: "rate_limited" };

/**
 * Best-effort attempt logger for invite acceptance. Stores only the IP and
 * the FIRST 8 CHARS of the raw token (the "prefix") + a short outcome tag.
 * The raw token is NEVER persisted, never logged to console, never echoed.
 */
async function logInviteAcceptAttempt(
  ip: string,
  tokenPrefix: string,
  outcome: string,
): Promise<void> {
  try {
    await sb.from("invite_accept_attempts").insert({ ip, token_prefix: tokenPrefix, outcome });
  } catch {
    // Swallow — attempt logging must never break the accept flow.
  }
}

export const acceptTenantInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ token: tokenSchema }).parse(i))
  .handler(async ({ data, context }): Promise<AcceptInviteResult> => {
    // Idempotency note: the entire handler is safe to re-run with the same
    // token. A previously-accepted invite returns `already_accepted` below;
    // the member upsert further down is guarded by an existence check.

    const ip = getClientIp();
    const tokenPrefix = data.token.slice(0, 8);

    // Edge-safe rate limiting — two independent windows. Per-IP defeats
    // generic spam; per-token-prefix defeats per-token enumeration without
    // letting one attacker drown out legitimate traffic.
    try {
      await enforceRateLimit({
        table: "invite_accept_attempts",
        filters: { ip },
        max: 10,
        windowSec: 60,
        label: "invite attempts",
      });
      await enforceRateLimit({
        table: "invite_accept_attempts",
        filters: { token_prefix: tokenPrefix },
        max: 5,
        windowSec: 60,
        label: "invite attempts",
      });
    } catch {
      await logInviteAcceptAttempt(ip, tokenPrefix, "rate_limited");
      return { ok: false, reason: "rate_limited" };
    }

    const tokenHash = hashInviteToken(data.token);

    const { data: invite, error: invErr } = await sb
      .from("tenant_invites")
      .select("id, tenant_id, email, role, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (invErr) {
      await logInviteAcceptAttempt(ip, tokenPrefix, "db_error");
      throw new Error(invErr.message);
    }
    if (!invite) {
      await logInviteAcceptAttempt(ip, tokenPrefix, "invalid_token");
      throw new Error("INVALID_TOKEN: invite not found");
    }

    if (invite.status === "accepted") {
      await logInviteAcceptAttempt(ip, tokenPrefix, "already_accepted");
      return { ok: false, reason: "already_accepted" };
    }
    if (invite.status === "revoked") {
      await logInviteAcceptAttempt(ip, tokenPrefix, "revoked");
      return { ok: false, reason: "revoked" };
    }
    if (invite.status === "expired") {
      await logInviteAcceptAttempt(ip, tokenPrefix, "expired");
      return { ok: false, reason: "expired" };
    }

    // Pending — verify expiry.
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      await sb
        .from("tenant_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);
      await logInviteAcceptAttempt(ip, tokenPrefix, "expired");
      return { ok: false, reason: "expired" };
    }

    // Caller email must match the invited address (case-insensitive).
    const callerEmail = await getUserEmailById(context.userId);
    if (!callerEmail || normalizeEmail(callerEmail) !== normalizeEmail(invite.email)) {
      await logInviteAcceptAttempt(ip, tokenPrefix, "email_mismatch");
      return { ok: false, reason: "email_mismatch", expectedEmail: invite.email };
    }

    const tenant = await loadTenantHeader(invite.tenant_id);

    // Idempotent member insert.
    const { data: existing, error: memErr } = await sb
      .from("tenant_members")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (memErr) throw new Error(memErr.message);

    if (!existing) {
      const { error: insErr } = await sb.from("tenant_members").insert({
        tenant_id: tenant.id,
        user_id: context.userId,
        role: invite.role,
      });
      if (insErr) throw new Error(insErr.message);
    }

    const { error: acceptErr } = await sb
      .from("tenant_invites")
      .update({
        status: "accepted",
        accepted_by: context.userId,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invite.id);
    if (acceptErr) throw new Error(acceptErr.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "tenant_member.invite_accepted",
      targetTable: "tenant_invites",
      targetId: invite.id,
      diff: { tenantId: tenant.id, role: invite.role, reAccepted: !!existing },
    });

    await logInviteAcceptAttempt(ip, tokenPrefix, existing ? "re_accepted" : "accepted");

    return {
      ok: true,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      role: invite.role as TenantMemberRole,
    };
  });
