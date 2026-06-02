import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAbandonedCarts } from "@/lib/abandoned-carts.functions";
import { formatPrice } from "@/lib/cart";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type StatusFilter = "all" | "active" | "abandoned" | "recovered" | "converted" | "expired";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "secondary",
  abandoned: "outline",
  recovered: "default",
  converted: "default",
  expired: "outline",
};

function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function AbandonedCartsTable({ tenantId, currency }: { tenantId: string; currency: string }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const fetcher = useServerFn(listAbandonedCarts);
  const { data, isLoading } = useQuery({
    queryKey: ["abandoned-carts", tenantId, status],
    queryFn: () =>
      fetcher({
        data: {
          tenantId,
          limit: 50,
          ...(status !== "all" ? { status } : {}),
        },
      }),
    staleTime: 30_000,
  });

  const carts = data?.carts ?? [];

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Recent abandoned carts</h3>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="abandoned">Abandoned</SelectItem>
            <SelectItem value="recovered">Recovered</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="p-4"><TableSkeleton rows={5} /></div>
      ) : carts.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No carts in this window.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {carts.map((c: any) => {
            const items = Array.isArray(c.items) ? c.items : [];
            const itemCount = items.reduce((s: number, i: any) => s + (Number(i?.quantity) || 0), 0);
            return (
              <div key={c.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">
                    {c.customer_name || c.customer_phone || c.customer_email || "Anonymous"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.customer_phone || c.customer_email || "no contact"} · {itemCount} item{itemCount === 1 ? "" : "s"} · {timeAgo(c.last_activity_at)}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant={STATUS_VARIANTS[c.status] ?? "outline"} className="capitalize">
                    {String(c.status).replace(/_/g, " ")}
                  </Badge>
                  <div className="font-semibold tabular-nums text-sm w-24 text-right">
                    {formatPrice(c.subtotal_cents ?? 0, c.currency || currency)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}