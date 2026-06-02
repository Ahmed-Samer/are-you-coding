import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useStore } from "./store.$slug";
import { Skeleton } from "@/components/ui/skeleton";

const RecoveryStatsCards = lazy(() =>
  import("@/components/dashboard/recovery/RecoveryStatsCards").then((m) => ({ default: m.RecoveryStatsCards })),
);
const RecoverySettingsPanel = lazy(() =>
  import("@/components/dashboard/recovery/RecoverySettingsPanel").then((m) => ({ default: m.RecoverySettingsPanel })),
);
const AbandonedCartsTable = lazy(() =>
  import("@/components/dashboard/recovery/AbandonedCartsTable").then((m) => ({ default: m.AbandonedCartsTable })),
);

export const Route = createFileRoute("/_authenticated/store/$slug/recovery")({
  component: RecoveryPage,
});

function RecoveryPage() {
  const { tenant } = useStore();
  const t = tenant as any;
  const currency: string = t.currency ?? "EGP";
  const delay = (t.cart_recovery_delay_minutes ?? 60) as 30 | 60 | 120 | 360;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <div className="space-y-6">
        <RecoveryStatsCards tenantId={tenant.id} currency={currency} />
        <RecoverySettingsPanel
          tenantId={tenant.id}
          tenantSlug={tenant.slug}
          storeName={tenant.name}
          initialEnabled={t.cart_recovery_enabled ?? true}
          initialDelayMinutes={delay}
          initialMessageTemplate={t.cart_recovery_message_template ?? null}
        />
        <AbandonedCartsTable tenantId={tenant.id} currency={currency} />
      </div>
    </Suspense>
  );
}
