// Shared product detail body — used by both:
//   - <ProductDrawer/> (in-storefront slide-over)
//   - /p/$productId (SSR canonical, indexable page)
//
// Renders: responsive gallery (with WebP srcset + active-first prefetch),
// variant picker with out-of-stock + invalid-combination handling, quantity
// stepper, share (Web Share API + clipboard fallback), JSON-LD Product
// structured data, and the call-to-action that hands the resolved variant to
// the cart. Reduced-motion is respected for slide/zoom.
//
// This component does NOT own its open/close lifecycle, focus trap, or
// related-products carousel — those live in the wrapper (`ProductDrawer`).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatPrice, makeLineKey, useCart } from "@/lib/cart";
import { useServerFn } from "@tanstack/react-start";
import { validateCartLines } from "@/lib/cart.functions";
import { buildSrcSet } from "@/lib/image-url";

export type GalleryImage = {
  id?: string;
  url: string;
  alt_text?: string | null;
  position?: number;
  is_cover?: boolean;
};

export type VariantsPayload = {
  options: Array<{ id: string; product_id?: string; name: string; position: number }>;
  values: Array<{ id: string; option_id: string; value: string; position: number }>;
  variants: Array<{
    id: string;
    product_id?: string;
    sku: string | null;
    price_cents: number;
    stock_quantity: number;
    position: number;
    is_active: boolean;
  }>;
  links: Array<{ variant_id: string; option_value_id: string }>;
};

const GALLERY_WIDTHS = [480, 768, 1024, 1600];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export type ProductDetailViewProps = {
  product: any;
  tenantId: string;
  images?: GalleryImage[];
  variants?: VariantsPayload | null;
  currency: string;
  accent: string | null;
  /** "page" disables zoom-on-hover; "drawer" enables it. */
  mode?: "drawer" | "page";
  /** Canonical URL used by the share button; defaults to /p/<id>. */
  canonicalUrl?: string;
  /** Fires after a successful add-to-cart so the wrapper can close the drawer. */
  onAddedToCart?: () => void;
};

