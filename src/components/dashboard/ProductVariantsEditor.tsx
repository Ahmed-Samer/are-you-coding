import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { X, Plus } from "lucide-react";
import { listVariants, upsertVariantMatrix } from "@/lib/catalog.functions";

type OptionDraft = { name: string; values: string[] };
type RowOverride = { sku: string; priceCents: number; stockQuantity: number; isActive: boolean };

function cartesian(arrays: string[][]): string[][] {
  if (arrays.length === 0) return [];
  return arrays.reduce<string[][]>(
    (acc, cur) => acc.flatMap((a) => cur.map((v) => [...a, v])),
    [[]],
  );
}

// Combination signature is order-sensitive on option list, case-insensitive on values.
function comboKey(values: string[]) {
  return values.map((v) => v.trim().toLowerCase()).join("\u0001");
}

export function ProductVariantsEditor({
  productId,
  defaultPriceCents,
}: {
  productId: string;
  defaultPriceCents: number;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listVariants);
  const save = useServerFn(upsertVariantMatrix);

  const { data, isLoading } = useQuery({
    queryKey: ["variants", productId],
    queryFn: () => list({ data: { productId } }),
  });

  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [overrides, setOverrides] = useState<Record<string, RowOverride>>({});
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from server once per productId.
  useEffect(() => {
    if (!data || hydrated) return;
    const opts = [...(data.options as any[])].sort((a, b) => a.position - b.position);
    const valsByOpt = new Map<string, { id: string; value: string; position: number }[]>();
    for (const v of (data.values as any[])) {
      const arr = valsByOpt.get(v.option_id) ?? [];
      arr.push(v);
      valsByOpt.set(v.option_id, arr);
    }
    const optionDrafts: OptionDraft[] = opts.map((o) => ({
      name: o.name,
      values: (valsByOpt.get(o.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((v) => v.value),
    }));
    // Reconstruct overrides keyed by ordered value names per option.
    const valueById = new Map<string, { option_id: string; value: string }>(
      (data.values as any[]).map((v: any) => [v.id, { option_id: v.option_id, value: v.value }]),
    );
    const linksByVariant = new Map<string, Set<string>>();
    for (const l of (data.links as any[])) {
      const s = linksByVariant.get(l.variant_id) ?? new Set<string>();
      s.add(l.option_value_id);
      linksByVariant.set(l.variant_id, s);
    }
    const ov: Record<string, RowOverride> = {};
    for (const v of (data.variants as any[])) {
      const valueIds = linksByVariant.get(v.id) ?? new Set<string>();
      // Build ordered values matching `opts` order.
      const ordered = opts.map((o) => {
        for (const vid of valueIds) {
          const val = valueById.get(vid);
          if (val && val.option_id === o.id) return val.value;
        }
        return "";
      });
      if (ordered.every(Boolean)) {
        ov[comboKey(ordered)] = {
          sku: v.sku ?? "",
          priceCents: v.price_cents,
          stockQuantity: v.stock_quantity,
          isActive: v.is_active,
        };
      }
    }
    setOptions(optionDrafts);
    setOverrides(ov);
    setHydrated(true);
  }, [data, hydrated]);

  const combinations = useMemo(() => {
    const cleanOpts = options
      .map((o) => ({ name: o.name.trim(), values: o.values.map((v) => v.trim()).filter(Boolean) }))
      .filter((o) => o.name && o.values.length > 0);
    if (cleanOpts.length === 0) return { headers: [] as string[], rows: [] as string[][] };
    return {
      headers: cleanOpts.map((o) => o.name),
      rows: cartesian(cleanOpts.map((o) => o.values)),
    };
  }, [options]);

  function updateOption(idx: number, patch: Partial<OptionDraft>) {
    setOptions((arr) => arr.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }
  function updateOptionValue(idx: number, vIdx: number, value: string) {
    setOptions((arr) =>
      arr.map((o, i) => (i === idx ? { ...o, values: o.values.map((v, j) => (j === vIdx ? value : v)) } : o)),
    );
  }
  function addOption() {
    if (options.length >= 5) return;
    setOptions((a) => [...a, { name: "", values: [""] }]);
  }
  function removeOption(idx: number) {
    setOptions((a) => a.filter((_, i) => i !== idx));
  }
  function addValue(idx: number) {
    setOptions((a) => a.map((o, i) => (i === idx ? { ...o, values: [...o.values, ""] } : o)));
  }
  function removeValue(idx: number, vIdx: number) {
    setOptions((a) =>
      a.map((o, i) => (i === idx ? { ...o, values: o.values.filter((_, j) => j !== vIdx) } : o)),
    );
  }

  function getRow(key: string): RowOverride {
    return overrides[key] ?? { sku: "", priceCents: defaultPriceCents, stockQuantity: 0, isActive: true };
  }
  function patchRow(key: string, patch: Partial<RowOverride>) {
    setOverrides((o) => ({ ...o, [key]: { ...getRow(key), ...patch } }));
  }

  const saveMut = useMutation({
    mutationFn: (payload: any) => save({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["variants", productId] });
      qc.invalidateQueries({ queryKey: ["storefront"] });
      toast.success("Variants saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  function handleSave() {
    const cleanOpts = options
      .map((o) => ({ name: o.name.trim(), values: Array.from(new Set(o.values.map((v) => v.trim()).filter(Boolean))) }))
      .filter((o) => o.name && o.values.length > 0);

    const variants = combinations.rows.map((row) => {
      const key = comboKey(row);
      const ov = getRow(key);
      return {
        combination: cleanOpts.map((o, i) => ({ optionName: o.name, value: row[i] })),
        sku: ov.sku || null,
        priceCents: ov.priceCents,
        stockQuantity: ov.stockQuantity,
        isActive: ov.isActive,
      };
    });

    saveMut.mutate({ productId, options: cleanOpts, variants });
  }

  function clearAll() {
    setOptions([]);
    setOverrides({});
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Loading variants…</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm">Options</Label>
          <Button type="button" size="sm" variant="outline" onClick={addOption} disabled={options.length >= 5}>
            <Plus className="size-3.5 mr-1" /> Add option
          </Button>
        </div>
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-4">
            No variants. Add options like <span className="font-medium">Size</span> or{" "}
            <span className="font-medium">Color</span> to generate a matrix of SKUs.
          </p>
        ) : (
          <div className="space-y-3">
            {options.map((opt, idx) => (
              <div key={idx} className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Input
                    placeholder="Option name (e.g. Size)"
                    value={opt.name}
                    onChange={(e) => updateOption(idx, { name: e.target.value })}
                    className="h-8 max-w-[220px]"
                  />
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeOption(idx)} className="ml-auto">
                    Remove
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {opt.values.map((v, vIdx) => (
                    <div key={vIdx} className="inline-flex items-center gap-1">
                      <Input
                        placeholder="Value"
                        value={v}
                        onChange={(e) => updateOptionValue(idx, vIdx, e.target.value)}
                        className="h-8 w-32"
                      />
                      <button
                        type="button"
                        aria-label="Remove value"
                        className="size-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                        onClick={() => removeValue(idx, vIdx)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" onClick={() => addValue(idx)}>
                    <Plus className="size-3.5 mr-1" /> Value
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {combinations.rows.length > 0 && (
        <div>
          <Label className="text-sm mb-2 block">
            Matrix ({combinations.rows.length} variant{combinations.rows.length === 1 ? "" : "s"})
          </Label>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  {combinations.headers.map((h) => (
                    <th key={h} className="text-left font-medium px-3 py-2">{h}</th>
                  ))}
                  <th className="text-left font-medium px-3 py-2">SKU</th>
                  <th className="text-right font-medium px-3 py-2">Price</th>
                  <th className="text-right font-medium px-3 py-2">Stock</th>
                  <th className="text-center font-medium px-3 py-2">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {combinations.rows.map((row) => {
                  const key = comboKey(row);
                  const r = getRow(key);
                  return (
                    <tr key={key}>
                      {row.map((v, i) => (
                        <td key={i} className="px-3 py-2 whitespace-nowrap">{v}</td>
                      ))}
                      <td className="px-3 py-2">
                        <Input
                          value={r.sku}
                          onChange={(e) => patchRow(key, { sku: e.target.value })}
                          className="h-8 w-32"
                          placeholder="SKU"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={(r.priceCents / 100).toString()}
                          onChange={(e) =>
                            patchRow(key, {
                              priceCents: Math.round((parseFloat(e.target.value) || 0) * 100),
                            })
                          }
                          className="h-8 w-24 text-right tabular-nums ml-auto"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          value={r.stockQuantity}
                          onChange={(e) =>
                            patchRow(key, { stockQuantity: parseInt(e.target.value) || 0 })
                          }
                          className="h-8 w-20 text-right tabular-nums ml-auto"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Switch
                          checked={r.isActive}
                          onCheckedChange={(v) => patchRow(key, { isActive: v })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
          Clear all variants
        </Button>
        <Button type="button" onClick={handleSave} disabled={saveMut.isPending}>
          {saveMut.isPending ? "Saving…" : "Save variants"}
        </Button>
      </div>
    </div>
  );
}