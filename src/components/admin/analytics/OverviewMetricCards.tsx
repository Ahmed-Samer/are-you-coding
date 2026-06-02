import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Minus className="size-3" /> n/a</span>;
  }
  const up = pct >= 0;
  return (
    <span className={cn("text-xs inline-flex items-center gap-1 tabular-nums",
      up ? "text-emerald-600" : "text-rose-600")}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function Card({ label, value, hint, delta }: { label: string; value: string; hint?: string; delta?: number | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-2 flex items-center gap-2">
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        {delta !== undefined && <Delta pct={delta} />}
      </div>
    </div>
  );
}

export function OverviewMetricCards({
  mrrUsd, arrUsd, paidTenants, newSignups, conversionPct, deltas,
}: {
  mrrUsd: number;
  arrUsd: number;
  paidTenants: number;
  newSignups: number;
  conversionPct: number;
  deltas: { signups: number | null; revenue: number | null };
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="MRR" value={`$${mrrUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} hint={`ARR $${arrUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} delta={deltas.revenue} />
      <Card label="Paid tenants" value={String(paidTenants)} hint="active subscriptions" />
      <Card label="New signups" value={String(newSignups)} hint="in window" delta={deltas.signups} />
      <Card label="Conversion" value={`${conversionPct.toFixed(1)}%`} hint="paid / signups" />
    </div>
  );
}