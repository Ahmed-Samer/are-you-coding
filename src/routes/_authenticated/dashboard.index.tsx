import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { getMyTenants, cancelPendingSubscription } from "@/lib/billing.functions";
import { getMyTenantsWithStats } from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CardListSkeleton, StatCardSkeleton } from "@/components/ui/table-skeleton";
import { formatPrice } from "@/lib/cart";
import { Search, Store, ShoppingBag, TrendingUp, X } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({ meta: [{ title: "Dashboard — CoreWeb" }] }),
  component: DashboardPage,
});

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "pending") return "secondary";
  return "outline";
}

function DashboardPage() {
  const fetcher = useServerFn(getMyTenants);
  const statsFetcher = useServerFn(getMyTenantsWithStats);
  const cancelFn = useServerFn(cancelPendingSubscription);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetcher(),
  });
  const { data: statsData } = useQuery({
    queryKey: ["my-tenants-stats"],
    queryFn: () => statsFetcher(),
  });

  const [q, setQ] = useState("");
  const [cancelSubId, setCancelSubId] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasDraft(!!window.localStorage.getItem("coreweb:onboarding:draft"));
  }, []);

  const cancelMut = useMutation({
    mutationFn: (subscriptionId: string) => cancelFn({ data: { subscriptionId } }),
    onSuccess: () => {
      toast.success("Checkout cancelled");
      qc.invalidateQueries({ queryKey: ["my-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tenants = data?.tenants ?? [];
  const stats = statsData?.stats ?? {};

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return tenants;
    return tenants.filter((t: any) =>
      t.name.toLowerCase().includes(needle) || t.slug.toLowerCase().includes(needle),
    );
  }, [tenants, q]);

  // Aggregate analytics across all stores
  const totals = useMemo(() => {
    let ordersToday = 0;
    let revenueWeekCents = 0;
    for (const id of Object.keys(stats)) {
      ordersToday += (stats as any)[id].ordersToday;
      revenueWeekCents += (stats as any)[id].revenueWeekCents;
    }
    return { ordersToday, revenueWeekCents, storeCount: tenants.length };
  }, [stats, tenants.length]);

  return (
    <PlatformShell>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your stores</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your storefronts, billing, and team.
            </p>
          </div>
          <Link to="/templates">
            <Button className="w-full sm:w-auto">Create a new store</Button>
          </Link>
        </div>

        {hasDraft && (
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border bg-accent/40 p-4">
            <div className="text-sm">
              <div className="font-medium">Resume your setup</div>
              <p className="text-muted-foreground text-xs mt-0.5">
                You have an unfinished onboarding draft. Pick up where you left off.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  window.localStorage.removeItem("coreweb:onboarding:draft");
                  setHasDraft(false);
                }}
              >
                Dismiss
              </Button>
              <Link to="/onboarding">
                <Button size="sm">Resume onboarding</Button>
              </Link>
            </div>
          </div>
        )}

        {/* Analytics overview cards */}
        {isLoading ? (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
          </div>
        ) : tenants.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard icon={<Store className="size-4" />} label="Stores" value={totals.storeCount.toString()} />
            <StatCard icon={<ShoppingBag className="size-4" />} label="Orders today" value={totals.ordersToday.toString()} />
            <StatCard icon={<TrendingUp className="size-4" />} label="Revenue (7d)" value={formatPrice(totals.revenueWeekCents, "EGP")} />
          </div>
        ) : null}

        {/* Search */}
        {tenants.length > 3 && (
          <div className="mt-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search stores…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        <div className="mt-6 space-y-3">
          {isLoading ? (
            <CardListSkeleton items={3} />
          ) : tenants.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
              <h2 className="font-semibold">No stores yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick a template to launch your first storefront.
              </p>
              <Link to="/templates" className="mt-4 inline-block">
                <Button>Browse templates</Button>
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No stores match "{q}".
            </div>
          ) : (
            filtered.map((t: any) => {
              const sub = t.subscriptions?.[0];
              const s = (stats as any)[t.id];
              const subStatus: string | undefined = sub?.status;
              const isAwaitingReview = subStatus === "pending_review";
              const isAwaitingPayment = subStatus === "pending_payment";
              return (
                <div key={t.id} className="rounded-lg border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{t.name}</h3>
                      {isAwaitingReview ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        >
                          Awaiting approval
                        </Badge>
                      ) : (
                        <Badge variant={statusVariant(t.status)} className="capitalize">{t.status}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground truncate">
                      {t.slug}.coreweb.app
                      {sub?.plans?.name && <> · {sub.plans.name}</>}
                    </p>
                    {t.status === "active" && s && (
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span><span className="font-medium text-foreground">{s.ordersToday}</span> orders today</span>
                        <span><span className="font-medium text-foreground">{formatPrice(s.revenueWeekCents, "EGP")}</span> · 7d</span>
                      </div>
                    )}
                    {t.status !== "active" && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        We'll email you once payment is verified (usually &lt;24h).
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.status !== "active" && sub && (
                      <>
                        {isAwaitingReview ? (
                          <Link to="/checkout/$subscriptionId" params={{ subscriptionId: sub.id }}>
                            <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                              Submitted — under review
                            </Button>
                          </Link>
                        ) : isAwaitingPayment ? (
                          <Link to="/checkout/$subscriptionId" params={{ subscriptionId: sub.id }}>
                            <Button size="sm">Complete payment</Button>
                          </Link>
                        ) : (
                          <Link to="/checkout/$subscriptionId" params={{ subscriptionId: sub.id }}>
                            <Button size="sm">Complete payment</Button>
                          </Link>
                        )}
                        <Link to="/store/$slug/overview" params={{ slug: t.slug }}>
                          <Button size="sm" variant="outline">Manage (draft)</Button>
                        </Link>
                        {!isAwaitingReview && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={() => setCancelSubId(sub.id)}
                            aria-label="Cancel checkout"
                          >
                            <X className="size-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                    {t.status === "active" && (
                      <Link to="/store/$slug/overview" params={{ slug: t.slug }}>
                        <Button size="sm" variant="outline">Manage</Button>
                      </Link>
                    )}
                    <a
                      href={`/?store=${t.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Preview
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!cancelSubId}
        onOpenChange={(v) => { if (!v) setCancelSubId(null); }}
        title="Cancel this checkout?"
        description="The pending subscription will be cancelled. You can start a new one anytime."
        confirmLabel="Yes, cancel"
        destructive
        loading={cancelMut.isPending}
        onConfirm={() => {
          if (cancelSubId) {
            cancelMut.mutate(cancelSubId, { onSettled: () => setCancelSubId(null) });
          }
        }}
      />
    </PlatformShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}
