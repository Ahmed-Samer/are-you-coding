import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Download, Image as ImageIcon, Search, X } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPendingProofs, reviewPaymentProof } from "@/lib/admin.functions";
import { downloadCsv, timeAgo } from "@/lib/admin-utils";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

type Proof = {
  id: string;
  status: "pending" | "approved" | "rejected";
  amount_usd: number | null;
  amount_egp: number | null;
  reference_number: string | null;
  created_at: string;
  tenants?: { name: string; slug: string } | null;
  payment_methods?: { label: string; kind: string } | null;
  subscriptions?: { plans?: { name: string; interval: string } | null } | null;
};

const proofsQuery = queryOptions({
  queryKey: ["admin", "proofs", "all"],
  queryFn: () => listPendingProofs(),
});

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({ meta: [{ title: "Admin — Payment proofs" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(proofsQuery),
  component: AdminPaymentsPage,
});

const TABS: { key: Proof["status"] | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function statusVariant(s: Proof["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (s === "approved") return "default";
  if (s === "pending") return "secondary";
  if (s === "rejected") return "destructive";
  return "outline";
}

export function AdminPaymentsPage() {
  const { data } = useSuspenseQuery(proofsQuery);
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewPaymentProof);
  const proofs = (data.proofs ?? []) as Proof[];

  const review = useMutation({
    mutationFn: (input: { proofId: string; decision: "approved" | "rejected"; reviewerNotes?: string }) =>
      reviewFn({ data: input }),
    onSuccess: (_r, vars) => {
      toast.success(`Proof ${vars.decision}`);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [tab, setTab] = useState<Proof["status"] | "all">("pending");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bulkConfirm, setBulkConfirm] = useState<null | "approved" | "rejected">(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return proofs.filter((p) => {
      if (tab !== "all" && p.status !== tab) return false;
      if (!q) return true;
      return (
        p.tenants?.name?.toLowerCase().includes(q) ||
        p.tenants?.slug?.toLowerCase().includes(q) ||
        p.reference_number?.toLowerCase().includes(q)
      );
    });
  }, [proofs, tab, query]);

  const counts = useMemo(
    () => ({
      all: proofs.length,
      pending: proofs.filter((p) => p.status === "pending").length,
      approved: proofs.filter((p) => p.status === "approved").length,
      rejected: proofs.filter((p) => p.status === "rejected").length,
    }),
    [proofs],
  );

  const active = activeId ? proofs.find((p) => p.id === activeId) ?? null : null;

  function decide(ids: string[], decision: "approved" | "rejected") {
    for (const id of ids) {
      review.mutate({ proofId: id, decision, reviewerNotes: notes[id] });
    }
    setSelected(new Set());
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!filtered.length) return;
      const idx = activeId ? filtered.findIndex((p) => p.id === activeId) : -1;
      if (e.key === "j") setActiveId(filtered[Math.min(filtered.length - 1, idx + 1)]?.id ?? filtered[0].id);
      if (e.key === "k") setActiveId(filtered[Math.max(0, idx - 1)]?.id ?? filtered[0].id);
      if ((e.key === "a" || e.key === "r") && active?.status === "pending") {
        decide([active.id], e.key === "a" ? "approved" : "rejected");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, activeId, active]);

  const allChecked = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  return (
    <AdminShell
      title="Payment proofs"
      description="Review manual payment submissions. Press A to approve, R to reject, J/K to navigate."
      breadcrumbs={[{ label: "Payment proofs" }]}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv(
              "payment-proofs.csv",
              filtered.map((p) => ({
                tenant: p.tenants?.name ?? "",
                plan: p.subscriptions?.plans?.name ?? "",
                method: p.payment_methods?.label ?? "",
                reference: p.reference_number ?? "",
                amount_usd: p.amount_usd ?? 0,
                amount_egp: p.amount_egp ?? 0,
                status: p.status,
                created_at: p.created_at,
              })),
            )
          }
        >
          <Download className="size-4" /> Export
        </Button>
      }
    >
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSelected(new Set()); }}
                className={
                  "px-3 h-7 text-xs rounded inline-flex items-center gap-1.5 transition-colors " +
                  (tab === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
                }
              >
                {t.label}
                <span className={"tabular-nums " + (tab === t.key ? "text-background/70" : "text-muted-foreground")}>
                  {counts[t.key]}
                </span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search tenant or reference…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
            <span className="text-sm">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setBulkConfirm("rejected")}>
                <X className="size-4" /> Reject all
              </Button>
              <Button size="sm" onClick={() => setBulkConfirm("approved")}>
                <Check className="size-4" /> Approve all
              </Button>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="pl-4 w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(v) => {
                    if (v) setSelected(new Set(filtered.map((p) => p.id)));
                    else setSelected(new Set());
                  }}
                />
              </TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">USD</TableHead>
              <TableHead className="text-right">EGP</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right pr-4">Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow
                key={p.id}
                data-state={activeId === p.id ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => setActiveId(p.id)}
              >
                <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={(v) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(p.id);
                        else next.delete(p.id);
                        return next;
                      });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{p.tenants?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground font-mono">/{p.tenants?.slug ?? ""}</div>
                </TableCell>
                <TableCell className="text-sm">
                  {p.subscriptions?.plans?.name ?? "—"}
                  {p.subscriptions?.plans?.interval && (
                    <span className="text-muted-foreground"> · {p.subscriptions.plans.interval}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{p.payment_methods?.label ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono">{p.reference_number ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">${p.amount_usd ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {(p.amount_egp ?? 0).toLocaleString()}
                </TableCell>
                <TableCell><Badge variant={statusVariant(p.status)} className="capitalize">{p.status}</Badge></TableCell>
                <TableCell className="text-right pr-4 text-xs text-muted-foreground">{timeAgo(p.created_at)}</TableCell>
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                  Nothing in this tab right now.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActiveId(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle>{active.tenants?.name ?? "Payment proof"}</SheetTitle>
                <SheetDescription>
                  {active.subscriptions?.plans?.name ?? "Plan"} · ref{" "}
                  <span className="font-mono">{active.reference_number ?? "—"}</span>
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 px-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Amount</div>
                    <div className="font-medium tabular-nums">
                      ${active.amount_usd ?? 0} · {(active.amount_egp ?? 0).toLocaleString()} EGP
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Method</div>
                    <div className="font-medium">{active.payment_methods?.label ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Submitted</div>
                    <div className="font-medium">{new Date(active.created_at).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <Badge variant={statusVariant(active.status)} className="capitalize">{active.status}</Badge>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-muted/30 aspect-[3/4] grid place-items-center overflow-hidden">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
                    <ImageIcon className="size-6" />
                    No screenshot attached
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Reviewer notes</label>
                  <Textarea
                    rows={3}
                    placeholder="Add a note for the audit log…"
                    value={notes[active.id] ?? ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [active.id]: e.target.value }))}
                  />
                </div>
              </div>

              {active.status === "pending" && (
                <div className="mt-6 flex items-center justify-end gap-2 px-4">
                  <Button variant="outline" disabled={review.isPending} onClick={() => decide([active.id], "rejected")}>
                    <X className="size-4" /> Reject (R)
                  </Button>
                  <Button disabled={review.isPending} onClick={() => decide([active.id], "approved")}>
                    <Check className="size-4" /> Approve (A)
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!bulkConfirm}
        onOpenChange={(v) => { if (!v) setBulkConfirm(null); }}
        title={bulkConfirm === "approved" ? "Approve selected proofs?" : "Reject selected proofs?"}
        description={
          bulkConfirm === "approved"
            ? `${selected.size} payment proof(s) will be approved and their subscriptions activated. This cannot be undone.`
            : `${selected.size} payment proof(s) will be rejected. Affected tenants will be notified to resubmit.`
        }
        confirmLabel={bulkConfirm === "approved" ? `Approve ${selected.size}` : `Reject ${selected.size}`}
        destructive={bulkConfirm === "rejected"}
        loading={review.isPending}
        onConfirm={() => {
          if (bulkConfirm) decide([...selected], bulkConfirm);
          setBulkConfirm(null);
        }}
      />
    </AdminShell>
  );
}
