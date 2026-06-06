import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store-context";
import { listPromos, upsertPromo, deletePromo } from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { formatPrice } from "@/lib/cart";
import { Tag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/store/$slug/promos")({
  component: PromosPage,
});

type PromoForm = {
  id?: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  minSubtotalCents: number;
  maxRedemptions: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
};

function emptyForm(): PromoForm {
  return {
    code: "", type: "percent", value: 10, minSubtotalCents: 0,
    maxRedemptions: null, startsAt: null, expiresAt: null, isActive: true,
  };
}

function toIsoOrNull(local: string | null): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PromosPage() {
  const { tenant } = useStore();
  const qc = useQueryClient();
  const list = useServerFn(listPromos);
  const save = useServerFn(upsertPromo);
  const del = useServerFn(deletePromo);

  const { data, isLoading } = useQuery({
    queryKey: ["promos", tenant.id],
    queryFn: () => list({ data: { tenantId: tenant.id } }),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PromoForm>(emptyForm());
  const [confirmDel, setConfirmDel] = useState<{ id: string; code: string } | null>(null);
  const currency = (tenant as any).currency ?? "EGP";

  const saveMut = useMutation({
    mutationFn: (input: any) => save({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promos", tenant.id] });
      setOpen(false);
      toast.success("Promo saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { tenantId: tenant.id, id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promos", tenant.id] });
      toast.success("Promo deleted");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  function openNew() { setForm(emptyForm()); setOpen(true); }
  function openEdit(p: any) {
    setForm({
      id: p.id, code: p.code, type: p.type, value: p.value,
      minSubtotalCents: p.min_subtotal_cents ?? 0,
      maxRedemptions: p.max_redemptions ?? null,
      startsAt: p.starts_at ?? null,
      expiresAt: p.expires_at ?? null,
      isActive: !!p.is_active,
    });
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    saveMut.mutate({
      tenantId: tenant.id,
      id: form.id,
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: Number(form.value) || 0,
      minSubtotalCents: Number(form.minSubtotalCents) || 0,
      maxRedemptions: form.maxRedemptions ?? null,
      startsAt: form.startsAt,
      expiresAt: form.expiresAt,
      isActive: form.isActive,
    });
  }

  const promos = data?.promos ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Promo codes</h2>
          <p className="text-xs text-muted-foreground">Discounts customers can apply at checkout.</p>
        </div>
        <Button onClick={openNew} size="sm">New promo</Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : promos.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center">
              <Tag className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-3 font-medium">No promo codes yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
              Create discount codes (percent off or fixed amount) for your customers.
            </p>
            <Button onClick={openNew} size="sm" className="mt-4">Create your first promo</Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {promos.map((p: any) => {
              const expired = p.expires_at && new Date(p.expires_at).getTime() < Date.now();
              return (
                <li key={p.id} className="flex items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{p.code}</span>
                      {!p.is_active && <Badge variant="secondary">Inactive</Badge>}
                      {expired && <Badge variant="destructive">Expired</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.type === "percent" ? `${p.value}% off` : `${formatPrice(p.value, currency)} off`}
                      {p.min_subtotal_cents > 0 && ` · min ${formatPrice(p.min_subtotal_cents, currency)}`}
                      {p.max_redemptions != null && ` · ${p.redemptions_count ?? 0}/${p.max_redemptions} used`}
                      {p.max_redemptions == null && p.redemptions_count > 0 && ` · ${p.redemptions_count} used`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDel({ id: p.id, code: p.code })}>Delete</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit promo" : "New promo"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <Label htmlFor="p-code">Code</Label>
              <Input id="p-code" required value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, "") })}
                placeholder="WELCOME10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="p-value">
                  {form.type === "percent" ? "Percent (1–100)" : `Amount (${currency} cents)`}
                </Label>
                <Input id="p-value" type="number" min={1} required value={form.value}
                  onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="p-min">Min subtotal (cents)</Label>
                <Input id="p-min" type="number" min={0} value={form.minSubtotalCents}
                  onChange={(e) => setForm({ ...form, minSubtotalCents: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="p-max">Max redemptions</Label>
                <Input id="p-max" type="number" min={1} value={form.maxRedemptions ?? ""}
                  placeholder="Unlimited"
                  onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="p-start">Starts at</Label>
                <Input id="p-start" type="datetime-local" value={toLocalInput(form.startsAt)}
                  onChange={(e) => setForm({ ...form, startsAt: toIsoOrNull(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="p-end">Expires at</Label>
                <Input id="p-end" type="datetime-local" value={toLocalInput(form.expiresAt)}
                  onChange={(e) => setForm({ ...form, expiresAt: toIsoOrNull(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Customers can apply this code at checkout.</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title={`Delete "${confirmDel?.code}"?`}
        description="Customers will no longer be able to apply this code."
        confirmLabel="Delete"
        destructive
        loading={delMut.isPending}
        onConfirm={() => { if (confirmDel) { delMut.mutate(confirmDel.id); setConfirmDel(null); } }}
      />
    </div>
  );
}
