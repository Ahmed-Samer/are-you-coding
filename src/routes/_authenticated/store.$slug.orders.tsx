import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store-context";
import { listMyOrders, updateOrderStatus } from "@/lib/catalog.functions";
import { formatPrice } from "@/lib/cart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Search, MessageCircle, Printer, PackageX } from "lucide-react";

export const Route = createFileRoute("/_authenticated/store/$slug/orders")({
  component: OrdersPage,
});

const STATUSES = ["whatsapp_sent", "confirmed", "fulfilled", "cancelled"] as const;
type Status = typeof STATUSES[number];

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "fulfilled") return "default";
  if (s === "cancelled") return "destructive";
  if (s === "confirmed") return "secondary";
  return "outline";
}

const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  whatsapp_sent: ["whatsapp_sent", "confirmed", "cancelled"],
  confirmed: ["confirmed", "fulfilled", "cancelled"],
  fulfilled: ["fulfilled"], // Terminal state, cannot be changed once fulfilled (to ensure integrity)
  cancelled: ["cancelled", "whatsapp_sent"], // Can only restart from the beginning if cancelled
};

const OrderRow = memo(function OrderRow({
  order: o,
  onSelect,
}: {
  order: any;
  onSelect: (o: any) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(o)}
      className="w-full text-left p-4 hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{o.customer_name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {o.customer_phone} · {new Date(o.created_at).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Badge variant={statusVariant(o.status)} className="capitalize">{o.status.replace(/_/g, " ")}</Badge>
          <div className="font-semibold tabular-nums text-sm">{formatPrice(o.subtotal_cents, o.currency)}</div>
        </div>
      </div>
    </button>
  );
});

