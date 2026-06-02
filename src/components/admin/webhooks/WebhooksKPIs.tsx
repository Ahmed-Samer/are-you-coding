import { useQuery } from "@tanstack/react-query";
import { getWebhookKPIs } from "@/lib/webhooks-admin.functions";

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

export function WebhooksKPIs({ windowDays = 1 }: { windowDays?: number }) {
  const q = useQuery({
    queryKey: ["admin", "webhooks", "kpis", windowDays],
    queryFn: () => getWebhookKPIs({ data: { windowDays } }),
  });
  const c = q.data?.counts ?? { pending: 0, in_flight: 0, succeeded: 0, failed: 0, dead: 0 };
  const rate = q.data?.successRate ?? 0;
  const p95 = q.data?.p95LatencyMs ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <Tile label="Pending" value={c.pending} />
      <Tile label="In flight" value={c.in_flight} />
      <Tile label="Succeeded" value={c.succeeded} tone="text-emerald-600" />
      <Tile label="Retrying" value={c.failed} tone="text-amber-600" />
      <Tile label="Dead" value={c.dead} tone="text-destructive" />
      <Tile label="Success rate" value={`${(rate * 100).toFixed(1)}%`} />
      <Tile label="P95 latency" value={`${p95} ms`} />
    </div>
  );
}
