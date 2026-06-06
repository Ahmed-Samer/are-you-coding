import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Smartphone, Building, Zap, CreditCard } from "lucide-react";

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

import { listPaymentMethodsAdmin, upsertPaymentMethod, togglePaymentMethodActive, deletePaymentMethod } from "@/lib/admin.functions";

const methodsQuery = queryOptions({
  queryKey: ["admin", "payment-methods"],
  queryFn: () => listPaymentMethodsAdmin(),
});

export const Route = createFileRoute("/_authenticated/admin/payment-methods")({
  head: () => ({ meta: [{ title: "Admin — Payment Methods" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(methodsQuery),
  component: AdminPaymentMethodsPage,
});

type MethodFormState = {
  id?: string;
  kind: "instapay" | "vodafone_cash" | "bank_transfer";
  label: string;
  accountIdentifier: string;
  accountHolder: string;
  instructions: string;
  sortOrder: number;
  isActive: boolean;
};

const defaultFormState: MethodFormState = {
  kind: "vodafone_cash",
  label: "",
  accountIdentifier: "",
  accountHolder: "",
  instructions: "",
  sortOrder: 0,
  isActive: true,
};

export function AdminPaymentMethodsPage() {
  const { data } = useSuspenseQuery(methodsQuery);
  const qc = useQueryClient();

  const upsertFn = useServerFn(upsertPaymentMethod);
  const toggleFn = useServerFn(togglePaymentMethodActive);
  const deleteFn = useServerFn(deletePaymentMethod);

  const methods = data.methods ?? [];

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [formData, setFormData] = useState<MethodFormState>(defaultFormState);
  const [methodToDelete, setMethodToDelete] = useState<{ id: string; label: string } | null>(null);

  const upsertMut = useMutation({
    mutationFn: (payload: MethodFormState) => upsertFn({ data: payload }),
    onSuccess: () => {
      toast.success("Payment method saved successfully");
      setIsSheetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => toggleFn({ data: input }),
    onSuccess: () => {
      toast.success("Method visibility updated");
      qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Payment method deleted");
      setMethodToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleOpenEdit = (method?: any) => {
    if (method) {
      setFormData({
        id: method.id,
        kind: method.kind,
        label: method.label,
        accountIdentifier: method.account_identifier ?? "",
        accountHolder: method.account_holder ?? "",
        instructions: method.instructions ?? "",
        sortOrder: method.sort_order,
        isActive: method.is_active,
      });
    } else {
      setFormData(defaultFormState);
    }
    setIsSheetOpen(true);
  };

  const getMethodIcon = (kind: string) => {
    switch (kind) {
      case "vodafone_cash": return <Smartphone className="size-5 text-red-500" />;
      case "instapay": return <Zap className="size-5 text-purple-500" />;
      case "bank_transfer": return <Building className="size-5 text-blue-500" />;
      default: return <CreditCard className="size-5 text-muted-foreground" />;
    }
  };

  return (
    <AdminShell
      title="Payment Methods"
      description="Configure manual payment accounts displayed to users during checkout."
      breadcrumbs={[{ label: "Payment Methods" }]}
      actions={
        <Button onClick={() => handleOpenEdit()}>
          <Plus className="size-4 mr-2" /> Add Method
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {methods.map((method: any) => (
          <Card key={method.id} className={`shadow-sm border-border flex flex-col relative overflow-hidden transition-all ${!method.is_active ? 'opacity-70 bg-muted/30' : ''}`}>
            {!method.is_active && (
              <div className="absolute top-0 right-0 bg-secondary px-3 py-1 text-[10px] font-semibold tracking-widest uppercase rounded-bl-lg">
                Hidden
              </div>
            )}
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start mb-2">
                <div className="size-10 rounded-md bg-muted flex items-center justify-center border border-border">
                  {getMethodIcon(method.kind)}
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">Order: {method.sort_order}</Badge>
              </div>
              <CardTitle className="text-lg">{method.label}</CardTitle>
              <CardDescription className="capitalize text-xs font-medium">
                {method.kind.replace("_", " ")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              <div className="text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">Account / Number</p>
                <p className="font-mono font-medium">{method.account_identifier || "—"}</p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">Account Holder</p>
                <p className="font-medium">{method.account_holder || "—"}</p>
              </div>
              {method.instructions && (
                <div className="text-sm pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Instructions</p>
                  <p className="text-xs text-foreground/80 line-clamp-2">{method.instructions}</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="pt-4 border-t border-border bg-muted/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={method.is_active} 
                  onCheckedChange={(v) => toggleMut.mutate({ id: method.id, isActive: v })} 
                  disabled={toggleMut.isPending}
                />
                <span className="text-xs text-muted-foreground font-medium">Active</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleOpenEdit(method)}>
                  <Edit2 className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setMethodToDelete({ id: method.id, label: method.label })}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}

        {!methods.length && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center border border-dashed border-border rounded-xl bg-card text-center">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Plus className="size-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No payment methods</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">
              Add your Vodafone Cash, InstaPay, or Bank Transfer details to receive payments.
            </p>
            <Button onClick={() => handleOpenEdit()}>Add Payment Method</Button>
          </div>
        )}
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-md w-full overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{formData.id ? "Edit Payment Method" : "Add Payment Method"}</SheetTitle>
            <SheetDescription>Configure where and how users should send their payments.</SheetDescription>
          </SheetHeader>
          
          <form onSubmit={(e) => { e.preventDefault(); upsertMut.mutate(formData); }} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select 
                value={formData.kind} 
                onValueChange={(v: any) => setFormData({...formData, kind: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vodafone_cash">Vodafone Cash</SelectItem>
                  <SelectItem value="instapay">InstaPay</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Display Label</label>
              <Input 
                required 
                placeholder="e.g. Vodafone Cash (Primary)" 
                value={formData.label} 
                onChange={e => setFormData({...formData, label: e.target.value})} 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Account Identifier / Number</label>
              <Input 
                placeholder="e.g. 01000000000 or username@instapay" 
                value={formData.accountIdentifier} 
                onChange={e => setFormData({...formData, accountIdentifier: e.target.value})} 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Account Holder Name</label>
              <Input 
                placeholder="e.g. Ahmed Samir" 
                value={formData.accountHolder} 
                onChange={e => setFormData({...formData, accountHolder: e.target.value})} 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Customer Instructions</label>
              <Textarea 
                placeholder="e.g. Please transfer the exact amount and upload the screenshot..." 
                value={formData.instructions} 
                onChange={e => setFormData({...formData, instructions: e.target.value})} 
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border border-border mt-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Sort Order</label>
                <Input 
                  type="number" 
                  min={0} 
                  value={formData.sortOrder} 
                  onChange={e => setFormData({...formData, sortOrder: parseInt(e.target.value) || 0})} 
                />
              </div>
              <div className="space-y-1.5 flex flex-col justify-center">
                <label className="text-sm font-medium">Visibility</label>
                <div className="flex items-center gap-2 pt-1">
                  <Switch 
                    checked={formData.isActive} 
                    onCheckedChange={v => setFormData({...formData, isActive: v})} 
                  />
                  <span className="text-sm text-muted-foreground">{formData.isActive ? "Active" : "Hidden"}</span>
                </div>
              </div>
            </div>

            <SheetFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsertMut.isPending}>
                {upsertMut.isPending ? "Saving..." : "Save Method"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!methodToDelete}
        onOpenChange={(v) => !v && setMethodToDelete(null)}
        title="Delete Payment Method?"
        description={`Are you sure you want to permanently delete "${methodToDelete?.label}"? This will hide it from users during checkout.`}
        confirmLabel="Yes, Delete"
        destructive={true}
        loading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate(methodToDelete!.id)}
      />
    </AdminShell>
  );
}