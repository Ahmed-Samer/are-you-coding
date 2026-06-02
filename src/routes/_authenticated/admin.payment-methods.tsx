import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  listPaymentMethodsAdmin,
  upsertPaymentMethod,
  togglePaymentMethodActive,
  deletePaymentMethod,
} from "@/lib/admin.functions";

type Method = {
  id: string;
  kind: "instapay" | "vodafone_cash" | "bank_transfer";
  label: string;
  account_identifier: string | null;
  account_holder: string | null;
  instructions: string | null;
  sort_order: number;
  is_active: boolean;
};

type Draft = {
  id?: string;
  kind: Method["kind"];
  label: string;
  account_identifier: string;
  instructions: string;
  is_active: boolean;
};

const methodsQuery = queryOptions({
  queryKey: ["admin", "payment-methods"],
  queryFn: () => listPaymentMethodsAdmin(),
});

export const Route = createFileRoute("/_authenticated/admin/payment-methods")({
  head: () => ({ meta: [{ title: "Admin — Payment methods" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(methodsQuery),
  component: PaymentMethodsPage,
});

function blank(): Draft {
  return { kind: "instapay", label: "", account_identifier: "", instructions: "", is_active: true };
}

function PaymentMethodsPage() {
  const { data } = useSuspenseQuery(methodsQuery);
  const methods = (data.methods ?? []) as Method[];
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertPaymentMethod);
  const toggleFn = useServerFn(togglePaymentMethodActive);
  const removeFn = useServerFn(deletePaymentMethod);

  const upsert = useMutation({
    mutationFn: (input: any) => upsertFn({ data: input }),
    onSuccess: () => { toast.success("Payment method saved"); qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => toggleFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["admin", "payment-methods"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editing, setEditing] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Method | null>(null);

  function openEdit(m: Method) {
    setEditing({
      id: m.id,
      kind: m.kind,
      label: m.label,
      account_identifier: m.account_identifier ?? "",
      instructions: m.instructions ?? "",
      is_active: m.is_active,
    });
  }

  function save() {
    if (!editing) return;
    upsert.mutate(
      {
        id: editing.id,
        kind: editing.kind,
        label: editing.label,
        accountIdentifier: editing.account_identifier || undefined,
        instructions: editing.instructions || undefined,
        isActive: editing.is_active,
        sortOrder: 0,
      },
      { onSuccess: () => setEditing(null) },
    );
  }

  return (
    <AdminShell
      title="Payment methods"
      description="Manual checkout instructions presented to tenants when activating their subscription."
      breadcrumbs={[{ label: "Payment methods" }]}
      actions={
        <Button size="sm" onClick={() => setEditing(blank())}>
          <Plus className="size-4" /> New method
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {methods.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            No payment methods yet.
          </div>
        )}
        {methods.map((m) => (
          <div key={m.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{m.label}</h3>
                  <Badge variant="outline" className="capitalize">{m.kind.replace("_", " ")}</Badge>
                </div>
                <div className="mt-1 text-sm text-muted-foreground font-mono">{m.account_identifier ?? "—"}</div>
              </div>
              <Switch
                checked={m.is_active}
                onCheckedChange={(v) => toggle.mutate({ id: m.id, isActive: v })}
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{m.instructions ?? ""}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(m)}>
                <Pencil className="size-4" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRemoving(m)}>
                <Trash2 className="size-4" /> Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit" : "New"} payment method</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="pm-label">Label</Label>
                <Input id="pm-label" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pm-kind">Kind</Label>
                <Select value={editing.kind} onValueChange={(v) => setEditing({ ...editing, kind: v as Method["kind"] })}>
                  <SelectTrigger id="pm-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instapay">InstaPay</SelectItem>
                    <SelectItem value="vodafone_cash">Vodafone Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pm-acct">Account identifier</Label>
                <Input id="pm-acct" value={editing.account_identifier} onChange={(e) => setEditing({ ...editing, account_identifier: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pm-inst">Instructions</Label>
                <Textarea id="pm-inst" rows={4} value={editing.instructions} onChange={(e) => setEditing({ ...editing, instructions: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={!editing?.label || upsert.isPending} onClick={save}>
              Save method
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.label}?`}
        description="Tenants will no longer see this method at checkout."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(removing.id);
          setRemoving(null);
        }}
      />
    </AdminShell>
  );
}
