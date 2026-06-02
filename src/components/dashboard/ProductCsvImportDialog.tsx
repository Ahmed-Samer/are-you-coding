import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { importProductsCsv } from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type Preview = {
  total: number;
  inserts: number;
  updates: number;
  errors: { row: number; error: string }[];
  preview: { row: number; action: "insert" | "update" | "error"; name: string | null; sku: string | null; error: string | null }[];
};

export function ProductCsvImportDialog({
  open, onOpenChange, tenantId,
}: { open: boolean; onOpenChange: (v: boolean) => void; tenantId: string }) {
  const qc = useQueryClient();
  const importFn = useServerFn(importProductsCsv);
  const [csvText, setCsvText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<Preview | null>(null);

  function reset() {
    setCsvText("");
    setFileName("");
    setPreview(null);
  }

  const dryMut = useMutation({
    mutationFn: (csv: string) => importFn({ data: { tenantId, csv, dryRun: true } }),
    onSuccess: (r: any) => setPreview(r),
    onError: (e: any) => toast.error(e.message ?? "Failed to parse CSV"),
  });
  const applyMut = useMutation({
    mutationFn: (csv: string) => importFn({ data: { tenantId, csv, dryRun: false } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["prods", tenantId] });
      toast.success(`Imported: ${r.inserts} new, ${r.updates} updated${r.errors.length ? `, ${r.errors.length} skipped` : ""}`);
      onOpenChange(false);
      reset();
    },
    onError: (e: any) => toast.error(e.message ?? "Import failed"),
  });

  async function handleFile(f: File) {
    setFileName(f.name);
    const text = await f.text();
    setCsvText(text);
    setPreview(null);
    dryMut.mutate(text);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import products from CSV</DialogTitle>
          <DialogDescription>
            Columns: <code>id, sku, name, description, price, currency, stock, category_slug, is_active, sort_order, image_url</code>.
            Rows matching an existing <code>id</code> or <code>sku</code> update in place; others insert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {fileName && <p className="text-xs text-muted-foreground">Loaded: {fileName}</p>}

          {dryMut.isPending && <p className="text-sm text-muted-foreground">Validating…</p>}

          {preview && (
            <div className="rounded-md border border-border p-3 text-sm space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Total: {preview.total}</Badge>
                <Badge>Insert: {preview.inserts}</Badge>
                <Badge variant="secondary">Update: {preview.updates}</Badge>
                {preview.errors.length > 0 && (
                  <Badge variant="destructive">Errors: {preview.errors.length}</Badge>
                )}
              </div>
              <div className="max-h-64 overflow-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1">Row</th>
                      <th className="text-left px-2 py-1">Action</th>
                      <th className="text-left px-2 py-1">Name / SKU</th>
                      <th className="text-left px-2 py-1">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((r) => (
                      <tr key={r.row} className="border-t border-border">
                        <td className="px-2 py-1 tabular-nums">{r.row}</td>
                        <td className="px-2 py-1">
                          {r.action === "error" ? (
                            <Badge variant="destructive">error</Badge>
                          ) : r.action === "update" ? (
                            <Badge variant="secondary">update</Badge>
                          ) : (
                            <Badge>insert</Badge>
                          )}
                        </td>
                        <td className="px-2 py-1">{r.name ?? "—"} {r.sku ? <span className="text-muted-foreground">· {r.sku}</span> : null}</td>
                        <td className="px-2 py-1 text-destructive">{r.error ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.preview.length < preview.total && (
                <p className="text-xs text-muted-foreground">Showing first {preview.preview.length} of {preview.total} rows.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          <Button
            disabled={!preview || preview.inserts + preview.updates === 0 || applyMut.isPending}
            onClick={() => applyMut.mutate(csvText)}
          >
            {applyMut.isPending ? "Importing…" : `Import ${preview ? preview.inserts + preview.updates : 0} row${(preview?.inserts ?? 0) + (preview?.updates ?? 0) === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
