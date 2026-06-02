import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { z } from "zod";
import { AdminShell } from "@/components/admin/AdminShell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AnalyticsWindowSelector,
  type AnalyticsWindow,
} from "@/components/admin/analytics/AnalyticsWindowSelector";
import { OverviewMetricCards } from "@/components/admin/analytics/OverviewMetricCards";
import { ExportMenu } from "@/components/admin/analytics/ExportMenu";
import {
  getAnalyticsOverview,
  getCohortRetention,
  getPlatformFunnel,
  getRevenueBreakdown,
  getTopTenants,
} from "@/lib/admin-analytics.functions";

// Heavy chart + table chunks — split out so the analytics route doesn't ship
// recharts/echarts into the initial admin bundle.
const RevenueTimelineChart = lazy(() =>
  import("@/components/admin/analytics/RevenueTimelineChart").then((m) => ({ default: m.RevenueTimelineChart })),
);
const FunnelChart = lazy(() =>
  import("@/components/admin/analytics/FunnelChart").then((m) => ({ default: m.FunnelChart })),
);
const RevenueByPlanDonut = lazy(() =>
  import("@/components/admin/analytics/RevenueByPlanDonut").then((m) => ({ default: m.RevenueByPlanDonut })),
);
const CohortRetentionHeatmap = lazy(() =>
  import("@/components/admin/analytics/CohortRetentionHeatmap").then((m) => ({ default: m.CohortRetentionHeatmap })),
);
const TopTenantsTable = lazy(() =>
  import("@/components/admin/analytics/TopTenantsTable").then((m) => ({ default: m.TopTenantsTable })),
);

const ChartSkeleton = () => <Skeleton className="h-64 w-full" />;

const searchSchema = z.object({
  window: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).optional(),
  weeks: z.union([z.literal(8), z.literal(12), z.literal(26)]).optional(),
});

const overviewQuery = (days: AnalyticsWindow) =>
  queryOptions({
    queryKey: ["admin", "analytics", "overview", days],
    queryFn: () => getAnalyticsOverview({ data: { days: String(days) as any } }),
  });
const funnelQuery = (days: AnalyticsWindow) =>
  queryOptions({
    queryKey: ["admin", "analytics", "funnel", days],
    queryFn: () => getPlatformFunnel({ data: { days: String(days) as any } }),
  });
const revenueQuery = (days: AnalyticsWindow) =>
  queryOptions({
    queryKey: ["admin", "analytics", "revenue", days],
    queryFn: () => getRevenueBreakdown({ data: { days: String(days) as any } }),
  });
const topTenantsQuery = (days: AnalyticsWindow) =>
  queryOptions({
    queryKey: ["admin", "analytics", "top-tenants", days],
    queryFn: () => getTopTenants({ data: { days: String(days) as any, limit: 20 } }),
  });
const cohortQuery = (weeks: 8 | 12 | 26) =>
  queryOptions({
    queryKey: ["admin", "analytics", "cohort", weeks],
    queryFn: () => getCohortRetention({ data: { weeks: String(weeks) as any } }),
  });

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "Admin — Analytics" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({ window: search.window ?? 30, weeks: search.weeks ?? 12 }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(overviewQuery(deps.window as AnalyticsWindow)),
      context.queryClient.ensureQueryData(funnelQuery(deps.window as AnalyticsWindow)),
      context.queryClient.ensureQueryData(revenueQuery(deps.window as AnalyticsWindow)),
      context.queryClient.ensureQueryData(topTenantsQuery(deps.window as AnalyticsWindow)),
      context.queryClient.ensureQueryData(cohortQuery(deps.weeks as 8 | 12 | 26)),
    ]);
  },
  errorComponent: ({ error }) => (
    <AdminShell title="Analytics" description="Platform-wide insights">
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
        Couldn't load analytics: {error.message}
      </div>
    </AdminShell>
  ),
  notFoundComponent: () => <AdminShell title="Analytics">Not found.</AdminShell>,
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const days = (search.window ?? 30) as AnalyticsWindow;
  const weeks = (search.weeks ?? 12) as 8 | 12 | 26;

  const { data: overview } = useSuspenseQuery(overviewQuery(days));
  const { data: funnel } = useSuspenseQuery(funnelQuery(days));
  const { data: revenue } = useSuspenseQuery(revenueQuery(days));
  const { data: top } = useSuspenseQuery(topTenantsQuery(days));
  const { data: cohort } = useSuspenseQuery(cohortQuery(weeks));

  return (
    <AdminShell
      title="Analytics"
      description="Platform-wide revenue, conversion, and retention pulse."
      breadcrumbs={[{ label: "Analytics" }]}
      actions={
        <div className="flex items-center gap-2">
          <AnalyticsWindowSelector
            value={days}
            onChange={(v) => navigate({ search: (p: any) => ({ ...p, window: v }), replace: true })}
          />
          <ExportMenu days={days} weeks={weeks} />
        </div>
      }
    >
      <div className="space-y-6">
        <OverviewMetricCards
          mrrUsd={overview.mrrUsd}
          arrUsd={overview.arrUsd}
          paidTenants={overview.paidTenants}
          newSignups={overview.newSignups}
          conversionPct={overview.conversionPct}
          deltas={overview.deltas}
        />

        <Suspense fallback={<ChartSkeleton />}>
          <RevenueTimelineChart data={overview.revenueTimeline} />
        </Suspense>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Suspense fallback={<ChartSkeleton />}>
            <FunnelChart stages={funnel.stages} />
          </Suspense>
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueByPlanDonut data={revenue.byPlan} />
          </Suspense>
        </div>

        <Suspense fallback={<ChartSkeleton />}>
          <CohortRetentionHeatmap cohorts={cohort.cohorts} weeks={cohort.weeks} />
        </Suspense>

        <Suspense fallback={<ChartSkeleton />}>
          <TopTenantsTable tenants={top.tenants} />
        </Suspense>
      </div>
    </AdminShell>
  );
}