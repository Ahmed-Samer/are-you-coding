import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCartRecoveryStats } from "@/lib/abandoned-carts.functions";
import { formatPrice } from "@/lib/cart";
import { StatCardSkeleton } from "@/components/ui/table-skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShoppingBag, TrendingUp, DollarSign, MessageCircle } from "lucide-react";

const WINDOWS: { value: 7 | 30 | 90; label: string }[] = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

export function RecoveryStatsCards({ tenantId, currency }: { tenantId: string; currency: string }) {
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const fetcher = useServerFn(getCartRecoveryStats);
  const { data, isLoading } = useQuery({
    queryKey: ["cart-recovery-stats", tenantId, windowDays],
    queryFn: () => fetcher({ data: { tenantId, windowDays } }),
    staleTime: 60_000,
  });

  const recoveryPct =
    data && data.abandoned > 0 ? Math.round((data.recoveryRate ?? 0) * 100) : 0;
  const ctrPct =
    data && (data.messagesSent ?? 0) > 0
      ? Math.round(((data.messagesClicked ?? 0) / (data.messagesSent || 1)) * 100)
      : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Recovery performance</h2>
        <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v) as 7 | 30 | 90)}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WINDOWS.map((w) => (
              <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading || !data ? (
          <><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /></>
        ) : (
          <>
            <Kpi
              icon={<ShoppingBag className="size-4" />}
              label="Abandoned carts"
              value={String(data.abandoned ?? 0)}
              sub={`of ${data.totalCarts ?? 0} total`}
            />
            <Kpi
              icon={<TrendingUp className="size-4" />}
              label="Recovered"
              value={String(data.recovered ?? 0)}
              sub={`${recoveryPct}% recovery rate`}
            />
            <Kpi
              icon={<DollarSign className="size-4" />}
              label="Recovered revenue"
              value={formatPrice(data.recoveredCents ?? 0, currency)}
            />
            <Kpi
              icon={<MessageCircle className="size-4" />}
              label="WhatsApp messages"
              value={String(data.messagesSent ?? 0)}
              sub={`${data.messagesClicked ?? 0} clicked · ${ctrPct}% CTR`}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}<span className="truncate">{label}</span>
      </div>
      <div className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}