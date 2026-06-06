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
// 1. Get All Feature Flags
// =====================================================================
export const getFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    
    const { data, error } = await sb
      .from("feature_flags")
      .select("key, description, enabled, rollout_percent, updated_at")
      .order("key", { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

// =====================================================================
// 2. Toggle Feature Flag (On / Off)
// =====================================================================
export const toggleFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      key: z.string().min(1),
      enabled: z.boolean()
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error } = await sb
      .from("feature_flags")
      .update({
        enabled: data.enabled,
        updated_at: new Date().toISOString(),
        updated_by: context.userId
      })
      .eq("key", data.key);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorId: context.userId,
      action: data.enabled ? "feature_flag.enabled" : "feature_flag.disabled",
      targetTable: "feature_flags",
      targetId: data.key,
      diff: { enabled: data.enabled }
    });

    return { ok: true };
  });

// =====================================================================
// 3. Update Feature Flag Details (e.g. Rollout Percent)
// =====================================================================
export const updateFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      key: z.string().min(1),
      description: z.string().optional(),
      rollout_percent: z.number().min(0).max(100).optional()
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
      updated_by: context.userId
    };
    if (data.description !== undefined) updates.description = data.description;
    if (data.rollout_percent !== undefined) updates.rollout_percent = data.rollout_percent;

    const { error } = await sb
      .from("feature_flags")
      .update(updates)
      .eq("key", data.key);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "feature_flag.updated",
      targetTable: "feature_flags",
      targetId: data.key,
      diff: updates
    });

    return { ok: true };
  });

// =====================================================================
// 4. Create New Feature Flag
// =====================================================================
export const createFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      key: z.string().min(3).regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, and underscores allowed"),
      description: z.string(),
      enabled: z.boolean().default(false),
      rollout_percent: z.number().min(0).max(100).default(0)
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error } = await sb
      .from("feature_flags")
      .insert({
        key: data.key,
        description: data.description,
        enabled: data.enabled,
        rollout_percent: data.rollout_percent,
        updated_by: context.userId
      });

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "feature_flag.created",
      targetTable: "feature_flags",
      targetId: data.key,
      diff: { ...data }
    });

    return { ok: true };
  });

// =====================================================================
// 5. Delete Feature Flag
// =====================================================================
export const deleteFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ key: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error } = await sb
      .from("feature_flags")
      .delete()
      .eq("key", data.key);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorId: context.userId,
      action: "feature_flag.deleted",
      targetTable: "feature_flags",
      targetId: data.key,
      diff: { deleted: true }
    });

    return { ok: true };
  });