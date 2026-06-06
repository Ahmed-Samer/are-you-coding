import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { getMyTenants, cancelPendingSubscription, getMyAccountSubscription } from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CardListSkeleton } from "@/components/ui/table-skeleton";
import { Search, Store, Clock, AlertCircle, RefreshCw, ArrowUp, Crown, Zap, Rocket } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { getStorefrontUrl, STORE_DOMAIN_SUFFIX } from "@/lib/branding";
import { UpgradeModal } from "@/components/billing/UpgradeModal";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({ meta: [{ title: "Dashboard — RentWebify" }] }),
  component: DashboardPage,
});

const TIER_COLORS: Record<string, string> = {
  Starter: "from-zinc-400 to-zinc-600",
  Growth: "from-blue-500 to-indigo-600",
  Scale: "from-amber-400 to-orange-500",
};

const TIER_ICONS: Record<string, typeof Crown> = {
  Starter: Zap,
  Growth: Rocket,
  Scale: Crown,
};

function DashboardPage() {
  const fetcher = useServerFn(getMyTenants);
  const cancelFn = useServerFn(cancelPendingSubscription);
  const accountSubFn = useServerFn(getMyAccountSubscription);
  const qc = useQueryClient();

  const { data, isLoading, error: fetchError, refetch } = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetcher(),
    retry: 1,
  });

  const { data: accountSubData } = useQuery({
    queryKey: ["my-account-subscription"],
    queryFn: () => accountSubFn(),
    staleTime: 2 * 60_000,
  });

  const [q, setQ] = useState("");
  const [cancelSubId, setCancelSubId] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const cancelMut = useMutation({
    mutationFn: (subscriptionId: string) => cancelFn({ data: { subscriptionId } }),
    onSuccess: () => {
      toast.success("Checkout cancelled");
      qc.invalidateQueries({ queryKey: ["my-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tenants = data?.tenants ?? [];
  const quota = data?.quota ?? {
    maxStores: 0,
    currentCount: 0,
    planName: "None",
    hasCustomDomain: false,
    canCreateMore: false,
  };

  // Get account subscription info for the upgrade modal
  const accountSub = accountSubData?.subscription;
  const accountSubStatus = accountSub?.status as string | undefined;
  const hasActiveSubscription = accountSubStatus === "active";
  const hasPendingSubscription =
    accountSubStatus === "pending_payment" || accountSubStatus === "pending_review";

  // Current plan slug for the upgrade modal
  const currentPlanSlug = (accountSub?.plans as any)?.slug ?? "";
  const currentMaxStores = quota.maxStores;
  const currentStoreCount = quota.currentCount;
  const currentPlanName = quota.planName;
  const canCreateMore = quota.canCreateMore;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return tenants;
    return tenants.filter((t: any) =>
      t.name.toLowerCase().includes(needle) || t.slug.toLowerCase().includes(needle),
    );
  }, [tenants, q]);

  const TierIcon = TIER_ICONS[currentPlanName] ?? Zap;
  const tierGradient = TIER_COLORS[currentPlanName] ?? "from-zinc-400 to-zinc-600";
  const progressPct =
    currentMaxStores > 0 ? Math.min((currentStoreCount / currentMaxStores) * 100, 100) : 0;

  return (
    <PlatformShell>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your platforms</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your storefronts and billing.
            </p>
          </div>
          {/* Deploy button — disabled when quota reached, hidden when no subscription */}
          {hasActiveSubscription && (
            canCreateMore ? (
              <Link to="/new-store">
                <Button className="w-full sm:w-auto">Deploy a new platform</Button>
              </Link>
            ) : (
              <Button
                className="w-full sm:w-auto gap-1.5"
                variant="outline"
                onClick={() => setUpgradeOpen(true)}
              >
                <ArrowUp className="size-4" />
                Upgrade to create more stores
              </Button>
            )
          )}
          {!hasActiveSubscription && !hasPendingSubscription && (
            <Link to="/onboarding">
              <Button className="w-full sm:w-auto">Choose a plan</Button>
            </Link>
          )}
          {hasPendingSubscription && accountSub && (
            <Link to="/checkout/$subscriptionId" params={{ subscriptionId: accountSub.id }}>
              <Button className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white">
                Complete Payment
              </Button>
            </Link>
          )}
        </div>

        {/* Quota Progress Bar — only show when subscription is active */}
        {hasActiveSubscription && (
          <div className="mt-6 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`size-10 rounded-lg bg-gradient-to-br ${tierGradient} flex items-center justify-center shrink-0`}
                >
                  <TierIcon className="size-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{currentPlanName} Plan</span>
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                      Active
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currentStoreCount} of {currentMaxStores} store{currentMaxStores !== 1 ? "s" : ""} used
                    {quota.hasCustomDomain && (
                      <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                        · Custom domains included
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {/* Upgrade button */}
              {currentPlanName !== "Scale" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs gap-1 shrink-0"
                  onClick={() => setUpgradeOpen(true)}
                >
                  <ArrowUp className="size-3" />
                  Upgrade
                </Button>
              )}
            </div>
            {/* Progress bar */}
            <div className="mt-3">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${tierGradient} transition-all duration-700 ease-out`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            {/* Warning when near or at quota */}
            {!canCreateMore && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertCircle className="size-3 shrink-0" />
                You've reached your store limit.
                {currentPlanName !== "Scale" && (
                  <button
                    type="button"
                    onClick={() => setUpgradeOpen(true)}
                    className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300 font-medium"
                  >
                    Upgrade your plan
                  </button>
                )}
              </p>
            )}
          </div>
        )}

        {/* Pending subscription banner */}
        {hasPendingSubscription && accountSub && (
          <div className="mt-6 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                  <Clock className="size-4" />
                  {accountSubStatus === "pending_review"
                    ? "Payment under review"
                    : "Complete your payment"}
                </div>
                <p className="text-blue-700/80 dark:text-blue-400/80 text-xs mt-0.5">
                  {accountSubStatus === "pending_review"
                    ? "We've received your payment proof. Your account will be activated once verified."
                    : "Complete the payment to activate your account subscription and start creating stores."}
                </p>
              </div>
              <Link to="/checkout/$subscriptionId" params={{ subscriptionId: accountSub.id }}>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  {accountSubStatus === "pending_review" ? "View Status" : "Complete Payment"}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Search */}
        {tenants.length > 0 && !fetchError && (
          <div className="mt-6 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
               placeholder="Search platforms…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        <div className="mt-6 space-y-3">
          {fetchError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
              <div className="flex items-center gap-2 font-semibold text-lg">
                <AlertCircle className="size-5" /> Failed to load platforms
              </div>
              <p className="mt-2 text-destructive/80 font-mono text-xs break-all">
                {fetchError.message}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
                <RefreshCw className="size-3 mr-2" /> Retry
              </Button>
            </div>
          ) : isLoading ? (
            <CardListSkeleton items={3} />
          ) : tenants.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center flex flex-col items-center">
              <Store className="size-10 text-muted-foreground/50 mb-4" />
              <h2 className="font-semibold">No platforms yet</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
                {hasActiveSubscription
                  ? "Deploy your first storefront and start selling today."
                  : "Subscribe to a plan first, then deploy your storefront."}
              </p>
              <Link to={hasActiveSubscription ? "/new-store" : "/onboarding"} className="mt-6 inline-block">
                <Button>
                  {hasActiveSubscription ? "Deploy your platform" : "Choose a plan"}
                </Button>
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No platforms match "{q}".
            </div>
          ) : (
            filtered.map((t: any) => {
              const isActive = t.status === "active";
              const tenantStatus = (t.status ?? "active") as string;
              const manageLabel = isActive
                ? "Manage Store"
                : tenantStatus === "suspended"
                  ? "View Store"
                  : "Open Store";

              return (
                <div key={t.id} className="rounded-lg border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-primary/20 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg truncate">{t.name}</h3>
                      <Badge variant={isActive ? "default" : "secondary"} className="capitalize">
                        {tenantStatus}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5 truncate">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{t.slug}{STORE_DOMAIN_SUFFIX}</span>
                      {hasActiveSubscription && (
                        <span>· {currentPlanName} Plan</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <Link to="/store/$slug/overview" params={{ slug: t.slug }}>
                      <Button size="sm" variant={isActive ? "default" : "outline"}>
                        {manageLabel}
                      </Button>
                    </Link>
                    {isActive && (() => {
                        const previewUrl = getStorefrontUrl(t.slug);
                        return (
                          <a
                            href={previewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline px-2"
                          >
                            Preview
                          </a>
                        );
                    })()}
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

      {/* Upgrade Modal */}
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        currentPlanSlug={currentPlanSlug}
        currentMaxStores={currentMaxStores}
        currentStoreCount={currentStoreCount}
      />
    </PlatformShell>
  );
}