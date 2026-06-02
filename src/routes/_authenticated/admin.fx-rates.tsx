import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { listFxRates, insertFxRate } from "@/lib/admin.functions";
import { timeAgo } from "@/lib/admin-utils";

type FxRate = {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: number;
  source: string | null;
  effective_at: string;
};

const fxQuery = queryOptions({
  queryKey: ["admin", "fx-rates"],
  queryFn: () => listFxRates(),
});

export const Route = createFileRoute("/_authenticated/admin/fx-rates")({
  head: () => ({ meta: [{ title: "Admin — FX rates" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(fxQuery),
  component: FxRatesPage,
});

function Chart({ values }: { values: number[] }) {
  if (values.length === 0) return <div className="text-sm text-muted-foreground">No data yet.</div>;
  const w = 600;
  const h = 120;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1 || 1);
  const pts = values.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
      <polyline fill="none" stroke="currentColor" strokeWidth={1.5} points={pts} />
    </svg>
  );
}

export function FxRatesPage() {
  const { data } = useSuspenseQuery(fxQuery);
  const rates = (data.rates ?? []) as FxRate[];
  const qc = useQueryClient();
  const insertFn = useServerFn(insertFxRate);

  const insert = useMutation({
    mutationFn: (input: any) => insertFn({ data: input }),
    onSuccess: () => { toast.success("Rate updated"); qc.invalidateQueries({ queryKey: ["admin", "fx-rates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ base: "USD", quote: "EGP", rate: "" });

  const current = rates[0];
  const series = useMemo(() => [...rates].reverse().map((r) => Number(r.rate)), [rates]);

  return (
    <AdminShell
      title="FX rates"
      description="Manual currency overrides used to display tenant prices in local currency."
      breadcrumbs={[{ label: "FX rates" }]}
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Override rate
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Current</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">
            {current ? Number(current.rate).toFixed(2) : "—"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {current ? `${current.base_currency}/${current.quote_currency} · ${timeAgo(current.effective_at)}` : "No rates yet"}
          </div>
          {current?.source && <Badge variant="outline" className="mt-3 capitalize">{current.source}</Badge>}
        </div>
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 text-foreground/70">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">History — last {rates.length} entries</h2>
            <span className="text-xs text-muted-foreground">manual + auto</span>
          </div>
          <div className="mt-3"><Chart values={series} /></div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border"><h2 className="text-sm font-semibold">History</h2></div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="pl-4">Pair</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right pr-4">Effective</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-4 font-medium">{r.base_currency}/{r.quote_currency}</TableCell>
                <TableCell className="tabular-nums">{Number(r.rate).toFixed(2)}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{r.source ?? "manual"}</Badge></TableCell>
                <TableCell className="text-right pr-4 text-xs text-muted-foreground">
                  {new Date(r.effective_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {!rates.length && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-sm text-muted-foreground">
                  No FX rates recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Override FX rate</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fx-base">Base</Label>
                <Input id="fx-base" value={draft.base} onChange={(e) => setDraft({ ...draft, base: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <Label htmlFor="fx-quote">Quote</Label>
                <Input id="fx-quote" value={draft.quote} onChange={(e) => setDraft({ ...draft, quote: e.target.value.toUpperCase() })} />
              </div>
            </div>
            <div>
              <Label htmlFor="fx-rate">Rate</Label>
              <Input id="fx-rate" type="number" step="0.01" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!draft.rate || isNaN(Number(draft.rate)) || insert.isPending}
              onClick={() => {
                insert.mutate(
                  { baseCurrency: draft.base, quoteCurrency: draft.quote, rate: Number(draft.rate) },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setDraft({ base: "USD", quote: "EGP", rate: "" });
                    },
                  },
                );
              }}
            >
              Apply rate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
