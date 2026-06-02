import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listBillingAdjustments } from "@/lib/billing-admin.functions";

type Adjustment = {
  id: string;
  kind: string;
  amount_usd: number | null;
  period_delta_days: number | null;
  reason: string;
  external_reference: string | null;
  actor_id: string;
  created_at: string;
};

function kindVariant(kind: string): "default" | "secondary" | "destructive" | "outline" {
  if (kind === "refund") return "destructive";
  if (kind === "credit_grant" || kind === "comp_extension") return "default";
  if (kind === "plan_change") return "secondary";
  return "outline";
}

export function BillingLedgerTable({ tenantId }: { tenantId: string }) {
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const q = useQuery({
    queryKey: ["admin", "billing", tenantId, "ledger", page],
    queryFn: () =>
      listBillingAdjustments({ data: { tenantId, page, pageSize } }),
  });

  const rows = (q.data?.adjustments ?? []) as Adjustment[];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Billing ledger</h2>
          <p className="text-xs text-muted-foreground">
            {total} adjustment{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Credit balance:{" "}
          <span className="font-semibold text-foreground">
            ${(q.data?.creditBalanceUsd ?? 0).toFixed(2)}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">When</th>
              <th className="text-left px-4 py-2 font-medium">Kind</th>
              <th className="text-right px-4 py-2 font-medium">Amount</th>
              <th className="text-right px-4 py-2 font-medium">Δ days</th>
              <th className="text-left px-4 py-2 font-medium">Reason</th>
              <th className="text-left px-4 py-2 font-medium">Ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No adjustments yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <Badge variant={kindVariant(r.kind)} className="capitalize">
                    {r.kind.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td
                  className={`px-4 py-2 text-right font-mono ${
                    (r.amount_usd ?? 0) < 0 ? "text-destructive" : ""
                  }`}
                >
                  {r.amount_usd != null ? `$${Number(r.amount_usd).toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {r.period_delta_days != null ? r.period_delta_days : "—"}
                </td>
                <td className="px-4 py-2 max-w-xs truncate" title={r.reason}>
                  {r.reason}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {r.external_reference ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
