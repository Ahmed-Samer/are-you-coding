// Server-side cart validation. The cart is client-state, but price and stock
// for any line are SERVER-AUTHORITATIVE — never trust the cached priceCents
// the client persisted. This validator is also re-invoked by Screen 19
// (Checkout Review) right before `createOrder` so we surface stock/price
// drift to the shopper instead of failing silently at order time.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { loadStorefrontProductCached } from "@/lib/storefront-loaders.server";

const lineSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(999),
});

export type CartIssue =
  | { lineKey: string; code: "product_missing"; message: string }
  | { lineKey: string; code: "variant_missing"; message: string }
  | { lineKey: string; code: "out_of_stock"; message: string }
  | { lineKey: string; code: "stock_reduced"; message: string; availableQuantity: number }
  | { lineKey: string; code: "price_changed"; message: string; newPriceCents: number };

export type ResolvedCartLine = {
  lineKey: string;
  productId: string;
  variantId: string | null;
  name: string;
  priceCents: number;
  stockQuantity: number;
  imageUrl: string | null;
  quantity: number;
};

function makeLineKey(productId: string, variantId: string | null | undefined): string {
  return `${productId}|${variantId ?? ""}`;
}

/**
 * Validate a client cart against the cached storefront. Returns the
 * server-authoritative items + a list of issues the UI should surface.
 *
 * - `valid` is true only when there are no issues at all.
 * - Each issue is keyed by `lineKey = productId|variantId`.
 * - Always returns the resolved items (with corrected prices/stock) so the
 *   caller can replace the local cart contents in one shot.
 */
export const validateCartLines = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        tenantId: z.string().uuid(),
        lines: z.array(lineSchema).min(1).max(100),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const issues: CartIssue[] = [];
    const items: ResolvedCartLine[] = [];

    for (const line of data.lines) {
      const lineKey = makeLineKey(line.productId, line.variantId ?? null);
      let payload: Awaited<ReturnType<typeof loadStorefrontProductCached>>["value"];
      try {
        const res = await loadStorefrontProductCached(data.tenantId, line.productId);
        payload = res.value;
      } catch {
        issues.push({
          lineKey,
          code: "product_missing",
          message: "This product is no longer available.",
        });
        continue;
      }

      const product = (payload?.product ?? null) as any;
      if (!product) {
        issues.push({
          lineKey,
          code: "product_missing",
          message: "This product is no longer available.",
        });
        continue;
      }

      let priceCents = Number(product.price_cents ?? 0);
      let stockQuantity = Number(product.stock ?? 0);

      if (line.variantId) {
        const variant = (payload?.variants?.variants ?? []).find(
          (v: any) => v.id === line.variantId && v.is_active,
        );
        if (!variant) {
          issues.push({
            lineKey,
            code: "variant_missing",
            message: "The selected option is no longer available.",
          });
          continue;
        }
        priceCents = Number(variant.price_cents ?? priceCents);
        stockQuantity = Number(variant.stock_quantity ?? 0);
      }

      if (stockQuantity <= 0) {
        issues.push({ lineKey, code: "out_of_stock", message: `${product.name} is out of stock.` });
      } else if (stockQuantity < line.quantity) {
        issues.push({
          lineKey,
          code: "stock_reduced",
          message: `Only ${stockQuantity} of ${product.name} remaining.`,
          availableQuantity: stockQuantity,
        });
      }

      items.push({
        lineKey,
        productId: product.id,
        variantId: line.variantId ?? null,
        name: product.name,
        priceCents,
        stockQuantity,
        imageUrl: product.image_url ?? null,
        quantity: Math.min(line.quantity, Math.max(0, stockQuantity)),
      });
    }

    return { valid: issues.length === 0, items, issues };
  });
