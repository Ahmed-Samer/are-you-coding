import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Skeleton } from "@/components/ui/skeleton";

const WebhookEventsTable = lazy(() =>
  import("@/components/admin/webhooks/WebhookEventsTable").then((m) => ({ default: m.WebhookEventsTable }))
);

export const Route = createFileRoute("/_authenticated/admin/webhooks")({
  head: () => ({ meta: [{ title: "Admin — Webhooks" }] }),
  errorComponent: ({ error }) => (
    <AdminShell title="Couldn't load webhooks">
      <div className="text-sm text-destructive">{error.message}</div>
    </AdminShell>
  ),
  component: AdminWebhooksPage,
});

function AdminWebhooksPage() {
  return (
    <AdminShell
      title="Webhooks & Integrations"
      description="Manage automated HTTP push APIs and monitor outgoing event delivery."
      breadcrumbs={[{ label: "Webhooks" }]}
    >
      <Suspense fallback={<Skeleton className="h-[500px] w-full rounded-xl" />}>
        <WebhookEventsTable />
      </Suspense>
    </AdminShell>
  );
}