import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Skeleton } from "@/components/ui/skeleton";

const WebhooksKPIs = lazy(() =>
  import("@/components/admin/webhooks/WebhooksKPIs").then((m) => ({ default: m.WebhooksKPIs })),
);
const WebhookEventsTable = lazy(() =>
  import("@/components/admin/webhooks/WebhookEventsTable").then((m) => ({ default: m.WebhookEventsTable })),
);

export const Route = createFileRoute("/_authenticated/admin/webhooks")({
  head: () => ({ meta: [{ title: "Admin — Webhooks" }] }),
  errorComponent: ({ error }) => (
    <AdminShell title="Couldn't load webhooks">
      <div className="text-sm text-destructive">{error.message}</div>
    </AdminShell>
  ),
  component: WebhooksPage,
});

function WebhooksPage() {
  return (
    <AdminShell
      title="Webhooks"
      description="Monitor outbound webhook delivery, inspect failed payloads, and trigger manual retries."
      breadcrumbs={[{ label: "Webhooks" }]}
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <div className="space-y-6">
          <WebhooksKPIs windowDays={1} />
          <WebhookEventsTable />
        </div>
      </Suspense>
    </AdminShell>
  );
}