export function ProductDetailView({
  product,
  tenantId,
  images,
  variants,
  currency,
  accent,
  mode = "drawer",
  canonicalUrl,
  onAddedToCart,
}: ProductDetailViewProps) {
  const cart = useCart();
  const validate = useServerFn(validateCartLines);
  const reducedMotion = usePrefersReducedMotion();
  const [qty, setQty] = useState(1);
  const [activeIdx, setActiveIdx] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  // ----- Variant selection state -----
  const pid = product?.id;
  const productOptions = useMemo(
    () =>
      (variants?.options ?? [])
        .filter((o) => !o.product_id || o.product_id === pid)
        .sort((a, b) => a.position - b.position),
    [variants, pid],
  );
  const productVariants = useMemo(
    () => (variants?.variants ?? []).filter((v) => !v.product_id || v.product_id === pid),
    [variants, pid],
  );
  const valuesByOption = useMemo(() => {
    const m = new Map<string, VariantsPayload["values"]>();
    for (const v of variants?.values ?? []) {
      const arr = m.get(v.option_id) ?? [];
      arr.push(v);
      m.set(v.option_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.position - b.position);
    return m;
  }, [variants]);
  const valueIdsByVariant = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of variants?.links ?? []) {
      const set = m.get(l.variant_id) ?? new Set<string>();
      set.add(l.option_value_id);
      m.set(l.variant_id, set);
    }
    return m;
  }, [variants]);

  const hasVariants = productOptions.length > 0 && productVariants.length > 0;
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setQty(1);
    setZoom(null);
    setActiveIdx(0);
    setSelectedValues({});
  }, [pid]);

  const selectedVariant = useMemo(() => {
    if (!hasVariants) return null;
    if (Object.keys(selectedValues).length !== productOptions.length) return null;
    const chosenIds = new Set(Object.values(selectedValues));
    return (
      productVariants.find((v) => {
        const set = valueIdsByVariant.get(v.id);
        if (!set || set.size !== chosenIds.size) return false;
        for (const id of chosenIds) if (!set.has(id)) return false;
        return true;
      }) ?? null
    );
  }, [hasVariants, selectedValues, productOptions, productVariants, valueIdsByVariant]);

  // A value is "unavailable" if no active in-stock variant pairs it with the
  // currently-locked choices for other options.
  const isValueAvailable = useCallback(
    (optionId: string, valueId: string) => {
      const choices: Record<string, string> = { ...selectedValues, [optionId]: valueId };
      return productVariants.some((v) => {
        if (!v.is_active || v.stock_quantity <= 0) return false;
        const set = valueIdsByVariant.get(v.id);
        if (!set) return false;
        for (const [oid, vid] of Object.entries(choices)) {
          if (!set.has(vid)) return false;
          if (oid === optionId && !set.has(vid)) return false;
        }
        return true;
      });
    },
    [selectedValues, productVariants, valueIdsByVariant],
  );

  // True when shopper has picked at least one option but the partial
  // combination resolves to NO in-stock active variant. Surfaces an
  // aria-live notice + disables Add-to-cart.
  const partialUnavailable = useMemo(() => {
    if (!hasVariants) return false;
    const picked = Object.keys(selectedValues).length;
    if (picked === 0 || picked === productOptions.length) return false;
    return !productVariants.some((v) => {
      if (!v.is_active || v.stock_quantity <= 0) return false;
      const set = valueIdsByVariant.get(v.id);
      if (!set) return false;
      for (const vid of Object.values(selectedValues)) if (!set.has(vid)) return false;
      return true;
    });
  }, [hasVariants, selectedValues, productOptions.length, productVariants, valueIdsByVariant]);

  // Normalized, sorted gallery.
  const gallery: GalleryImage[] = useMemo(() => {
    const rows = (images ?? []).slice().sort((a, b) => {
      if (a.is_cover && !b.is_cover) return -1;
      if (!a.is_cover && b.is_cover) return 1;
      return (a.position ?? 0) - (b.position ?? 0);
    });
    if (rows.length > 0) return rows;
    if (product?.image_url) return [{ url: product.image_url, alt_text: product?.name ?? null }];
    return [];
  }, [images, product?.image_url, product?.name]);

  // Prefetch neighbors on idle once the gallery mounts.
  useEffect(() => {
    if (typeof window === "undefined" || gallery.length < 2) return;
    const neighbors = [gallery[activeIdx + 1], gallery[activeIdx - 1]].filter(Boolean) as GalleryImage[];
    const run = () => {
      for (const img of neighbors) {
        const el = new Image();
        el.decoding = "async";
        el.src = img.url;
      }
    };
    const w = window as any;
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(run, { timeout: 800 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 200);
    return () => window.clearTimeout(t);
  }, [gallery, activeIdx]);

  // Keyboard arrow navigation inside the gallery region.
  const onGalleryKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (gallery.length < 2) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(gallery.length - 1, i + 1));
      }
    },
    [gallery.length],
  );

  // Touch swipe.
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || gallery.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0) setActiveIdx((i) => Math.min(gallery.length - 1, i + 1));
      else setActiveIdx((i) => Math.max(0, i - 1));
    }
    touchStartX.current = null;
  };

  const active = gallery[activeIdx];
  const activeSrcSet = buildSrcSet(active?.url ?? null, GALLERY_WIDTHS, "webp");

  const effectivePriceCents = selectedVariant?.price_cents ?? product?.price_cents ?? 0;
  const effectiveStock = hasVariants
    ? selectedVariant?.stock_quantity ?? 0
    : product?.stock ?? 0;

  const variantLabel = selectedVariant
    ? productOptions
        .map((o) => {
          const valId = selectedValues[o.id];
          const val = (valuesByOption.get(o.id) ?? []).find((v) => v.id === valId);
          return val ? `${o.name}: ${val.value}` : null;
        })
        .filter(Boolean)
        .join(" · ")
    : null;

  const onZoomMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || mode !== "drawer") return;
    const rect = e.currentTarget.getBoundingClientRect();
    setZoom({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const share = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url =
      canonicalUrl ?? `${window.location.origin}/p/${product?.id}`;
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({
          title: product?.name,
          text: product?.description ?? "",
          url,
        });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
        return;
      }
      toast.info(`Copy this link: ${url}`);
    } catch (e) {
      const name = (e as any)?.name;
      if (name === "AbortError") return; // user cancelled
      try {
        await navigator.clipboard?.writeText(url);
        toast.success("Link copied");
      } catch {
        toast.info(`Copy this link: ${url}`);
      }
    }
  }, [canonicalUrl, product?.id, product?.name, product?.description]);

  const canAdd =
    !!product &&
    (hasVariants ? !!selectedVariant && effectiveStock > 0 : effectiveStock > 0) &&
    !partialUnavailable;

  const addToCart = useCallback(async () => {
    if (!product) return;
    if (hasVariants && !selectedVariant) {
      toast.error("Choose all options first");
      return;
    }
    cart.add(
      {
        lineKey: makeLineKey(product.id, selectedVariant?.id ?? null),
        productId: product.id,
        variantId: selectedVariant?.id ?? null,
        variantLabel,
        name: product.name,
        priceCents: effectivePriceCents,
        imageUrl: active?.url ?? product.image_url ?? null,
      },
      qty,
    );
    toast.success(`Added ${product.name} to cart`);
    onAddedToCart?.();

    // Fire-and-forget server validation — surface stock/price drift since
    // the cached catalog payload was rendered.
    try {
      const res = await validate({
        data: {
          tenantId,
          lines: [
            {
              productId: product.id,
              variantId: selectedVariant?.id ?? null,
              quantity: qty,
            },
          ],
        },
      });
      if (!res.valid) {
        const first = res.issues[0];
        if (first) toast.error(first.message);
      }
    } catch {
      /* validation is best-effort; checkout will re-validate */
    }
  }, [
    product,
    hasVariants,
    selectedVariant,
    cart,
    variantLabel,
    effectivePriceCents,
    active?.url,
    qty,
    validate,
    tenantId,
    onAddedToCart,
  ]);

  if (!product) return null;

  const isPage = mode === "page";
  const galleryHeightCls = isPage
    ? "aspect-square max-w-2xl mx-auto"
    : "aspect-square";

  const addButtonLabel = (() => {
    if (hasVariants && !selectedVariant) return "Choose options";
    if (partialUnavailable) return "Unavailable";
    if (effectiveStock <= 0) return "Out of stock";
    return "Add to cart";
  })();

  return (
    <div className="min-w-0">
      {/* Gallery */}
      <div
        ref={galleryRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${product.name} image gallery`}
        tabIndex={0}
        onKeyDown={onGalleryKeyDown}
        className={`${galleryHeightCls} rounded-md bg-muted overflow-hidden mb-3 relative ${
          !reducedMotion && mode === "drawer" ? "cursor-zoom-in" : ""
        } select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 [overscroll-behavior-x:contain]`}
        onMouseMove={onZoomMove}
        onMouseLeave={() => setZoom(null)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {active ? (
          <img
            src={active.url}
            srcSet={activeSrcSet}
            sizes={isPage ? "(min-width: 768px) 640px, 100vw" : "(min-width: 640px) 512px, 100vw"}
            alt={active.alt_text ?? product.name}
            width={1024}
            height={1024}
            decoding="async"
            loading="eager"
            // @ts-expect-error fetchpriority is a valid HTML attribute
            fetchpriority="high"
            className={`size-full object-cover ${reducedMotion ? "" : "transition-transform duration-200"}`}
            style={zoom ? { transform: "scale(1.6)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground text-xs">
            No image
          </div>
        )}
        {gallery.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={(e) => {
                e.stopPropagation();
                setActiveIdx((i) => Math.max(0, i - 1));
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 size-11 sm:size-9 rounded-full bg-background/80 border border-border flex items-center justify-center hover:bg-background"
              disabled={activeIdx === 0}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={(e) => {
                e.stopPropagation();
                setActiveIdx((i) => Math.min(gallery.length - 1, i + 1));
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 size-11 sm:size-9 rounded-full bg-background/80 border border-border flex items-center justify-center hover:bg-background"
              disabled={activeIdx === gallery.length - 1}
            >
              <ChevronRight className="size-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] tabular-nums rounded-full bg-background/80 border border-border px-2 py-0.5">
              {activeIdx + 1} / {gallery.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {gallery.length > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [overscroll-behavior-x:contain] [scroll-snap-type:x_proximity]">
          {gallery.map((img, i) => (
            <button
              key={img.id ?? `${i}-${img.url}`}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === activeIdx ? "true" : undefined}
              className={`shrink-0 size-14 rounded-md overflow-hidden border-2 transition snap-start ${
                i === activeIdx
                  ? "border-foreground"
                  : "border-transparent opacity-70 hover:opacity-100"
              }`}
            >
              <img
                src={img.url}
                alt={img.alt_text ?? ""}
                width={56}
                height={56}
                loading="lazy"
                decoding="async"
                // @ts-expect-error fetchpriority is a valid HTML attribute
                fetchpriority="low"
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Price + share */}
      <div className="flex items-start justify-between gap-3">
        <div
          className="text-2xl font-semibold tabular-nums"
          style={accent ? { color: accent } : undefined}
        >
          {formatPrice(effectivePriceCents, product.currency ?? currency)}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Share product"
          onClick={share}
          className="min-h-11 min-w-11"
        >
          <Share2 className="size-4" />
        </Button>
      </div>
      {(selectedVariant?.sku ?? product.sku) && (
        <div className="mt-1 text-xs text-muted-foreground">
          SKU: {selectedVariant?.sku ?? product.sku}
        </div>
      )}

      {/* Variants */}
      {hasVariants && (
        <div className="mt-5 space-y-4">
          {productOptions.map((opt) => {
            const vals = valuesByOption.get(opt.id) ?? [];
            return (
              <div key={opt.id}>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">{opt.name}</div>
                <div className="flex flex-wrap gap-1.5">
                  {vals.map((v) => {
                    const isSelected = selectedValues[opt.id] === v.id;
                    const available = isValueAvailable(opt.id, v.id);
                    const disabled = !available && !isSelected;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={disabled}
                        aria-disabled={disabled || undefined}
                        title={disabled ? "Unavailable" : undefined}
                        onClick={() =>
                          setSelectedValues((s) =>
                            s[opt.id] === v.id
                              ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== opt.id))
                              : { ...s, [opt.id]: v.id },
                          )
                        }
                        className={[
                          "min-h-9 px-3 rounded-full border text-xs font-medium transition",
                          isSelected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border hover:border-foreground",
                          disabled ? "opacity-40 line-through cursor-not-allowed" : "",
                        ].join(" ")}
                        style={
                          isSelected && accent
                            ? { background: accent, borderColor: accent, color: "#fff" }
                            : undefined
                        }
                      >
                        {v.value}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Description */}
      {product.description && (
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {product.description}
        </p>
      )}

      {/* Availability + invalid-combination notice */}
      <div className="mt-4 text-xs text-muted-foreground" aria-live="polite">
        {partialUnavailable ? (
          <span className="text-destructive">
            This combination is unavailable. Try different options.
          </span>
        ) : hasVariants ? (
          selectedVariant ? (
            effectiveStock > 0 ? (
              `${effectiveStock} in stock`
            ) : (
              "Out of stock"
            )
          ) : (
            "Choose options to see availability"
          )
        ) : effectiveStock > 0 ? (
          `${effectiveStock} in stock`
        ) : (
          "Out of stock"
        )}
      </div>

      {/* JSON-LD Product */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org/",
            "@type": "Product",
            name: product.name,
            image: gallery.length > 0 ? gallery.map((g) => g.url) : undefined,
            description: product.description ?? undefined,
            sku: product.sku ?? undefined,
            offers: {
              "@type": "Offer",
              price: (effectivePriceCents / 100).toFixed(2),
              priceCurrency: product.currency ?? currency,
              availability:
                effectiveStock > 0
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
            },
          }),
        }}
      />

      {/* CTA bar — always inline. The drawer wrapper does not render a
          separate SheetFooter CTA; this row is the single Add-to-cart UI. */}
      <div
        className={`mt-6 flex flex-wrap items-center gap-3 ${
          isPage ? "" : "sticky bottom-0 bg-background py-3 -mx-1 px-1 border-t border-border"
        }`}
      >
        <div className="flex items-center border border-border rounded-md">
          <button
            type="button"
            aria-label="Decrease quantity"
            className="px-3 min-h-11"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
          >
            <Minus className="size-3.5" />
          </button>
          <span className="w-8 text-center tabular-nums text-sm">{qty}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            className="px-3 min-h-11"
            onClick={() => setQty((q) => q + 1)}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <Button
          className="flex-1 min-h-11 min-w-[160px]"
          disabled={!canAdd}
          onClick={addToCart}
          style={accent ? { background: accent, color: "#fff" } : undefined}
        >
          {addButtonLabel}
        </Button>
      </div>
    </div>
  );
}

