import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Check, X } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { listPlansAdmin, upsertPlan, togglePlanActive } from "@/lib/admin.functions";

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_usd: number;
  interval: "monthly" | "yearly";
  features: string[] | null;
  sort_order: number;
  is_active: boolean;
};

const plansQuery = queryOptions({
  queryKey: ["admin", "plans"],
  queryFn: () => listPlansAdmin(),
});

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => ({ meta: [{ title: "Admin — Plans" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  component: PlansPage,
});

type Draft = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  price_usd: number;
  interval: "monthly" | "yearly";
  is_active: boolean;
};

function blank(): Draft {
  return { slug: "", name: "", description: "", price_usd: 0, interval: "monthly", is_active: true };
}

function PlansPage() {
  const { data } = useSuspenseQuery(plansQuery);
  const plans = (data.plans ?? []) as Plan[];
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertPlan);
  const toggleFn = useServerFn(togglePlanActive);

  const upsert = useMutation({
    mutationFn: (input: any) => upsertFn({ data: input }),
    onSuccess: () => { toast.success("Plan saved"); qc.invalidateQueries({ queryKey: ["admin", "plans"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => toggleFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [editing, setEditing] = useState<Draft | null>(null);
  const [features, setFeatures] = useState("");

  function openEdit(p: Plan) {
    setEditing({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description ?? "",
      price_usd: p.price_usd,
      interval: p.interval,
      is_active: p.is_active,
    });
    setFeatures((p.features ?? []).join("\n"));
  }

  function save() {
    if (!editing) return;
    upsert.mutate(
      {
        id: editing.id,
        slug: editing.slug,
        name: editing.name,
        description: editing.description || undefined,
        priceUsd: editing.price_usd,
        interval: editing.interval,
        features: features.split("\n").map((f) => f.trim()).filter(Boolean),
        isActive: editing.is_active,
        sortOrder: 0,
      },
      { onSuccess: () => setEditing(null) },
    );
  }

  return (
    <AdminShell
      title="Plans"
      description="Pricing tiers, intervals and the features each one unlocks."
      breadcrumbs={[{ label: "Plans" }]}
      actions={
        <Button size="sm" onClick={() => { setEditing(blank()); setFeatures(""); }}>
          <Plus className="size-4" /> New plan
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            No plans yet. Create one to get started.
          </div>
        )}
        {plans.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-5 flex flex-col">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{p.name}</h3>
                  <Badge variant="outline" className="capitalize">{p.interval}</Badge>
                </div>
                <div className="mt-2 text-3xl font-semibold tabular-nums">
                  ${p.price_usd}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{p.interval === "monthly" ? "mo" : "yr"}
                  </span>
                </div>
              </div>
              <Switch
                checked={p.is_active}
                onCheckedChange={(v) => toggle.mutate({ id: p.id, isActive: v })}
              />
            </div>
            <ul className="mt-4 space-y-1.5 text-sm flex-1">
              {(p.features ?? []).map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="size-3.5 text-emerald-600" />{f}
                </li>
              ))}
              {!(p.features?.length) && <li className="text-xs text-muted-foreground">No features listed.</li>}
            </ul>
            <div className="mt-4 flex items-center justify-between">
              {p.is_active ? (
                <Badge variant="secondary">Live</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground"><X className="size-3 mr-1" />Hidden</Badge>
              )}
              <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                <Pencil className="size-4" /> Edit
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} plan</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pl-name">Name</Label>
                  <Input id="pl-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pl-slug">Slug</Label>
                  <Input id="pl-slug" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="growth-monthly" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pl-interval">Interval</Label>
                  <Select value={editing.interval} onValueChange={(v) => setEditing({ ...editing, interval: v as "monthly" | "yearly" })}>
                    <SelectTrigger id="pl-interval"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="pl-price">Price (USD)</Label>
                  <Input id="pl-price" type="number" value={editing.price_usd} onChange={(e) => setEditing({ ...editing, price_usd: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label htmlFor="pl-desc">Description</Label>
                <Input id="pl-desc" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pl-feat">Features (one per line)</Label>
                <Textarea id="pl-feat" rows={5} value={features} onChange={(e) => setFeatures(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={!editing?.name || !editing?.slug || upsert.isPending}>
              Save plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
