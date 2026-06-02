import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarPlus, Gift, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  extendSubscription,
  grantComplimentaryPeriod,
  changePlan,
} from "@/lib/billing-admin.functions";
import { listPlansAdmin } from "@/lib/admin.functions";

type Subscription = {
  id: string;
  status: string;
  period_end: string | null;
  plans?: { name?: string; interval?: string; price_usd?: number } | null;
};

export function SubscriptionOverrideCard({
  tenantId,
  subscription,
}: {
  tenantId: string;
  subscription: Subscription | null;
}) {
  const qc = useQueryClient();
  const extendFn = useServerFn(extendSubscription);
  const compFn = useServerFn(grantComplimentaryPeriod);
  const changePlanFn = useServerFn(changePlan);

  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");
  const [compDays, setCompDays] = useState(30);
  const [compReason, setCompReason] = useState("");
  const [newPlanId, setNewPlanId] = useState<string>("");
  const [prorate, setProrate] = useState(false);
  const [planReason, setPlanReason] = useState("");

  const [confirmExtend, setConfirmExtend] = useState(false);
  const [confirmComp, setConfirmComp] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState(false);

  const plansQ = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: () => listPlansAdmin(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "tenant", tenantId] });
    qc.invalidateQueries({ queryKey: ["admin", "billing", tenantId] });
  };

  const extend = useMutation({
    mutationFn: () =>
      extendFn({ data: { subscriptionId: subscription!.id, days, reason } }),
    onSuccess: () => {
      toast.success(`Extended by ${days} days.`);
      setReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const comp = useMutation({
    mutationFn: () =>
      compFn({
        data: { subscriptionId: subscription!.id, days: compDays, reason: compReason },
      }),
    onSuccess: () => {
      toast.success(`Granted ${compDays} complimentary days.`);
      setCompReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const swap = useMutation({
    mutationFn: () =>
      changePlanFn({
        data: {
          subscriptionId: subscription!.id,
          newPlanId,
          prorate,
          reason: planReason,
        },
      }),
    onSuccess: () => {
      toast.success("Plan changed.");
      setPlanReason("");
      setNewPlanId("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!subscription) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        No active subscription to override.
      </div>
    );
  }

  const plans = (plansQ.data?.plans ?? []) as Array<{
    id: string;
    name: string;
    interval: string;
    price_usd: number;
    is_active: boolean;
  }>;
  const activePlans = plans.filter((p) => p.is_active);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold">Subscription overrides</h2>
        <p className="text-xs text-muted-foreground">
          Current: {subscription.plans?.name ?? "—"} ·{" "}
          {subscription.period_end
            ? `ends ${new Date(subscription.period_end).toLocaleDateString()}`
            : "no end date"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
        {/* Paid extension */}
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarPlus className="size-4" /> Extend period
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Days (1–365)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason (min 10 chars)</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Manual extension justification"
            />
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={days < 1 || reason.trim().length < 10 || extend.isPending}
            onClick={() => setConfirmExtend(true)}
          >
            Extend
          </Button>
        </div>

        {/* Comp period */}
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Gift className="size-4" /> Complimentary period
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Days (1–365)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={compDays}
              onChange={(e) => setCompDays(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason (min 10 chars)</Label>
            <Textarea
              rows={2}
              value={compReason}
              onChange={(e) => setCompReason(e.target.value)}
              placeholder="Why is this a goodwill gift?"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={compDays < 1 || compReason.trim().length < 10 || comp.isPending}
            onClick={() => setConfirmComp(true)}
          >
            Grant comp
          </Button>
        </div>

        {/* Change plan */}
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ArrowRightLeft className="size-4" /> Change plan
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Target plan</Label>
            <Select value={newPlanId} onValueChange={setNewPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a plan…" />
              </SelectTrigger>
              <SelectContent>
                {activePlans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · ${p.price_usd}/{p.interval}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={prorate}
              onChange={(e) => setProrate(e.target.checked)}
            />
            Prorate remaining time
          </label>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason (min 10 chars)</Label>
            <Textarea
              rows={2}
              value={planReason}
              onChange={(e) => setPlanReason(e.target.value)}
              placeholder="Why are we switching plans?"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={!newPlanId || planReason.trim().length < 10 || swap.isPending}
            onClick={() => setConfirmPlan(true)}
          >
            Change plan
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmExtend}
        onOpenChange={setConfirmExtend}
        title={`Extend by ${days} days?`}
        description="This will move the subscription's period_end forward and reactivate it if expired."
        confirmLabel="Extend"
        loading={extend.isPending}
        onConfirm={() => {
          extend.mutate();
          setConfirmExtend(false);
        }}
      />
      <ConfirmDialog
        open={confirmComp}
        onOpenChange={setConfirmComp}
        title={`Grant ${compDays} complimentary days?`}
        description="No charge is created. This is recorded as a goodwill adjustment."
        confirmLabel="Grant"
        loading={comp.isPending}
        onConfirm={() => {
          comp.mutate();
          setConfirmComp(false);
        }}
      />
      <ConfirmDialog
        open={confirmPlan}
        onOpenChange={setConfirmPlan}
        title="Change subscription plan?"
        description={
          prorate
            ? "Remaining value at the old plan will be prorated against the new plan's price."
            : "The plan switches immediately. Period end is not adjusted."
        }
        confirmLabel="Change plan"
        destructive
        confirmationText="CHANGE"
        loading={swap.isPending}
        onConfirm={() => {
          swap.mutate();
          setConfirmPlan(false);
        }}
      />
    </div>
  );
}
