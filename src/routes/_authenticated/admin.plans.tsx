import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, GripVertical, Check, X, AlertTriangle } from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

import { listPlansAdmin, upsertPlan, togglePlanActive, deletePlan } from "@/lib/admin.functions";

const plansQuery = queryOptions({
  queryKey: ["admin", "plans"],
  queryFn: () => listPlansAdmin(),
});

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => ({ meta: [{ title: "Admin — Subscription Plans" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  component: AdminPlansPage,
});

type PlanFormState = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  priceUsd: number;
  interval: "monthly" | "yearly";
  features: string[];
  sortOrder: number;
  isActive: boolean;
};

const defaultFormState: PlanFormState = {
  slug: "",
  name: "",
  description: "",
  priceUsd: 0,
  interval: "monthly",
  features: [""],
  sortOrder: 0,
  isActive: true,
};

export function AdminPlansPage() {
  const { data } = useSuspenseQuery(plansQuery);
  const qc = useQueryClient();

  const upsertFn = useServerFn(upsertPlan);
  const toggleFn = useServerFn(togglePlanActive);
  const deleteFn = useServerFn(deletePlan);

  const plans = data.plans ?? [];

  // Sheet and form state
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [formData, setFormData] = useState<PlanFormState>(defaultFormState);
  
  // Delete confirm state
  const [planToDelete, setPlanToDelete] = useState<{ id: string; name: string } | null>(null);

  // Mutations
  const upsertMut = useMutation({
    mutationFn: (payload: PlanFormState) => upsertFn({ data: payload }),
    onSuccess: () => {
      toast.success("Plan saved successfully");
      setIsSheetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => toggleFn({ data: input }),
    onSuccess: () => {
      toast.success("Plan visibility toggled");
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Plan permanently deleted");
      setPlanToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleOpenEdit = (plan?: any) => {
    if (plan) {
      setFormData({
        id: plan.id,
        slug: plan.slug,
        name: plan.name,
        description: plan.description ?? "",
        priceUsd: plan.price_usd,
        interval: plan.interval,
        features: plan.features?.length ? plan.features : [""],
        sortOrder: plan.sort_order,
        isActive: plan.is_active,
      });
    } else {
      setFormData(defaultFormState);
    }
    setIsSheetOpen(true);
  };

  const handleFeatureChange = (index: number, value: string) => {
    const newFeatures = [...formData.features];
    newFeatures[index] = value;
    setFormData({ ...formData, features: newFeatures });
  };

  const handleAddFeature = () => {
    setFormData({ ...formData, features: [...formData.features, ""] });
  };

  const handleRemoveFeature = (index: number) => {
    const newFeatures = formData.features.filter((_, i) => i !== index);
    if (newFeatures.length === 0) newFeatures.push(""); // Keep at least one empty input
    setFormData({ ...formData, features: newFeatures });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Clean up empty features before submitting
    const cleanedFeatures = formData.features.filter((f) => f.trim().length > 0);
    upsertMut.mutate({ ...formData, features: cleanedFeatures });
  };

  return (
    <AdminShell
      title="Subscription Plans"
      description="Design and manage pricing tiers, billing intervals, and feature lists."
      breadcrumbs={[{ label: "Plans" }]}
      actions={
        <Button onClick={() => handleOpenEdit()}>
          <Plus className="size-4 mr-2" /> Add New Plan
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan: any) => (
          <Card key={plan.id} className={`shadow-sm border-border flex flex-col relative overflow-hidden transition-all hover:shadow-md ${!plan.is_active ? 'opacity-70 bg-muted/30' : ''}`}>
            {!plan.is_active && (
              <div className="absolute top-0 right-0 bg-secondary px-3 py-1 text-[10px] font-semibold tracking-widest uppercase rounded-bl-lg">
                Hidden
              </div>
            )}
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start mb-2">
                <Badge variant="outline" className="font-mono text-xs">{plan.slug}</Badge>
                <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5 border border-border">
                  <span className="text-[10px] px-1.5 text-muted-foreground font-medium">Order: {plan.sort_order}</span>
                </div>
              </div>
              <CardTitle className="text-xl flex items-center justify-between">
                {plan.name}
              </CardTitle>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">${plan.price_usd}</span>
                <span className="text-sm text-muted-foreground font-medium">/ {plan.interval}</span>
              </div>
              {plan.description && (
                <CardDescription className="mt-3 text-sm line-clamp-2">
                  {plan.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-2.5">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Features included</p>
                <ul className="space-y-2">
                  {plan.features?.slice(0, 4).map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="size-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                  {(plan.features?.length > 4) && (
                    <li className="text-xs text-muted-foreground italic pl-6">
                      + {plan.features.length - 4} more features
                    </li>
                  )}
                  {(!plan.features || plan.features.length === 0) && (
                    <li className="text-xs text-muted-foreground italic">No features listed</li>
                  )}
                </ul>
              </div>
            </CardContent>
            <CardFooter className="pt-4 border-t border-border bg-muted/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={plan.is_active} 
                  onCheckedChange={(v) => toggleMut.mutate({ id: plan.id, isActive: v })} 
                  disabled={toggleMut.isPending}
                />
                <span className="text-xs text-muted-foreground font-medium">Active</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleOpenEdit(plan)}>
                  <Edit2 className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setPlanToDelete({ id: plan.id, name: plan.name })}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}

        {!plans.length && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center border border-dashed border-border rounded-xl bg-card text-center">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Plus className="size-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No plans defined</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">
              Create your first subscription plan to start charging your tenants for storefront access.
            </p>
            <Button onClick={() => handleOpenEdit()}>Create First Plan</Button>
          </div>
        )}
      </div>

      {/* Create / Edit Form Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{formData.id ? "Edit Plan" : "Create New Plan"}</SheetTitle>
            <SheetDescription>Configure pricing, billing interval, and features displayed to users.</SheetDescription>
          </SheetHeader>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Plan Name</label>
                <Input 
                  required 
                  placeholder="e.g. Pro Monthly" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Slug (Unique ID)</label>
                <Input 
                  required 
                  placeholder="e.g. pro-monthly" 
                  pattern="^[a-z0-9-]+$"
                  title="Lowercase letters, numbers, and hyphens only"
                  value={formData.slug} 
                  onChange={e => setFormData({...formData, slug: e.target.value.toLowerCase()})} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description (Optional)</label>
              <Textarea 
                placeholder="Brief summary of who this plan is for..." 
                value={formData.description} 
                onChange={e => setFormData({...formData, description: e.target.value})} 
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 border-y border-border py-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Price (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input 
                    type="number" 
                    required 
                    min={0} 
                    step="0.01" 
                    className="pl-7"
                    value={formData.priceUsd} 
                    onChange={e => setFormData({...formData, priceUsd: parseFloat(e.target.value) || 0})} 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Billing Interval</label>
                <Select 
                  value={formData.interval} 
                  onValueChange={(v: "monthly" | "yearly") => setFormData({...formData, interval: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Feature List</label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddFeature}>
                  <Plus className="size-3 mr-1.5" /> Add Item
                </Button>
              </div>
              <div className="space-y-2.5">
                {formData.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="cursor-move p-1 text-muted-foreground hover:text-foreground">
                      <GripVertical className="size-4" />
                    </div>
                    <Input 
                      placeholder="e.g. Unlimited Products" 
                      value={feature}
                      onChange={(e) => handleFeatureChange(idx, e.target.value)}
                      className="flex-1"
                    />
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveFeature(idx)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border border-border">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Sort Order</label>
                <Input 
                  type="number" 
                  min={0} 
                  value={formData.sortOrder} 
                  onChange={e => setFormData({...formData, sortOrder: parseInt(e.target.value) || 0})} 
                />
                <p className="text-[10px] text-muted-foreground">Lower numbers appear first</p>
              </div>
              <div className="space-y-1.5 flex flex-col justify-center">
                <label className="text-sm font-medium">Visibility</label>
                <div className="flex items-center gap-2 pt-1">
                  <Switch 
                    checked={formData.isActive} 
                    onCheckedChange={v => setFormData({...formData, isActive: v})} 
                  />
                  <span className="text-sm text-muted-foreground">{formData.isActive ? "Active (Visible)" : "Hidden"}</span>
                </div>
              </div>
            </div>

            <SheetFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsertMut.isPending}>
                {upsertMut.isPending ? "Saving..." : "Save Plan"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!planToDelete}
        onOpenChange={(v) => !v && setPlanToDelete(null)}
        title="Delete Subscription Plan?"
        description={`You are about to delete ${planToDelete?.name}. Warning: Active subscriptions using this plan might break. It's safer to mark the plan as "Hidden" (Inactive) instead of deleting it.`}
        confirmLabel="Yes, Delete Plan"
        destructive={true}
        loading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate(planToDelete!.id)}
      />
    </AdminShell>
  );
}