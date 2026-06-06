import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store-context";
import {
  listMyProducts, listMyCategories, upsertProduct, deleteProduct, bulkProductAction, exportProductsCsv,
} from "@/lib/catalog.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatPrice } from "@/lib/cart";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, PackagePlus } from "lucide-react";

// Heavy admin-only modules — lazy-loaded so storefront visitors never download them
// and the products page itself ships a leaner initial chunk.
const ProductCsvImportDialog = lazy(() =>
  import("@/components/dashboard/ProductCsvImportDialog").then((m) => ({ default: m.ProductCsvImportDialog })),
);
const ProductGalleryEditor = lazy(() =>
  import("@/components/dashboard/ProductGalleryEditor").then((m) => ({ default: m.ProductGalleryEditor })),
);
const ProductVariantsEditor = lazy(() =>
  import("@/components/dashboard/ProductVariantsEditor").then((m) => ({ default: m.ProductVariantsEditor })),
);

export const Route = createFileRoute("/_authenticated/store/$slug/products")({
  component: ProductsPage,
});

type SortKey = "name" | "price_cents" | "stock" | "updated_at";
type SortDir = "asc" | "desc";

type ProductForm = {
  id?: string;
  name: string;
  sku: string;
  description: string;
  priceCents: number;
  currency: string;
  stock: number;
  imageUrl: string | null;
  isActive: boolean;
  categoryId: string | null;
  sortOrder: number;
};

function emptyForm(currency: string): ProductForm {
  return {
    name: "", sku: "", description: "", priceCents: 0, currency,
    stock: 0, imageUrl: null, isActive: true, categoryId: null, sortOrder: 0,
  };
}

