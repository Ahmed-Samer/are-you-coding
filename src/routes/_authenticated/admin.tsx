import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMyAdminClaim } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    try {
      const { isAdmin } = await getMyAdminClaim();
      if (!isAdmin) {
        throw redirect({ to: "/dashboard" });
      }
    } catch (err) {
      // Re-throw redirects; treat any other failure (incl. 401/forbidden) as non-admin.
      if (err && typeof err === "object" && "to" in err) throw err;
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});
