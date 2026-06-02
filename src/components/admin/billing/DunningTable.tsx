import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDunningQueue } from "@/lib/billing-admin.functions";

type DunningWindow = 7 | 14 | 30;

export function DunningTable() {
  const [window, setWindow] = useState<DunningWindow>(7);

  const q = useQuery({
    queryKey: ["admin", "billing", "dunning", window],
    queryFn: () => getDunningQueue({ data: { window } }),
  });

  const rows = q.data?.rows ?? [];

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Expiring subscriptions</h2>
          <p className="text-xs text-muted-foreground">
            Active subscriptions whose period_end falls within the selected window.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {[7, 14, 30].map((w) => (
            <Button
              key={w}
              size="sm"
              variant={window === w ? "default" : "outline"}
              onClick={() => setWindow(w as DunningWindow)}
            >
              {w}d
            </Button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Tenant</th>
              <th className="text-left px-4 py-2 font-medium">Owner email</th>
              <th className="text-left px-4 py-2 font-medium">Plan</th>
              <th className="text-right px-4 py-2 font-medium">Price</th>
              <th className="text-left px-4 py-2 font-medium">Period end</th>
              <th className="text-right px-4 py-2 font-medium">Days left</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  No expiring subscriptions in this window.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.subscriptionId}>
                <td className="px-4 py-2">
                  <div className="font-medium">{r.tenantName ?? "—"}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    /{r.tenantSlug ?? ""}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs">{r.ownerEmail ?? "—"}</td>
                <td className="px-4 py-2 capitalize">
                  {r.plan ?? "—"}
                  <span className="text-xs text-muted-foreground ml-1">{r.interval}</span>
                </td>
                <td className="px-4 py-2 text-right font-mono">${r.priceUsd}</td>
                <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                  {r.periodEnd ? new Date(r.periodEnd).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <Badge
                    variant={r.daysLeft <= 3 ? "destructive" : r.daysLeft <= 7 ? "secondary" : "outline"}
                  >
                    {r.daysLeft}d
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/admin/tenants/$tenantId"
                      params={{ tenantId: r.tenantId }}
                    >
                      Manage
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
