import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { DollarSign, Plus, ArrowRightLeft, TrendingUp, Calendar } from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { listFxRates, insertFxRate } from "@/lib/admin.functions";
import { timeAgo } from "@/lib/admin-utils";

const fxRatesQuery = queryOptions({
  queryKey: ["admin", "fx-rates"],
  queryFn: () => listFxRates(),
});

export const Route = createFileRoute("/_authenticated/admin/fx-rates")({
  head: () => ({ meta: [{ title: "Admin — FX Rates" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(fxRatesQuery),
  component: FxRatesPage,
});

export function FxRatesPage() {
  const { data } = useSuspenseQuery(fxRatesQuery);
  const qc = useQueryClient();
  const insertFn = useServerFn(insertFxRate);

  const rates = data.rates ?? [];
  const currentRate = rates[0] ?? null;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRate, setNewRate] = useState<number>(currentRate?.rate ?? 0);

  const insertMut = useMutation({
    mutationFn: (rate: number) => insertFn({ data: { rate, baseCurrency: "USD", quoteCurrency: "EGP" } }),
    onSuccess: () => {
      toast.success("New FX Rate applied successfully!");
      setIsModalOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "fx-rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminShell
      title="Foreign Exchange Rates"
      description="Manage the USD to EGP conversion rate used for platform billing and pricing."
      breadcrumbs={[{ label: "FX Rates" }]}
      actions={
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="size-4 mr-2" /> Update FX Rate
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Rate Card */}
        <Card className="lg:col-span-1 shadow-sm border-border bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="size-5 text-primary" /> Active Rate
            </CardTitle>
            <CardDescription>Currently applied system conversion</CardDescription>
          </CardHeader>
          <CardContent>
            {currentRate ? (
              <>
                <div className="flex items-center gap-4 py-4">
                  <div className="flex flex-col items-center">
                    <div className="size-12 rounded-full bg-background border border-border flex items-center justify-center font-bold text-lg shadow-sm">
                      1
                    </div>
                    <span className="text-xs text-muted-foreground mt-1 font-mono">{currentRate.base_currency}</span>
                  </div>
                  <ArrowRightLeft className="size-6 text-muted-foreground" />
                  <div className="flex flex-col items-center">
                    <div className="size-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shadow-sm">
                      {currentRate.rate}
                    </div>
                    <span className="text-xs text-muted-foreground mt-1 font-mono">{currentRate.quote_currency}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2 bg-background/50 w-fit px-2 py-1 rounded border border-border/50">
                  <Calendar className="size-3" /> Updated {timeAgo(currentRate.effective_at)}
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No FX rates configured.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Historical Ledger */}
        <Card className="lg:col-span-2 shadow-sm border-border">
          <CardHeader>
            <CardTitle className="text-lg">Historical Ledger</CardTitle>
            <CardDescription>Immutable record of all previous currency conversions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead>Base</TableHead>
                    <TableHead>Quote</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Effective Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((r: any, idx: number) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.base_currency}</TableCell>
                      <TableCell className="font-mono text-sm">{r.quote_currency}</TableCell>
                      <TableCell className="text-right font-medium">
                        {r.rate}
                        {idx === 0 && <Badge className="ml-2 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/10">Active</Badge>}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(r.effective_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!rates.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                        No historical rate data found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="size-5" /> Update Exchange Rate
            </DialogTitle>
            <DialogDescription>
              Set the new USD to EGP conversion rate. This will immediately affect all new manual payment calculations on the storefronts.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <div className="flex items-center gap-4 justify-center bg-muted/30 p-6 rounded-lg border border-border">
               <div className="text-center space-y-1">
                 <div className="font-mono text-xs text-muted-foreground">USD</div>
                 <div className="text-xl font-bold">1.00</div>
               </div>
               <ArrowRightLeft className="size-5 text-muted-foreground" />
               <div className="text-center space-y-1">
                 <div className="font-mono text-xs text-muted-foreground">EGP Rate</div>
                 <Input 
                   type="number" 
                   step="0.01" 
                   min="0.1"
                   value={newRate}
                   onChange={(e) => setNewRate(parseFloat(e.target.value) || 0)}
                   className="text-center font-bold text-lg w-28 h-10 border-primary/50 focus-visible:ring-primary"
                   autoFocus
                 />
               </div>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">
              A historical audit record will be automatically generated.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => insertMut.mutate(newRate)} 
              disabled={insertMut.isPending || newRate <= 0}
            >
              {insertMut.isPending ? "Applying..." : "Apply New Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}