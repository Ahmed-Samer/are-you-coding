import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns the post-auth destination for the currently-authenticated user.
 * Uses the user's own RLS-scoped Supabase client (not the admin client) so
 * the read can never leak ownership of stores belonging to anyone else.
 *
 * `hasStore` reflects ownership of a `public.tenants` row (owner_id = uid)
 * — same definition used by `getMyTenants` on the dashboard.
 */
export const getPostAuthDestination = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { count, error } = await supabase
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .limit(1);
    if (error) {
      // Don't strand the user: fall through to dashboard. The
      // `_authenticated` gate + dashboard's own logic will recover.
      console.error("[auth-callback] tenants count failed:", error.message);
      return { destination: "dashboard" as const, hasStore: true };
    }
    const hasStore = (count ?? 0) > 0;
    return {
      destination: hasStore ? ("dashboard" as const) : ("onboarding" as const),
      hasStore,
    };
  });
