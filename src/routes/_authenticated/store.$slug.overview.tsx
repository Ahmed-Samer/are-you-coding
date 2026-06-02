import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useStore } from "./store.$slug";
import { getTenantStats, listMyOrders } from "@/lib/catalog.functions";
import { getTenantAnalyticsSeries } from "@/lib/analytics.functions";
import { formatPrice } from "@/lib/cart";
import { StatCardSkeleton } from "@/components/ui/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, TrendingUp, Package, ListOrdered, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/store/$slug/overview")({
  component: OverviewPage,
});

const ACTIVITY_DAYS = 14;

function OverviewPage() {
  const { tenant } = useStore();
  const fetchStats = useServerFn(getTenantStats);
  const fetchOrders = useServerFn(listMyOrders);
  const fetchSeries = useServerFn(getTenantAnalyticsSeries);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["tenant-stats", tenant.id],
    queryFn: () => fetchStats({ data: { tenantId: tenant.id } }),
  });
  const { data: recent = [] } = useQuery({
    queryKey: ["orders", tenant.id],
    queryFn: () => fetchOrders({ data: { tenantId: tenant.id } }),
    select: (d) => (d?.orders ?? []).slice(0, 5),
  });
  const {
    data: seriesData,
    isLoading: seriesLoading,
    isError: seriesError,
  } = useQuery({
    queryKey: ["tenant-analytics-series", tenant.id, ACTIVITY_DAYS],
    queryFn: () =>
      fetchSeries({ data: { tenantId: tenant.id, days: ACTIVITY_DAYS } }),
  });

  const currency = (tenant as any).currency ?? "EGP";

  // Build a dense 14-day series so the chart x-axis isn't gappy on quiet days.
  const chartData = useMemo(() => {
    const raw = (seriesData?.series ?? []) as Array<Record<string, any>>;
    const byDate = new Map(raw.map((r) => [String(r.date), r]));
    const days: Array<{ date: string; views: number; carts: number; orders: number }> = [];
    const today = new Date();
    for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const row = byDate.get(key) ?? {};
      days.push({
        date: key,
        views: Number(row.page_view ?? 0) + Number(row.product_view ?? 0),
        carts: Number(row.add_to_cart ?? 0),
        orders: Number(row.order_placed ?? 0),
      });
    }
    return days;
  }, [seriesData]);

  const totalEvents = seriesData?.totalEvents ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading ? (
          <>
            <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
          </>
        ) : (
          <>
            <Kpi icon={<ShoppingBag className="size-4" />} label="Orders today" value={String(stats?.ordersToday ?? 0)} />
            <Kpi icon={<TrendingUp className="size-4" />} label="Revenue (7d)" value={formatPrice(stats?.revenueWeekCents ?? 0, currency)} />
            <Kpi icon={<Package className="size-4" />} label="Products" value={String(stats?.productCount ?? 0)} />
            <Kpi icon={<ListOrdered className="size-4" />} label="Total orders" value={String(stats?.orderCount ?? 0)} />
          </>
        )}
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Activity className="size-4 text-muted-foreground" />
              Storefront activity
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Last {ACTIVITY_DAYS} days · {totalEvents} total events
            </p>
          </div>
        </div>
        <div className="p-4 h-64">
          {seriesLoading ? (
            <div className="h-full w-full animate-pulse rounded-md bg-muted/50" />
          ) : seriesError ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Couldn't load activity. Refresh to try again.
            </div>
          ) : totalEvents === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="size-9 rounded-full bg-muted flex items-center justify-center mb-2">
                <Activity className="size-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">
                Visitor traffic and orders will show up here once your storefront goes live.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="vw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="od" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  name="Views"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#vw)"
                />
                <Area
                  type="monotone"
                  dataKey="orders"
                  name="Orders"
                  stroke="hsl(var(--foreground))"
                  strokeWidth={2}
                  fill="url(#od)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <div className="rounded-lg border border-border bg-card">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold">Recent orders</h3>
        </div>
        {recent.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No orders yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{o.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="secondary" className="capitalize hidden sm:inline-flex">{o.status.replace(/_/g, " ")}</Badge>
                  <div className="font-semibold tabular-nums text-sm">{formatPrice(o.subtotal_cents, o.currency)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}