function OrdersPage() {
  const { tenant } = useStore();
  const qc = useQueryClient();
  const fetcher = useServerFn(listMyOrders);
  const updateStatus = useServerFn(updateOrderStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["orders", tenant.id],
    queryFn: () => fetcher({ data: { tenantId: tenant.id } }),
    staleTime: 30_000, // 30s — orders are time-sensitive but no need to thrash
    refetchOnWindowFocus: true,
  });

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [range, setRange] = useState<"all" | "today" | "week" | "month">("all");
  const [openOrder, setOpenOrder] = useState<any | null>(null);
  const handleSelectOrder = useCallback((o: any) => setOpenOrder(o), []);

  const statusMut = useMutation({
    mutationFn: (input: { id: string; status: Status }) =>
      updateStatus({ data: { tenantId: tenant.id, ...input } }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["orders", tenant.id] });
      const prev = qc.getQueryData<any>(["orders", tenant.id]);
      qc.setQueryData(["orders", tenant.id], (old: any) => ({
        ...old,
        orders: (old?.orders ?? []).map((o: any) => o.id === input.id ? { ...o, status: input.status } : o),
      }));
      if (openOrder?.id === input.id) setOpenOrder({ ...openOrder, status: input.status });
      return { prev };
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["orders", tenant.id], ctx.prev);
      toast.error(e.message ?? "Failed");
    },
    onSuccess: () => toast.success("Status updated"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["orders", tenant.id] }),
  });

  const filtered = useMemo(() => {
    const rows = (data?.orders ?? []) as any[];
    const needle = q.trim().toLowerCase();
    let cutoff = 0;
    const now = Date.now();
    if (range === "today") cutoff = new Date(new Date().setHours(0,0,0,0)).getTime();
    else if (range === "week") cutoff = now - 7 * 86400_000;
    else if (range === "month") cutoff = now - 30 * 86400_000;
    return rows.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (cutoff && new Date(o.created_at).getTime() < cutoff) return false;
      if (needle) {
        const hay = `${o.customer_name} ${o.customer_phone} ${o.id}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, q, status, range]);

  function buildWhatsappMessage(o: any): string {
    const lines = [
      `Hi ${o.customer_name},`,
      ``,
      `Here is a recap of your order at ${tenant.name}:`,
      ...(o.items as any[]).map((it) => `• ${it.quantity}× ${it.name} — ${formatPrice(it.priceCents * it.quantity, o.currency)}`),
      ``,
      `Total: ${formatPrice(o.subtotal_cents, o.currency)}`,
    ];
    return lines.join("\n");
  }

  function resendWhatsApp(o: any) {
    const phone = (o.customer_phone || "").replace(/\D/g, "");
    if (!phone) {
      toast.error("No customer phone number on file.");
      return;
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsappMessage(o))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function printInvoice(o: any) {
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) return;
    const itemsHtml = (o.items as any[]).map((it) => `
      <tr>
        <td>${it.name}</td>
        <td style="text-align:right">${it.quantity}</td>
        <td style="text-align:right">${formatPrice(it.priceCents, o.currency)}</td>
        <td style="text-align:right">${formatPrice(it.priceCents * it.quantity, o.currency)}</td>
      </tr>`).join("");
    win.document.write(`<!doctype html><html><head><title>Invoice ${o.id.slice(0,8)}</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;padding:32px;max-width:720px;margin:0 auto}
        h1{font-size:20px;margin:0 0 4px}
        .muted{color:#64748b;font-size:12px}
        table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
        th,td{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left}
        th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
        .total{font-weight:600;font-size:16px;text-align:right;margin-top:16px}
        .box{margin-top:24px;padding:16px;border:1px solid #e2e8f0;border-radius:8px}
      </style></head><body>
      <h1>${tenant.name}</h1>
      <div class="muted">Invoice #${o.id.slice(0,8).toUpperCase()} · ${new Date(o.created_at).toLocaleString()}</div>
      <div class="box">
        <strong>${o.customer_name}</strong><br/>
        <span class="muted">${o.customer_phone}</span><br/>
        ${o.customer_address ? `<span class="muted">${o.customer_address}</span>` : ""}
      </div>
      <table>
        <thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="total">Total: ${formatPrice(o.subtotal_cents, o.currency)}</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),200)</script>
      </body></html>`);
    win.document.close();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Orders</h2>
      </div>

      <div className="mb-3 grid grid-cols-1 sm:grid-cols-[1fr_160px_140px] gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Search by name, phone, order #…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={(v) => setRange(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : (data?.orders ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
              <PackageX className="size-8" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No Orders Yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              When customers place orders on your storefront, they will appear here. Share your store link to get started!
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No orders match your filters.</div>
        ) : (
          filtered.map((o: any) => (
            <OrderRow key={o.id} order={o} onSelect={handleSelectOrder} />
          ))
        )}
      </div>

      {/* Order detail drawer */}
      <Sheet open={!!openOrder} onOpenChange={(v) => !v && setOpenOrder(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {openOrder && (
            <>
              <SheetHeader>
                <SheetTitle className="truncate">Order #{openOrder.id.slice(0, 8).toUpperCase()}</SheetTitle>
                <SheetDescription>{new Date(openOrder.created_at).toLocaleString()}</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <section>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Customer</h4>
                  <div className="text-sm font-medium">{openOrder.customer_name}</div>
                  <div className="text-sm text-muted-foreground">{openOrder.customer_phone}</div>
                  {openOrder.customer_address && (
                    <div className="mt-1 text-sm text-muted-foreground">{openOrder.customer_address}</div>
                  )}
                </section>

                <section>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Status</h4>
                  <Select value={openOrder.status} onValueChange={(v) => statusMut.mutate({ id: openOrder.id, status: v as Status })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => {
                        const isAllowed = ALLOWED_TRANSITIONS[openOrder.status as Status]?.includes(s);
                        return (
                          <SelectItem 
                            key={s} 
                            value={s} 
                            disabled={!isAllowed}
                            className="capitalize"
                          >
                            {s.replace(/_/g, " ")} {!isAllowed && "(Not Allowed)"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </section>

                <section>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Items</h4>
                  <ul className="rounded-md border border-border divide-y divide-border">
                    {(openOrder.items as any[]).map((it, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 p-3 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{it.name}</div>
                          <div className="text-xs text-muted-foreground">{it.quantity} × {formatPrice(it.priceCents, openOrder.currency)}</div>
                        </div>
                        <div className="tabular-nums font-medium shrink-0">{formatPrice(it.priceCents * it.quantity, openOrder.currency)}</div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-center justify-between text-base">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-semibold tabular-nums">{formatPrice(openOrder.subtotal_cents, openOrder.currency)}</span>
                  </div>
                </section>

                {openOrder.notes && (
                  <section>
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Notes</h4>
                    <p className="text-sm text-muted-foreground">{openOrder.notes}</p>
                  </section>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => resendWhatsApp(openOrder)}>
                    <MessageCircle className="size-4 mr-1.5" /> Message customer
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => printInvoice(openOrder)}>
                    <Printer className="size-4 mr-1.5" /> Print invoice
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
