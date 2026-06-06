import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ArrowUp, Loader2, Crown, Zap, Rocket } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { upgradeAccountPlan } from "@/lib/billing-admin.functions";
import { STATIC_PLANS, TIER_ORDER } from "@/lib/pricing-static";

type UpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlanSlug: string;
  currentMaxStores: number;
  currentStoreCount: number;
};

const TIER_ICONS: Record<string, typeof Crown> = {
  Starter: Zap,
  Growth: Rocket,
  Scale: Crown,
};

const TIER_COLORS: Record<string, string> = {
  Starter: "from-zinc-400 to-zinc-600",
  Growth: "from-blue-500 to-indigo-600",
  Scale: "from-amber-400 to-orange-500",
};

const TIER_BORDER_COLORS: Record<string, string> = {
  Starter: "border-zinc-300 dark:border-zinc-600",
  Growth: "border-blue-400/50 dark:border-blue-500/40",
  Scale: "border-amber-400/50 dark:border-amber-500/40",
};

const TIER_BG_COLORS: Record<string, string> = {
  Starter: "bg-zinc-50 dark:bg-zinc-900/30",
  Growth: "bg-blue-50/50 dark:bg-blue-950/20",
  Scale: "bg-amber-50/50 dark:bg-amber-950/20",
};

export function UpgradeModal({
  open,
  onOpenChange,
  currentPlanSlug,
  currentMaxStores,
  currentStoreCount,
}: UpgradeModalProps) {
  const navigate = useNavigate();
  const upgradeFn = useServerFn(upgradeAccountPlan);
  const qc = useQueryClient();
  const [upgrading, setUpgrading] = useState<string | null>(null);

  // Determine current tier name from slug
  const currentTierName =
    currentPlanSlug.replace(/-monthly$|-quarterly$/, "").charAt(0).toUpperCase() +
    currentPlanSlug.replace(/-monthly$|-quarterly$/, "").slice(1);

  // Get the interval from current plan slug
  const currentInterval = currentPlanSlug.includes("quarterly") ? "quarterly" : "monthly";

  // Determine current tier index
  const currentTierIdx = TIER_ORDER.indexOf(currentTierName as any);

  // Get only plans that are a higher tier and match the same interval
  const upgradePlans = STATIC_PLANS.filter((p) => {
    const pIdx = TIER_ORDER.indexOf(p.name);
    return pIdx > currentTierIdx && p.interval === currentInterval;
  });

  const handleUpgrade = async (planSlug: string, planName: string) => {
    setUpgrading(planSlug);
    try {
      const res = await upgradeFn({ data: { newPlanSlug: planSlug } });
      if (res.subscriptionId) {
        toast.info(`Please complete the payment for ${planName} to activate your upgrade.`);
        navigate({ to: "/checkout/$subscriptionId", params: { subscriptionId: res.subscriptionId } });
      } else {
        toast.success(`Upgraded to ${planName}! Your new quota is now active.`);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["my-tenants"] }),
          qc.invalidateQueries({ queryKey: ["my-account-subscription"] }),
        ]);
        onOpenChange(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upgrade failed";
      toast.error(msg);
    } finally {
      setUpgrading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUp className="size-5 text-primary" />
            Upgrade your plan
          </DialogTitle>
          <DialogDescription>
            You're using{" "}
            <strong>
              {currentStoreCount}/{currentMaxStores}
            </strong>{" "}
            stores on the <strong className="capitalize">{currentTierName}</strong> plan.
            Upgrade to unlock more storefronts.
          </DialogDescription>
        </DialogHeader>

        {/* Current plan summary */}
        <div className={`rounded-lg border-2 ${TIER_BORDER_COLORS[currentTierName] ?? "border-border"} ${TIER_BG_COLORS[currentTierName] ?? ""} p-4`}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {(() => {
              const Icon = TIER_ICONS[currentTierName] ?? Zap;
              return <Icon className="size-4" />;
            })()}
            <span className="uppercase tracking-wider text-[11px] font-medium">Current plan</span>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-lg font-semibold capitalize">{currentTierName}</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {currentStoreCount}/{currentMaxStores} stores
              </Badge>
            </div>
          </div>
          <div className="mt-2">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${TIER_COLORS[currentTierName] ?? "from-zinc-400 to-zinc-600"} transition-all duration-500`}
                style={{
                  width: `${currentMaxStores > 0 ? Math.min((currentStoreCount / currentMaxStores) * 100, 100) : 0}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Available upgrades */}
        {upgradePlans.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <Crown className="size-8 mx-auto mb-2 text-amber-500" />
            <p className="font-medium text-foreground">You're on the highest plan!</p>
            <p className="mt-1 text-xs">
              Contact support if you need custom limits.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {upgradePlans.map((plan) => {
              const Icon = TIER_ICONS[plan.name] ?? Zap;
              const isUpgrading = upgrading === plan.slug;
              const maxStores =
                plan.name === "Growth" ? 3 : plan.name === "Scale" ? 10 : 1;

              return (
                <div
                  key={plan.slug}
                  className={`rounded-lg border-2 ${TIER_BORDER_COLORS[plan.name] ?? "border-border"} p-4 transition-colors hover:shadow-sm`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`size-8 rounded-lg bg-gradient-to-br ${TIER_COLORS[plan.name] ?? ""} flex items-center justify-center`}>
                          <Icon className="size-4 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{plan.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            ${plan.price_usd}/{plan.interval === "quarterly" ? "quarter" : "mo"}
                          </p>
                        </div>
                      </div>
                      <ul className="mt-3 space-y-1">
                        {plan.features.slice(0, 4).map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Check className="size-3 mt-0.5 text-emerald-500 shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="shrink-0 text-right space-y-2">
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {maxStores} stores
                      </Badge>
                      <Button
                        size="sm"
                        disabled={!!upgrading}
                        onClick={() => handleUpgrade(plan.slug, plan.name)}
                        className={`w-full ${
                          plan.name === "Scale"
                            ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
                            : ""
                        }`}
                      >
                        {isUpgrading ? (
                          <>
                            <Loader2 className="size-3 mr-1 animate-spin" />
                            Upgrading…
                          </>
                        ) : (
                          <>
                            <ArrowUp className="size-3 mr-1" />
                            Upgrade
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground text-center mt-1">
          Upgrades take effect immediately. Your existing stores stay untouched.
        </p>
      </DialogContent>
    </Dialog>
  );
}
