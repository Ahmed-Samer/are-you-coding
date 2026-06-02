import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Star, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  listProductImages,
  addProductImage,
  removeProductImage,
  reorderProductImages,
  setCoverImage,
  updateProductImage,
} from "@/lib/catalog.functions";

type Img = {
  id: string;
  url: string;
  alt_text: string | null;
  position: number;
  is_cover: boolean;
};

export function ProductGalleryEditor({
  productId,
  tenantId,
}: {
  productId: string;
  tenantId: string;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listProductImages);
  const add = useServerFn(addProductImage);
  const remove = useServerFn(removeProductImage);
  const reorder = useServerFn(reorderProductImages);
  const setCover = useServerFn(setCoverImage);
  const updateAlt = useServerFn(updateProductImage);

  const key = ["product-images", productId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => list({ data: { productId } }),
  });
  const images: Img[] = (data?.images ?? []) as Img[];

  const [uploading, setUploading] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["prods", tenantId] });
  };

  const addMut = useMutation({
    mutationFn: (payload: { url: string; altText?: string | null }) =>
      add({ data: { productId, ...payload } }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Failed to add image"),
  });
  const removeMut = useMutation({
    mutationFn: (imageId: string) => remove({ data: { imageId } }),
    onSuccess: () => { invalidate(); toast.success("Image removed"); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const coverMut = useMutation({
    mutationFn: (imageId: string) => setCover({ data: { imageId } }),
    onSuccess: () => { invalidate(); toast.success("Cover updated"); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const altMut = useMutation({
    mutationFn: (v: { imageId: string; altText: string | null }) =>
      updateAlt({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const reorderMut = useMutation({
    mutationFn: (order: string[]) => reorder({ data: { productId, order } }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Failed to reorder"),
  });

  async function handleFiles(files: FileList) {
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${tenantId}/products/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("tenant-assets").upload(path, file, {
          cacheControl: "3600", upsert: false, contentType: file.type,
        });
        if (error) throw error;
        const { data: pub } = supabase.storage.from("tenant-assets").getPublicUrl(path);
        await addMut.mutateAsync({ url: pub.publicUrl, altText: null });
      }
      toast.success("Uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onDragStart(i: number) { setDragIdx(i); }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onDrop(targetIdx: number) {
    if (dragIdx == null || dragIdx === targetIdx) { setDragIdx(null); return; }
    const next = images.slice();
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    setDragIdx(null);
    reorderMut.mutate(next.map((i) => i.id));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Gallery</Label>
        <div className="flex items-center gap-2">
          {uploading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <label className="inline-flex">
            <Input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              className="hidden"
              onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.currentTarget.value = ""; }}
              id={`gal-upload-${productId}`}
            />
            <Button asChild type="button" size="sm" variant="outline" disabled={uploading}>
              <label htmlFor={`gal-upload-${productId}`} className="cursor-pointer">Upload images</label>
            </Button>
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : images.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No images yet. Upload one or more to build the gallery. Drag to reorder.
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img, i) => (
            <li
              key={img.id}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(i)}
              className={`rounded-md border border-border bg-card p-2 space-y-2 transition ${dragIdx === i ? "opacity-50" : ""}`}
            >
              <div className="relative aspect-square rounded-md overflow-hidden bg-muted">
                <img src={img.url} alt={img.alt_text ?? ""} loading="lazy" decoding="async" className="size-full object-cover" />
                {img.is_cover && (
                  <Badge className="absolute top-1.5 left-1.5 gap-1">
                    <Star className="size-3" /> Cover
                  </Badge>
                )}
                <button
                  type="button"
                  aria-label="Drag handle"
                  className="absolute top-1.5 right-1.5 size-7 rounded-md bg-background/80 border border-border flex items-center justify-center cursor-grab"
                  title="Drag to reorder"
                >
                  <GripVertical className="size-3.5" />
                </button>
              </div>
              <Input
                placeholder="Alt text"
                defaultValue={img.alt_text ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== (img.alt_text ?? null)) altMut.mutate({ imageId: img.id, altText: v });
                }}
                className="h-8 text-xs"
              />
              <div className="flex items-center justify-between gap-1">
                <Button
                  type="button"
                  variant={img.is_cover ? "secondary" : "ghost"}
                  size="sm"
                  disabled={img.is_cover || coverMut.isPending}
                  onClick={() => coverMut.mutate(img.id)}
                >
                  {img.is_cover ? "Cover" : "Set cover"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeMut.mutate(img.id)}
                  disabled={removeMut.isPending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Tip: drag images to reorder. The cover image is shown in the storefront product card and as the OG image.
      </p>
    </div>
  );
}
