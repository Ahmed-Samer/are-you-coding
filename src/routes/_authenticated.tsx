import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AuthLoading } from "@/components/auth/AuthLoading";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Preserve the FULL href (pathname + search) so query params like
      // `?plan=growth-monthly` survive the login bounce. Using
      // `location.pathname` alone silently drops the user's intent.
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  pendingComponent: AuthLoading,
  component: () => (
    <>
      <ImpersonationBanner />
      <Outlet />
    </>
  ),
});
