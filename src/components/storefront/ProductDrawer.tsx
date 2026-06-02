// In-storefront slide-over wrapper around <ProductDetailView/>.
//
// The Radix Dialog primitive (used by Sheet) provides focus trap,
// ESC-to-close, and focus restoration to the opening element. We add:
//   - aria-describedby for screen-reader announcement
//   - a related-products carousel that swaps the open product without
//     navigating away (drawer-to-drawer flow)
//
// The full canonical product page lives at /p/$productId and renders the
// same <ProductDetailView/> in "page" mode.

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatPrice } from "@/lib/cart";
import {
  ProductDetailView,
  type GalleryImage,
  type VariantsPayload,
} from "./ProductDetailView";

export type { GalleryImage, VariantsPayload };

export function ProductDrawer({
  product,
  tenantId,
  images,
  variants,
  allProducts,
  currency,
  accent,
  open,
  onOpenChange,
  onOpenAnother,
}: {
  product: any;
  tenantId: string;
  images?: GalleryImage[];
  variants?: VariantsPayload | null;
  allProducts: any[];
  currency: string;
  accent: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onOpenAnother: (p: any) => void;
}) {
  if (!product) return null;

  const canonicalUrl =
    typeof window !== "undefined" ? `${window.location.origin}/p/${product.id}` : undefined;

  const related = allProducts
    .filter(
      (p: any) =>
        p.id !== product.id && p.category_id && p.category_id === product.category_id,
    )
    .slice(0, 6);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col"
        aria-describedby="product-drawer-desc"
      >
        <SheetHeader>
          <SheetTitle className="text-left pr-8">{product.name}</SheetTitle>
          <SheetDescription id="product-drawer-desc" className="sr-only">
            Product details, options, and add to cart.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pr-1">
          <ProductDetailView
            product={product}
            tenantId={tenantId}
            images={images}
            variants={variants}
            currency={currency}
            accent={accent}
            canonicalUrl={canonicalUrl}
            mode="drawer"
            onAddedToCart={() => onOpenChange(false)}
          />

          {related.length > 0 && (
            <RelatedCarousel items={related} currency={currency} onPick={onOpenAnother} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RelatedCarousel({
  items,
  currency,
  onPick,
}: {
  items: any[];
  currency: string;
  onPick: (p: any) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollBy = (dx: number) => ref.current?.scrollBy({ left: dx, behavior: "smooth" });
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">You may also like</h3>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Scroll left"
            className="size-8 rounded-md border border-border inline-flex items-center justify-center hover:bg-muted"
            onClick={() => scrollBy(-200)}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            className="size-8 rounded-md border border-border inline-flex items-center justify-center hover:bg-muted"
            onClick={() => scrollBy(200)}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [overscroll-behavior-x:contain]"
      >
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="flex-shrink-0 w-32 snap-start text-left"
          >
            <div className="aspect-square rounded-md bg-muted overflow-hidden">
              {p.image_url && (
                <img
                  src={p.image_url}
                  alt={p.name}
                  width={128}
                  height={128}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              )}
            </div>
            <div className="mt-2 text-xs font-medium line-clamp-1">{p.name}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {formatPrice(p.price_cents, p.currency ?? currency)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
