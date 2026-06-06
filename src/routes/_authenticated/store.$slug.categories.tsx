import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store-context";
import {
  listMyCategories,
  upsertCategory,
  deleteCategory,
  reorderCategories,
} from "@/lib/catalog.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, FolderTree } from "lucide-react";

export const Route = createFileRoute("/_authenticated/store/$slug/categories")({
  component: CategoriesPage,
});

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function CategoriesPage() {
  const { tenant } = useStore();
  const qc = useQueryClient();
  const list = useServerFn(listMyCategories);
  const save = useServerFn(upsertCategory);
  const del = useServerFn(deleteCategory);
  const reorder = useServerFn(reorderCategories);

  const { data, isLoading } = useQuery({
    queryKey: ["cats", tenant.id],
    queryFn: () => list({ data: { tenantId: tenant.id } }),
  });

  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { setItems(data?.categories ?? []); }, [data]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; name: string; slug: string; coverImageUrl: string | null; parentId: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);

  const saveMut = useMutation({
    mutationFn: (input: any) => save({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cats", tenant.id] });
      setOpen(false);
      toast.success("Category saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { tenantId: tenant.id, id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cats", tenant.id] });
      toast.success("Category deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });

  const reorderMut = useMutation({
    mutationFn: (order: string[]) => reorder({ data: { tenantId: tenant.id, order } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cats", tenant.id] }),
    onError: (e: any) => toast.error(e.message ?? "Failed to reorder"),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    const next = arrayMove(items, oldIdx, newIdx);
    setItems(next);
    reorderMut.mutate(next.map((i) => i.id));
  }

  function openNew() {
    setEditing({ name: "", slug: "", coverImageUrl: null, parentId: null });
    setOpen(true);
  }
  function openEdit(c: any) {
    setEditing({ id: c.id, name: c.name, slug: c.slug, coverImageUrl: c.cover_image_url ?? null, parentId: c.parent_id ?? null });
    setOpen(true);
  }

  // Compute depth from path ("a/b/c" → depth 2)
  function depthOf(c: any): number {
    if (!c?.path || typeof c.path !== "string") return 0;
    return Math.max(0, c.path.split("/").length - 1);
  }
  // Valid parents for the editing row (exclude self + descendants)
  function validParents(): any[] {
    if (!editing?.id) return items;
    return items.filter((c) => {
      if (c.id === editing.id) return false;
      const p: string = c.path ?? "";
      return !p.split("/").includes(editing.id!);
    });
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${tenant.id}/categories/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("tenant-assets").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("tenant-assets").getPublicUrl(path);
      setEditing((s) => (s ? { ...s, coverImageUrl: pub.publicUrl } : s));
      toast.success("Cover uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Categories</h2>
        <Button onClick={openNew} size="sm">New category</Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <TableSkeleton rows={4} cols={3} />
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center">
              <FolderTree className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-3 font-medium">No categories yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
              Group your products into categories to help customers find what they need faster.
            </p>
            <Button onClick={openNew} size="sm" className="mt-4">Add your first category</Button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-border">
                {items.map((c) => (
                  <SortableRow key={c.id} category={c} depth={depthOf(c)} onEdit={() => openEdit(c)} onDelete={() => setConfirmDel({ id: c.id, name: c.name })} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveMut.mutate({
                  tenantId: tenant.id,
                  id: editing.id,
                  name: editing.name.trim(),
                  slug: editing.slug || slugify(editing.name),
                  sortOrder: items.findIndex((i) => i.id === editing.id) >= 0
                    ? items.findIndex((i) => i.id === editing.id)
                    : items.length,
                  coverImageUrl: editing.coverImageUrl,
                  parentId: editing.parentId,
                });
              }}
            >
              <div>
                <Label htmlFor="cname">Name</Label>
                <Input id="cname" value={editing.name} required
                  onChange={(e) => setEditing({ ...editing, name: e.target.value, slug: editing.id ? editing.slug : slugify(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="cslug">Slug</Label>
                <Input id="cslug" value={editing.slug} required
                  onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="cparent">Parent category</Label>
                <select
                  id="cparent"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={editing.parentId ?? ""}
                  onChange={(e) => setEditing({ ...editing, parentId: e.target.value || null })}
                >
                  <option value="">— None (top level)</option>
                  {validParents().map((c) => (
                    <option key={c.id} value={c.id}>
                      {"— ".repeat(depthOf(c))}{c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Cover image</Label>
                <div className="flex items-center gap-3 flex-wrap">
                  {editing.coverImageUrl && (
                    <img src={editing.coverImageUrl} alt="" width={56} height={56} loading="lazy" decoding="async" className="size-14 rounded-md object-cover border border-border" />
                  )}
                  <Input type="file" accept="image/*" disabled={uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                  {editing.coverImageUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing({ ...editing, coverImageUrl: null })}>Remove</Button>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saveMut.isPending || uploading}>
                  {saveMut.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title={`Delete "${confirmDel?.name}"?`}
        description="Products in this category will become uncategorized."
        confirmLabel="Delete"
        destructive
        loading={delMut.isPending}
        onConfirm={() => { if (confirmDel) { delMut.mutate(confirmDel.id); setConfirmDel(null); } }}
      />
    </div>
  );
}

function SortableRow({ category, depth = 0, onEdit, onDelete }: { category: any; depth?: number; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    paddingLeft: `${1 + depth * 1.5}rem`,
  };
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-3 p-4 bg-card">
      {depth > 0 && <span className="text-xs text-muted-foreground" aria-hidden>↳</span>}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {category.cover_image_url ? (
        <img src={category.cover_image_url} alt="" width={40} height={40} loading="lazy" decoding="async" className="size-10 rounded-md object-cover border border-border" />
      ) : (
        <div className="size-10 rounded-md bg-muted" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{category.name}</div>
        <div className="text-xs text-muted-foreground truncate">/{category.slug}</div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>Delete</Button>
      </div>
    </li>
  );
}
