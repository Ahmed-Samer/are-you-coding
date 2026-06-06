import { createFileRoute, useNavigate, useSearch, Link, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  AlertCircle,
  Clock
} from "lucide-react";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import {
  listPlans,
  createAccountSubscription,
  getMyAccountSubscription,
  getMyPendingSubscription,
  cancelPendingSubscription,
} from "@/lib/billing.functions";
import { formatPlanPrice, intervalLabel } from "@/lib/format-price";
import { quarterlySavingsPct } from "@/lib/pricing-static";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

const search = z.object({
  plan: z.string().max(64).optional(),
});

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Choose your plan — RentWebify" }] }),
  validateSearch: search,
  component: OnboardingPage,
});

type StepId = "plan" | "confirm";
const STEPS = [
  { id: "plan", label: "Choose Plan" },
  { id: "confirm", label: "Confirm" },
] as const;

export function OnboardingPage() {
  const navigate = useNavigate();
  const { plan: prefilledPlan } = useSearch({
    from: "/_authenticated/onboarding",
  });

  const accountSubFn = useServerFn(getMyAccountSubscription);
  const { data: accountSubData, isLoading: accountSubLoading } = useQuery({
    queryKey: ["my-account-subscription"],
    queryFn: () => accountSubFn(),
    staleTime: 2 * 60_000,
  });

  const fetchPlans = useServerFn(listPlans);
  const {
    data: plansData,
    isLoading: plansLoading,
    isError: plansError,
    refetch: refetchPlans,
    isFetching: plansFetching,
  } = useQuery({
    queryKey: ["plans"],
    queryFn: () => fetchPlans(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  const createAccountSubFn = useServerFn(createAccountSubscription);
  const cancelSubFn = useServerFn(cancelPendingSubscription);
  const pendingSubFn = useServerFn(getMyPendingSubscription);
  const queryClient = useQueryClient();

  const [step, setStep] = useState<StepId>("plan");
  const [interval, setInterval] = useState<"monthly" | "quarterly">("monthly");
  const [planSlug, setPlanSlug] = useState<string>(prefilledPlan ?? "");
  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [confirmCancelPending, setConfirmCancelPending] = useState(false);

  const accountSub = accountSubData?.subscription ?? null;
  const accountSubStatus = (accountSub?.status ?? null) as string | null;
  const hasActiveSubscription = accountSubStatus === "active";
  const hasPendingSubscription =
    accountSubStatus === "pending_payment" || accountSubStatus === "pending_review";

  const plans = (plansData?.plans ?? []) as Array<{
    slug: string;
    name: string;
    description: string | null;
    price_usd: number;
    currency: string;
    interval: string;
    features: string[] | null;
  }>;

  const filteredPlans = useMemo(
    () => plans.filter((p) => p.interval === interval),
    [plans, interval],
  );

  const selectedPlan = plans.find((p) => p.slug === planSlug);
  const effectivePlan = filteredPlans.find((p) => p.slug === planSlug);

  const deepLinkResolved = useRef(false);
  useEffect(() => {
    if (deepLinkResolved.current) return;
    if (!prefilledPlan) {
      deepLinkResolved.current = true;
      return;
    }
    if (!plansData) return;
    const match = plans.find((p) => p.slug === prefilledPlan);
    deepLinkResolved.current = true;
    if (!match) return;
    setInterval(match.interval === "quarterly" ? "quarterly" : "monthly");
    setPlanSlug(match.slug);
  }, [prefilledPlan, plansData, plans]);

  const switchInterval = useCallback(
    (next: "monthly" | "quarterly") => {
      if (interval === next) return;
      setInterval(next);
      const current = plans.find((p) => p.slug === planSlug);
      if (current?.interval !== next) {
        setPlanSlug("");
      }
    },
    [interval, planSlug, plans],
  );

  const onCreate = async () => {
    if (busy) return;
    if (!effectivePlan) {
      setPlanError("That plan is no longer available for this billing period.");
      toast.error("Please reselect your plan.");
      setStep("plan");
      return;
    }
    setBusy(true);
    setPlanError(null);
    try {
      const subRes = await createAccountSubFn({
        data: {
          planSlug,
          interval,
        },
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["my-account-subscription"] }),
      ]);

      toast.success("Subscription created! Let's complete payment.");
      navigate({
        to: "/checkout/$subscriptionId",
        params: { subscriptionId: subRes.subscriptionId },
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? "");
      let parsedMsg = raw;
      try {
        const p = JSON.parse(raw);
        if (p.code === "ALREADY_SUBSCRIBED") {
          toast.info("You already have an active subscription!");
          navigate({ to: "/dashboard" });
          return;
        }
        if (p.code === "PLAN_NOT_AVAILABLE" || p.code === "PLAN_INTERVAL_MISMATCH") {
          setPlanError(p.message || parsedMsg);
          setStep("plan");
          if (p.code === "PLAN_NOT_AVAILABLE") setPlanSlug("");
        }
        parsedMsg = p.message || parsedMsg;
      } catch {}
      toast.error(parsedMsg);
    } finally {
      setBusy(false);
    }
  };

  const onCancelPending = async () => {
    setBusy(true);
    try {
      // CRITICAL: do NOT trust accountSub.id — it is the latest row regardless
      // of status and can resolve to an active subscription under race. Always
      // fetch the pending-only id fresh, right before the cancel call.
      const { subscription: pendingSub } = await pendingSubFn();
      if (!pendingSub?.id) {
        toast.info("No pending checkout to cancel.");
        await queryClient.invalidateQueries({ queryKey: ["my-account-subscription"] });
        setConfirmCancelPending(false);
        return;
      }
      await cancelSubFn({ data: { subscriptionId: pendingSub.id } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-account-subscription"] }),
        queryClient.invalidateQueries({ queryKey: ["my-tenants"] }),
      ]);
      toast.success("Pending checkout cancelled. Pick a plan to start over.");
      setConfirmCancelPending(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (accountSubLoading) {
    return (
      <PlatformShell>
        <div className="mx-auto max-w-3xl px-6 py-20 flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading your account…</p>
        </div>
      </PlatformShell>
    );
  }

  // If user already has subscription, redirect to dashboard
  if (hasActiveSubscription) {
    return <Navigate to="/dashboard" />;
  }

  // If user has a pending subscription, show an interstitial instead of the
  // wizard — picking a plan here would create a duplicate account subscription.
  if (hasPendingSubscription && accountSub) {
    const isUnderReview = accountSubStatus === "pending_review";
    return (
      <PlatformShell>
        <div className="mx-auto max-w-2xl px-6 py-12">
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <Clock className="size-6 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-semibold tracking-tight">
                  {isUnderReview ? "Payment under review" : "You have a checkout in progress"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isUnderReview
                    ? "We've received your payment proof. Your account will be activated once it's verified — no action needed from you right now."
                    : "You've already started a subscription. Resume checkout to finish payment and activate your account."}
                </p>
                {!isUnderReview && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Starting over will cancel the pending subscription.
                  </p>
                )}
                <div className="mt-6 flex flex-col sm:flex-row gap-2 sm:items-center">
                  <Link
                    to="/checkout/$subscriptionId"
                    params={{ subscriptionId: accountSub.id }}
                    className="w-full sm:w-auto"
                  >
                    <Button className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white">
                      {isUnderReview ? "View status" : "Continue checkout"}
                    </Button>
                  </Link>
                  {!isUnderReview && (
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={busy}
                      onClick={() => setConfirmCancelPending(true)}
                    >
                      Cancel and start over
                    </Button>
                  )}
                  <Link to="/dashboard" className="w-full sm:w-auto">
                    <Button variant="ghost" className="w-full sm:w-auto">
                      Back to dashboard
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={confirmCancelPending}
          onOpenChange={(v) => { if (!v) setConfirmCancelPending(false); }}
          title="Cancel this checkout?"
          description="The pending subscription will be cancelled. You can pick a new plan after."
          confirmLabel="Yes, cancel"
          destructive
          loading={busy}
          onConfirm={onCancelPending}
        />
      </PlatformShell>
    );
  }

  return (
    <PlatformShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Choose your plan
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a subscription to start creating stores.
            </p>
          </div>
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" disabled={busy}>
              Cancel
            </Button>
          </Link>
        </div>

        <div className="mb-8">
          <Stepper steps={STEPS as any} current={step} />
        </div>

        <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
          {step === "plan" && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold">Pick your plan</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Switch anytime. Cancel anytime.</p>
                </div>
                <div
                  className="inline-flex items-center rounded-md border border-border p-0.5 text-xs"
                  role="group"
                  aria-label="Billing period"
                >
                  {(["monthly", "quarterly"] as const).map((i) => {
                    const savings = i === "quarterly" ? quarterlySavingsPct("Growth") : 0;
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={interval === i}
                        onClick={() => switchInterval(i)}
                        className={
                          "px-3 py-1.5 rounded-sm transition-colors " +
                          (interval === i
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:text-foreground")
                        }
                      >
                        {intervalLabel(i)}
                        {i === "quarterly" && savings > 0 && (
                          <span className="ml-1 text-[10px] uppercase">save {savings}%</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {plansLoading ? (
                <div className="text-sm text-muted-foreground">Loading plans…</div>
              ) : plansError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-foreground">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">We couldn't load the plans.</p>
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => refetchPlans()} disabled={plansFetching}>
                        {plansFetching ? <Loader2 className="size-3 mr-1 animate-spin" /> : "Retry"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : filteredPlans.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
                  No plans available for {intervalLabel(interval).toLowerCase()} billing.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3" role="radiogroup">
                  {filteredPlans.map((p) => {
                    const selected = planSlug === p.slug;
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPlanSlug(p.slug)}
                        className={
                          "text-left rounded-md border p-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                          (selected ? "border-foreground bg-accent" : "border-border hover:bg-accent/50")
                        }
                      >
                        <div className="flex items-baseline justify-between">
                          <span className="font-semibold">{p.name}</span>
                          <span className="text-sm font-semibold text-foreground">
                            {formatPlanPrice(p)}
                          </span>
                        </div>
                        {p.description && <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>}
                        {Array.isArray(p.features) && p.features.length > 0 && (
                          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                            {p.features.slice(0, 5).map((f: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <Check className="size-3 mt-0.5 text-foreground/70" />
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Confirm and proceed</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We'll create your account subscription and take you to checkout.
                </p>
              </div>
              {planError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-foreground">
                  {planError}
                </div>
              )}
              <dl className="divide-y divide-border rounded-md border border-border">
                {[
                  { k: "Billing", v: intervalLabel(interval) },
                  { k: "Plan", v: selectedPlan ? `${selectedPlan.name} · ${formatPlanPrice(selectedPlan)}` : "—" },
                ].map(({ k, v }) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <dt className="text-muted-foreground">{k}</dt>
                    <div className="flex items-center gap-3">
                      <dd className="font-medium text-foreground text-right">{v}</dd>
                      <button
                        type="button"
                        onClick={() => !busy && setStep("plan")}
                        disabled={busy}
                        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                Your account will be activated once your first payment is verified.
              </p>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep("plan")} disabled={step === "plan"}>
              <ArrowLeft className="size-4 mr-1" /> Back
            </Button>
            {step === "confirm" ? (
              <Button onClick={onCreate} disabled={busy || !effectivePlan}>
                {busy ? "Creating…" : "Proceed to checkout"}
              </Button>
            ) : (
              <Button onClick={() => setStep("confirm")} disabled={!effectivePlan}>
                Continue <ArrowRight className="size-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </PlatformShell>
  );
}
