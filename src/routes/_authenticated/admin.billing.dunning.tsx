import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Skeleton } from "@/components/ui/skeleton";

const DunningTable = lazy(() =>
  import("@/components/admin/billing/DunningTable").then((m) => ({ default: m.DunningTable })),
);

export const Route = createFileRoute("/_authenticated/admin/billing/dunning")({
  head: () => ({ meta: [{ title: "Admin — Dunning queue" }] }),
  errorComponent: ({ error }) => (
    <AdminShell title="Couldn't load dunning queue">
      <div className="text-sm text-destructive">{error.message}</div>
    </AdminShell>
  ),
  component: DunningPage,
});

function DunningPage() {
  return (
    <AdminShell
      title="Dunning"
      description="Subscriptions approaching their period end. Reach out before renewal to reduce churn."
      breadcrumbs={[{ label: "Dunning" }]}
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <DunningTable />
      </Suspense>
    </AdminShell>
  );
}