export function ProductsPage() {
  const { tenant } = useStore();
  const lowStock = (tenant as any).low_stock_threshold ?? 5;
  const defaultCurrency = (tenant as any).currency ?? "EGP";
  const qc = useQueryClient();
  const list = useServerFn(listMyProducts);
  const listCats = useServerFn(listMyCategories);
  const save = useServerFn(upsertProduct);
  const del = useServerFn(deleteProduct);
  const bulk = useServerFn(bulkProductAction);
  const doExport = useServerFn(exportProductsCsv);
  const [importOpen, setImportOpen] = useState(false);

  async function handleExport() {
    try {
      const r = await doExport({ data: { tenantId: tenant.id } });
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `products-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${r.count} product${r.count === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["prods", tenant.id],
    queryFn: () => list({ data: { tenantId: tenant.id } }),
  });
  const { data: catsData } = useQuery({
    queryKey: ["cats", tenant.id],
    queryFn: () => listCats({ data: { tenantId: tenant.id } }),
  });
  const cats = catsData?.categories ?? [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm(defaultCurrency));
  const [uploading, setUploading] = useState(false);

  // filters & sort
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "hidden">("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // confirm dialogs
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<null | "delete">(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const saveMut = useMutation({
    mutationFn: (input: any) => save({ data: input }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["prods", tenant.id] });
      const prev = qc.getQueryData<any>(["prods", tenant.id]);
      if (input.id) {
        qc.setQueryData(["prods", tenant.id], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            products: (old.products ?? []).map((p: any) => 
              p.id === input.id 
                ? { ...p, name: input.name, sku: input.sku, price_cents: input.priceCents, stock: input.stock, is_active: input.isActive } 
                : p
            )
          };
        });
      }
      return { prev };
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["prods", tenant.id], ctx.prev);
      toast.error(e.message ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prods", tenant.id] });
      setOpen(false);
      toast.success("Product saved");
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { tenantId: tenant.id, id } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["prods", tenant.id] });
      const prev = qc.getQueryData<any>(["prods", tenant.id]);
      qc.setQueryData(["prods", tenant.id], (old: any) => ({
        ...old,
        products: (old?.products ?? []).filter((p: any) => p.id !== id),
      }));
      return { prev };
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["prods", tenant.id], ctx.prev);
      toast.error(e.message ?? "Failed");
    },
    onSuccess: () => toast.success("Deleted"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["prods", tenant.id] }),
  });
  const bulkMut = useMutation({
    mutationFn: (input: { ids: string[]; action: "delete" | "activate" | "hide" }) =>
      bulk({ data: { tenantId: tenant.id, ...input } }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["prods", tenant.id] });
      const prev = qc.getQueryData<any>(["prods", tenant.id]);
      qc.setQueryData(["prods", tenant.id], (old: any) => {
        if (!old) return old;
        const products = old.products ?? [];
        if (input.action === "delete") {
          return { ...old, products: products.filter((p: any) => !input.ids.includes(p.id)) };
        }
        if (input.action === "activate") {
          return { ...old, products: products.map((p: any) => input.ids.includes(p.id) ? { ...p, is_active: true } : p) };
        }
        if (input.action === "hide") {
          return { ...old, products: products.map((p: any) => input.ids.includes(p.id) ? { ...p, is_active: false } : p) };
        }
        return old;
      });
      return { prev };
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["prods", tenant.id], ctx.prev);
      toast.error(e.message ?? "Failed");
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["prods", tenant.id] });
      setSelected(new Set());
      toast.success(`Updated ${r.count} product${r.count === 1 ? "" : "s"}`);
    },
  });

  function openNew() { setForm(emptyForm(defaultCurrency)); setOpen(true); }
  const openEdit = useCallback((p: any) => {
    setForm({
      id: p.id, name: p.name, sku: p.sku ?? "", description: p.description ?? "",
      priceCents: p.price_cents, currency: p.currency, stock: p.stock,
      imageUrl: p.image_url, isActive: p.is_active, categoryId: p.category_id,
      sortOrder: p.sort_order,
    });
    setOpen(true);
  }, []);
  const askDelete = useCallback((id: string, name: string) => {
    setConfirmDel({ id, name });
  }, []);
  const toggleRowSelected = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${tenant.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("tenant-assets").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("tenant-assets").getPublicUrl(path);
      setForm((f) => ({ ...f, imageUrl: pub.publicUrl }));
      toast.success("Image uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const rows = (data?.products ?? []) as any[];
    const needle = q.trim().toLowerCase();
    const f = rows.filter((p) => {
      if (catFilter !== "all" && p.category_id !== catFilter) return false;
      if (statusFilter === "active" && !p.is_active) return false;
      if (statusFilter === "hidden" && p.is_active) return false;
      if (needle) {
        const hay = `${p.name} ${p.sku ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    f.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return f;
  }, [data, q, catFilter, statusFilter, sortKey, sortDir]);

  // keyboard shortcuts: n = new, / = focus search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openNew(); }
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">Products</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={handleExport} size="sm" variant="outline">Export CSV</Button>
          <Button onClick={() => setImportOpen(true)} size="sm" variant="outline">Import CSV</Button>
          <Button onClick={openNew} size="sm" className="flex-1 sm:flex-none">New product</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 grid grid-cols-1 sm:grid-cols-[1fr_180px_140px] gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input ref={searchRef} placeholder="Search by name or SKU…  (press /)" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span><strong>{selected.size}</strong> selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => bulkMut.mutate({ ids: [...selected], action: "activate" })}>Activate</Button>
            <Button size="sm" variant="outline" onClick={() => bulkMut.mutate({ ids: [...selected], action: "hide" })}>Hide</Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirmBulk("delete")}>Delete</Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : (data?.products ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
              <PackagePlus className="size-8" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Your Catalog is Empty</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              Start building your store by adding your first product. You can also import multiple products via CSV.
            </p>
            <div className="flex gap-3">
              <Button onClick={openNew}>Add First Product</Button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No products match your filters.</div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="w-full text-sm hidden md:table">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) filtered.forEach((p: any) => next.add(p.id));
                        else filtered.forEach((p: any) => next.delete(p.id));
                        setSelected(next);
                      }}
                    />
                  </th>
                  <SortableTh label="Product" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <th className="text-left font-medium px-4 py-2">SKU</th>
                  <SortableTh label="Price" k="price_cents" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <SortableTh label="Stock" k="stock" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <th className="text-left font-medium px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p: any) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    selected={selected.has(p.id)}
                    lowStock={lowStock}
                    onToggleSelect={toggleRowSelected}
                    onEdit={openEdit}
                    onAskDelete={askDelete}
                  />
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {filtered.map((p: any) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  selected={selected.has(p.id)}
                  lowStock={lowStock}
                  onToggleSelect={toggleRowSelected}
                  onEdit={openEdit}
                  onAskDelete={askDelete}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Edit/new dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="variants" disabled={!form.id}>
                Variants
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details">
          <form
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMut.mutate({
                tenantId: tenant.id, id: form.id,
                name: form.name.trim(), sku: form.sku.trim() || null,
                description: form.description.trim() || null,
                priceCents: Math.round(form.priceCents), currency: form.currency || defaultCurrency,
                stock: form.stock, imageUrl: form.imageUrl || null,
                isActive: form.isActive, categoryId: form.categoryId, sortOrder: form.sortOrder,
              });
            }}
          >
            <div className="sm:col-span-2">
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.categoryId ?? ""}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}
              >
                <option value="">Uncategorized</option>
                {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Price ({form.currency})</Label>
              <Input type="number" step="0.01" min={0} required
                value={(form.priceCents / 100).toString()}
                onChange={(e) => setForm({ ...form, priceCents: Math.round((parseFloat(e.target.value) || 0) * 100) })} />
            </div>
            <div>
              <Label>Stock</Label>
              <Input type="number" min={0} value={form.stock}
                onChange={(e) => setForm({ ...form, stock: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              {form.id ? (
                <Suspense fallback={<Skeleton className="h-32 w-full rounded-md" />}>
                  <ProductGalleryEditor productId={form.id} tenantId={tenant.id} />
                </Suspense>
              ) : (
                <>
                  <Label>Image</Label>
                  <div className="flex items-center gap-4 flex-wrap">
                    {form.imageUrl && <img src={form.imageUrl} alt="" width={64} height={64} loading="lazy" decoding="async" className="size-16 rounded-md object-cover border border-border" />}
                    <Input type="file" accept="image/*" disabled={uploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                    {form.imageUrl && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, imageUrl: null })}>Remove</Button>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Save the product first, then add more images to build a gallery.
                  </p>
                </>
              )}
            </div>
            <div className="sm:col-span-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <span className="text-sm">Active (visible in storefront)</span>
              </div>
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="submit" disabled={saveMut.isPending || uploading}>
                {saveMut.isPending ? "Saving…" : "Save product"}
              </Button>
            </DialogFooter>
          </form>
            </TabsContent>
            <TabsContent value="variants">
              {form.id ? (
                <Suspense fallback={<Skeleton className="h-32 w-full rounded-md" />}>
                  <ProductVariantsEditor
                    productId={form.id}
                    defaultPriceCents={form.priceCents}
                  />
                </Suspense>
              ) : (
                <p className="text-sm text-muted-foreground p-4">
                  Save the product first, then add variants.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title={`Delete "${confirmDel?.name}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={delMut.isPending}
        onConfirm={() => {
          if (confirmDel) {
            delMut.mutate(confirmDel.id);
            setConfirmDel(null);
          }
        }}
      />
      <ConfirmDialog
        open={confirmBulk === "delete"}
        onOpenChange={(v) => !v && setConfirmBulk(null)}
        title={`Delete ${selected.size} product${selected.size === 1 ? "" : "s"}?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={bulkMut.isPending}
        onConfirm={() => {
          bulkMut.mutate({ ids: [...selected], action: "delete" });
          setConfirmBulk(null);
        }}
      />
      {importOpen && (
        <Suspense fallback={null}>
          <ProductCsvImportDialog open={importOpen} onOpenChange={setImportOpen} tenantId={tenant.id} />
        </Suspense>
      )}
    </div>
  );
}

function SortableTh({
  label, k, sortKey, sortDir, onClick, align = "left",
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onClick: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <th className={`font-medium px-4 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}
      >
        {label}
        {!active ? <ArrowUpDown className="size-3 opacity-50" /> : sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      </button>
    </th>
  );
}

type ProductRowProps = {
  product: any;
  selected: boolean;
  lowStock: number;
  onToggleSelect: (id: string, checked: boolean) => void;
  onEdit: (product: any) => void;
  onAskDelete: (id: string, name: string) => void;
};

const ProductRow = memo(function ProductRow({
  product: p, selected, lowStock, onToggleSelect, onEdit, onAskDelete,
}: ProductRowProps) {
  return (
    <tr>
      <td className="px-4 py-3">
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onToggleSelect(p.id, v === true)}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-md bg-muted overflow-hidden flex items-center justify-center shrink-0">
            {p.image_url ? (
              <img src={p.image_url} alt={p.name} width={40} height={40} loading="lazy" decoding="async" className="size-full object-cover" />
            ) : <span className="text-xs text-muted-foreground">—</span>}
          </div>
          <div className="font-medium">{p.name}</div>
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{p.sku ?? "—"}</td>
      <td className="px-4 py-3 text-right tabular-nums">{formatPrice(p.price_cents, p.currency)}</td>
      <td className="px-4 py-3 text-right tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          {p.stock <= lowStock && p.is_active && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">Low</Badge>
          )}
          {p.stock}
        </span>
      </td>
      <td className="px-4 py-3">
        <Badge variant={p.is_active ? "default" : "outline"}>{p.is_active ? "Active" : "Hidden"}</Badge>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>Edit</Button>
        <Button variant="ghost" size="sm" onClick={() => onAskDelete(p.id, p.name)}>Delete</Button>
      </td>
    </tr>
  );
});

const ProductCard = memo(function ProductCard({
  product: p, selected, lowStock, onToggleSelect, onEdit, onAskDelete,
}: ProductRowProps) {
  return (
    <div className="p-4 flex gap-3">
      <Checkbox
        className="mt-1"
        checked={selected}
        onCheckedChange={(v) => onToggleSelect(p.id, v === true)}
      />
      <div className="size-14 rounded-md bg-muted overflow-hidden flex items-center justify-center shrink-0">
        {p.image_url ? <img src={p.image_url} alt="" width={56} height={56} loading="lazy" decoding="async" className="size-full object-cover" /> : <span className="text-xs text-muted-foreground">—</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-sm truncate">{p.name}</div>
          <Badge variant={p.is_active ? "default" : "outline"} className="shrink-0">{p.is_active ? "Active" : "Hidden"}</Badge>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{p.sku ?? "—"}</div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="tabular-nums font-medium">{formatPrice(p.price_cents, p.currency)}</span>
          <span className="text-xs text-muted-foreground tabular-nums inline-flex items-center gap-1.5">
            {p.stock <= lowStock && p.is_active && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">Low</Badge>
            )}
            Stock: {p.stock}
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          <Button variant="outline" size="sm" onClick={() => onEdit(p)}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={() => onAskDelete(p.id, p.name)}>Delete</Button>
        </div>
      </div>
    </div>
  );
});
