import { memo, useState, useEffect } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/cart";
import { buildSrcSet, HERO_WIDTHS } from "@/lib/image-url";

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

export function HeroSlider({
  slides,
  accent,
  fallbackName,
}: {
  slides: { title: string; subtitle?: string; image?: string }[];
  accent: string | null;
  fallbackName: string;
}) {
  const [idx, setIdx] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    if (slides.length <= 1 || reducedMotion) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length, reducedMotion]);
  const slide = slides[idx] ?? { title: fallbackName };
  const heroSrcSet = buildSrcSet(slide.image, HERO_WIDTHS, "webp");
  return (
    <section className="border-b border-border relative overflow-hidden">
      {slide.image && (
        <div className="absolute inset-0 opacity-10" aria-hidden>
          {/* Real <img> with explicit dimensions + responsive srcset so the
              hero contributes to LCP without layout shift. Only the first
              slide is high-priority; later slides lazy-load. */}
          <img
            src={slide.image}
            srcSet={heroSrcSet}
            sizes="100vw"
            alt=""
            width={1600}
            height={700}
            decoding="async"
            loading={idx === 0 ? "eager" : "lazy"}
            // @ts-expect-error fetchpriority is a valid HTML attribute
            fetchpriority={idx === 0 ? "high" : "low"}
            className="size-full object-cover"
          />
        </div>
      )}
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16 relative z-10 aspect-[16/7] sm:aspect-auto">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Shop</p>
        <h1 className="mt-1 text-3xl sm:text-4xl font-semibold tracking-tight" style={accent ? { color: accent } : undefined}>
          {slide.title}
        </h1>
        {slide.subtitle && <p className="mt-2 text-sm text-muted-foreground max-w-xl">{slide.subtitle}</p>}
        {slides.length > 1 && (
          <div className="mt-6 flex gap-1.5" role="tablist" aria-label="Hero slides">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Show slide ${i + 1}`}
                aria-selected={i === idx}
                role="tab"
                className={`h-1 rounded-full transition-all ${i === idx ? "w-6" : "w-2"}`}
                style={{ background: i === idx ? (accent || "hsl(var(--foreground))") : "hsl(var(--border))" }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function CatChip({
  active,
  onClick,
  children,
  accent,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  accent: string | null;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors"
      style={
        active
          ? { background: accent || "hsl(var(--foreground))", color: "#fff", borderColor: accent || "hsl(var(--foreground))" }
          : undefined
      }
      data-active={active || undefined}
    >
      <span className={active ? "" : "text-muted-foreground hover:text-foreground"}>{children}</span>
    </button>
  );
}

export const ProductCard = memo(function ProductCard({
  product,
  onSelect,
  onQuickAdd,
  currency,
  accent,
}: {
  product: any;
  onSelect: (p: any) => void;
  onQuickAdd: (p: any) => void;
  currency: string;
  accent: string | null;
}) {
  return (
    <div className="text-left group relative">
      <button
        onClick={() => onSelect(product)}
        aria-label={`View ${product.name}`}
        className="block w-full aspect-square rounded-md bg-muted overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            srcSet={buildSrcSet(product.image_url, [320, 480, 640, 960], "webp")}
            sizes="(min-width: 1024px) 240px, (min-width: 640px) 33vw, 50vw"
            alt={product.name}
            loading="lazy"
            decoding="async"
            // @ts-expect-error fetchpriority is a valid HTML attribute
            fetchpriority="low"
            width={600}
            height={600}
            className="size-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground text-xs">No image</div>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onQuickAdd(product);
        }}
        aria-label={`Quick add ${product.name}`}
        disabled={product.stock <= 0}
        className="absolute top-2 right-2 inline-flex items-center justify-center size-9 rounded-full bg-background/90 backdrop-blur border border-border shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ color: accent || undefined }}
      >
        <Plus className="size-4" />
      </button>
      <div className="mt-3">
        <h3 className="text-sm font-medium line-clamp-1">{product.name}</h3>
        <p className="text-sm text-muted-foreground tabular-nums mt-0.5">
          {formatPrice(product.price_cents, product.currency ?? currency)}
        </p>
      </div>
    </div>
  );
});

export function ProductSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-square w-full rounded-md" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function FeaturedSection({
  items,
  currency,
  accent,
  onPick,
  onQuickAdd,
}: {
  items: any[];
  currency: string;
  accent: string | null;
  onPick: (p: any) => void;
  onQuickAdd: (p: any) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-6 pt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold tracking-tight flex items-center gap-1.5">
          <Sparkles className="size-3.5" /> Featured
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
        {items.slice(0, 4).map((p: any) => (
          <ProductCard
            key={`feat-${p.id}`}
            product={p}
            currency={currency}
            accent={accent}
            onSelect={onPick}
            onQuickAdd={onQuickAdd}
          />
        ))}
      </div>
    </section>
  );
}

export function LoadMoreButton({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  return (
    <div className="mt-10 flex justify-center">
      <Button variant="outline" onClick={onClick} className="min-h-11">
        Load more ({remaining} left)
      </Button>
    </div>
  );
}