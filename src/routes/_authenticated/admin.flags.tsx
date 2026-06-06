import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Skeleton } from "@/components/ui/skeleton";

const FlagsTable = lazy(() =>
  import("@/components/admin/flags/FlagsTable").then((m) => ({ default: m.FlagsTable }))
);

export const Route = createFileRoute("/_authenticated/admin/flags")({
  head: () => ({ meta: [{ title: "Admin — Feature Flags" }] }),
  errorComponent: ({ error }) => (
    <AdminShell title="Couldn't load feature flags">
      <div className="text-sm text-destructive">{error.message}</div>
    </AdminShell>
  ),
  component: FlagsPage,
});

export function FlagsPage() {
  return (
    <AdminShell
      title="Feature Flags"
      description="Turn platform features on or off dynamically without deploying new code."
      breadcrumbs={[{ label: "Feature Flags" }]}
    >
      <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-xl" />}>
        <FlagsTable />
      </Suspense>
    </AdminShell>
  );
}