import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Check, Download, Image as ImageIcon, Search, X, ZoomIn } from "lucide-react";
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

const searchSchema = z.object({
  status: z.enum(["all", "pending", "approved", "rejected"]).default("pending").catch("pending"),
  q: z.string().optional(),
  page: z.number().int().min(1).default(1).catch(1),
});

const proofsQuery = (opts: z.infer<typeof searchSchema>) =>
  queryOptions({
    queryKey: ["admin", "proofs", opts],
    queryFn: () => listPendingProofs({ data: { status: opts.status, search: opts.q, page: opts.page, pageSize: 25 } }),
    placeholderData: keepPreviousData,
  });

export const Route = createFileRoute("/_authenticated/admin/payments")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Admin — Payment proofs" }] }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(proofsQuery(deps)),
  component: AdminPaymentsPage,
});

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

function statusVariant(s: string) {
  if (s === "approved") return "default";
  if (s === "pending") return "secondary";
  if (s === "rejected") return "destructive";
  return "outline";
}

export function AdminPaymentsPage() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(proofsQuery(searchParams));
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewPaymentProof);
  const proofs = data.proofs ?? [];
  const total = data.total ?? 0;

  const review = useMutation({
    mutationFn: (input: { proofId: string; decision: "approved" | "rejected"; reviewerNotes?: string }) =>
      reviewFn({ data: input }),
    onSuccess: (res, vars) => {
      toast.success(`Proof ${vars.decision}`);
      if (res.invalidate) {
        res.invalidate.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
      }
      qc.invalidateQueries({ queryKey: ["admin", "proofs"] });
      setActiveId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bulkConfirm, setBulkConfirm] = useState<null | "approved" | "rejected">(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [localQuery, setLocalQuery] = useState(searchParams.q ?? "");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      if (localQuery !== searchParams.q) {
        navigate({ search: (s) => ({ ...s, q: localQuery || undefined, page: 1 }) });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [localQuery, navigate, searchParams.q]);

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
      if (!proofs.length) return;
      const idx = activeId ? proofs.findIndex((p) => p.id === activeId) : -1;
      if (e.key === "j") setActiveId(proofs[Math.min(proofs.length - 1, idx + 1)]?.id ?? proofs[0].id);
      if (e.key === "k") setActiveId(proofs[Math.max(0, idx - 1)]?.id ?? proofs[0].id);
      if ((e.key === "a" || e.key === "r") && active?.status === "pending") {
        decide([active.id], e.key === "a" ? "approved" : "rejected");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [proofs, activeId, active]);

  const allChecked = proofs.length > 0 && proofs.every((p) => selected.has(p.id));

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
              proofs.map((p) => ({
                tenant: p.tenants?.name ?? "",
                plan: p.account_subscriptions?.plans?.name ?? "",
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
                onClick={() => {
                  navigate({ search: (s) => ({ ...s, status: t.key, page: 1 }) });
                  setSelected(new Set());
                }}
                className={
                  "px-3 h-7 text-xs rounded inline-flex items-center gap-1.5 transition-colors " +
                  (searchParams.status === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search reference..."
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
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
                    if (v) setSelected(new Set(proofs.map((p) => p.id)));
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
            {proofs.map((p) => (
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
                  {p.account_subscriptions?.plans?.name ?? "—"}
                  {p.account_subscriptions?.plans?.interval && (
                    <span className="text-muted-foreground"> · {p.account_subscriptions.plans.interval}</span>
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
            {!proofs.length && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                  Nothing found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {total > 25 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Showing {(searchParams.page - 1) * 25 + 1} to {Math.min(searchParams.page * 25, total)} of {total}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={searchParams.page <= 1}
                onClick={() => navigate({ search: (s) => ({ ...s, page: s.page - 1 }) })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={searchParams.page * 25 >= total}
                onClick={() => navigate({ search: (s) => ({ ...s, page: s.page + 1 }) })}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActiveId(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle>{active.tenants?.name ?? "Payment proof"}</SheetTitle>
                <SheetDescription>
                  {active.account_subscriptions?.plans?.name ?? "Plan"} · ref{" "}
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

                <div className="rounded-md border border-border bg-muted/30 aspect-[3/4] relative group overflow-hidden flex flex-col items-center justify-center">
                  {active.signedUrl ? (
                    <>
                      <img src={active.signedUrl} alt="Proof" className="object-cover w-full h-full cursor-zoom-in" onClick={() => setZoomImage(active.signedUrl)} />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                         <ZoomIn className="text-white size-8" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
                      <ImageIcon className="size-6" />
                      No screenshot attached
                    </div>
                  )}
                </div>

                {active.auditLogs?.length > 0 && (
                   <div className="mt-4">
                     <h4 className="text-sm font-medium mb-2 text-foreground">Audit Trail</h4>
                     <ul className="space-y-2 text-xs">
                       {active.auditLogs.map((log: any) => (
                         <li key={log.id} className="bg-muted/50 p-3 rounded-md border border-border">
                           <span className="font-semibold text-primary capitalize">{log.action.replace("proof.", "")}</span> on <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                           {log.diff?.notes && <p className="mt-1.5 text-muted-foreground border-l-2 border-primary/30 pl-2">"{log.diff.notes}"</p>}
                         </li>
                       ))}
                     </ul>
                   </div>
                )}

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
                <div className="mt-6 flex items-center justify-end gap-2 px-4 pb-6">
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

      {zoomImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setZoomImage(null)}>
           <img src={zoomImage} alt="Zoomed proof" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
        </div>
      )}

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