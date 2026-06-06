import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { 
  DollarSign, Store, Activity, AlertCircle, 
  ArrowRight, Users, TrendingUp, CreditCard 
} from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Area, AreaChart
} from "recharts";

import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAdminDashboardKPIs } from "@/lib/admin.functions";

const dashboardQuery = queryOptions({
  queryKey: ["admin", "dashboard", "kpis"],
  queryFn: () => getAdminDashboardKPIs(),
});

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin — Dashboard Overview" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  component: AdminDashboardPage,
});

export function AdminDashboardPage() {
  const { data: kpis } = useSuspenseQuery(dashboardQuery);

  // Formatting utilities
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
  
  const formatPercent = (val: number) => `${val.toFixed(1)}%`;

  return (
    <AdminShell
      title="Platform Overview"
      description="Monitor key performance indicators, revenue growth, and pending platform actions."
      breadcrumbs={[{ label: "Dashboard" }]}
    >
      <div className="space-y-6">
        
        {/* Smart Alerts Section */}
        {kpis.pendingProofs > 0 && (
          <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-500 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-5" />
              <div>
                <AlertTitle className="text-base font-semibold mb-0">Action Required</AlertTitle>
                <AlertDescription className="text-sm opacity-90">
                  You have <strong>{kpis.pendingProofs}</strong> pending payment proof(s) awaiting your review.
                </AlertDescription>
              </div>
            </div>
            <Button size="sm" variant="outline" className="border-amber-500/30 hover:bg-amber-500/20" asChild>
              <Link to="/admin/payments">
                Review Proofs <ArrowRight className="size-4 ml-2" />
              </Link>
            </Button>
          </Alert>
        )}

        {/* Primary KPIs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* MRR Card */}
          <Card className="shadow-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Recurring Revenue</CardTitle>
              <div className="size-8 rounded-full bg-green-500/10 flex items-center justify-center">
                <DollarSign className="size-4 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{formatCurrency(kpis.mrrUsd)}</div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                ARR: {formatCurrency(kpis.arrUsd)}
              </p>
            </CardContent>
          </Card>

          {/* Active Tenants Card */}
          <Card className="shadow-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Storefronts</CardTitle>
              <div className="size-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Store className="size-4 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{kpis.activeTenants}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Out of {kpis.totalTenants} total registered
              </p>
            </CardContent>
          </Card>

          {/* Active Subscriptions */}
          <Card className="shadow-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Subscriptions</CardTitle>
              <div className="size-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                <CreditCard className="size-4 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{kpis.activeSubscriptions}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Currently generating revenue
              </p>
            </CardContent>
          </Card>

          {/* 30-Day Conversion */}
          <Card className="shadow-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">30-Day Conversion</CardTitle>
              <div className="size-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                <TrendingUp className="size-4 text-orange-600 dark:text-orange-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{formatPercent(kpis.conversionRate)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpis.activatedTenants30d} activated / {kpis.newTenants30d} signed up
              </p>
            </CardContent>
          </Card>

        </div>

        {/* Charts & Secondary Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Revenue Chart */}
          <Card className="lg:col-span-2 shadow-sm border-border">
            <CardHeader>
              <CardTitle className="text-lg">Revenue Timeline (Last 12 Weeks)</CardTitle>
              <CardDescription>Approved manual payments aggregated by week.</CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <div className="h-[300px] w-full mt-4">
                {kpis.revenueTimeline.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={kpis.revenueTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="week" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(val) => {
                          const d = new Date(val);
                          return `${d.getMonth()+1}/${d.getDate()}`;
                        }}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(val) => `$${val}`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                        formatter={(value: number) => [`$${value}`, "Revenue"]}
                        labelFormatter={(label) => `Week of ${label}`}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="total" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorRevenue)" 
                        activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg">
                    <Activity className="size-8 opacity-20 mb-2" />
                    <p className="text-sm">No revenue data available for the selected period.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats & Churn */}
          <Card className="shadow-sm border-border flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">Recent Platform Activity</CardTitle>
              <CardDescription>Activity overview from the last 30 days.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Users className="size-4" /> New Signups
                  </span>
                  <span className="font-semibold">{kpis.newTenants30d}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Store className="size-4" /> Activations
                  </span>
                  <span className="font-semibold text-green-600 dark:text-green-400">+{kpis.activatedTenants30d}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="size-4" /> Churned Subscriptions
                  </span>
                  <span className="font-semibold text-destructive">-{kpis.churned30d}</span>
                </div>
              </div>

              <div className="mt-auto pt-6 border-t border-border space-y-3">
                <h4 className="text-sm font-medium">Quick Links</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="w-full justify-start text-xs h-9" asChild>
                    <Link to="/admin/tenants">View Tenants</Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start text-xs h-9" asChild>
                    <Link to="/admin/plans">Manage Plans</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </AdminShell>
  );
}