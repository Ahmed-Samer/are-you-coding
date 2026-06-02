import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Centralized audit log writer. ALL admin mutations should call this
 * before returning. Failures are swallowed (logged) so a broken audit
 * insert never blocks a legitimate admin action — but they should be
 * extremely rare since the table is service-role only.
 */
export async function writeAuditLog(input: {
  actorId: string;
  actorRole?: "admin" | "system";
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  diff?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const sb = supabaseAdmin as any;
  const { error } = await sb.from("audit_logs").insert({
    actor_id: input.actorId,
    actor_role: input.actorRole ?? "admin",
    action: input.action,
    target_table: input.targetTable ?? null,
    target_id: input.targetId ?? null,
    diff: input.diff ?? {},
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
  });
  if (error) {
    console.error("[audit] insert failed", input.action, error.message);
  }
}
