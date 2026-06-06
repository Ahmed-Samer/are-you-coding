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
    <section className="relative overflow-hidden group">
      {slide.image ? (
        <>
          <div className="absolute inset-0 z-0">
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
              className="size-full object-cover transition-transform duration-[10s] ease-out group-hover:scale-105"
            />
          </div>
          {/* Subtle gradient overlay for better text contrast without making it too dark */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent z-0" aria-hidden />
        </>
      ) : (
        <div className="absolute inset-0 bg-muted/30 z-0" aria-hidden />
      )}
      
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-32 relative z-10 flex flex-col justify-end min-h-[400px] sm:min-h-[500px]">
        <div className="max-w-2xl backdrop-blur-md bg-background/60 p-6 sm:p-10 rounded-2xl border border-border/50 shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-700">
          <p className="text-xs sm:text-sm uppercase tracking-[0.2em] font-semibold text-muted-foreground mb-3">Shop Collection</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]" style={accent ? { color: accent } : undefined}>
            {slide.title}
          </h1>
          {slide.subtitle && <p className="mt-4 text-base sm:text-lg text-muted-foreground/90 max-w-xl leading-relaxed">{slide.subtitle}</p>}
          
          {slides.length > 1 && (
            <div className="mt-8 flex gap-2 items-center" role="tablist" aria-label="Hero slides">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`Show slide ${i + 1}`}
                  aria-selected={i === idx}
                  role="tab"
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? "w-8 bg-foreground" : "w-2 bg-foreground/20 hover:bg-foreground/40"}`}
                  style={i === idx && accent ? { background: accent } : undefined}
                />
              ))}
            </div>
          )}
        </div>
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
      className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300 ${
        active ? "shadow-md scale-105" : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
      }`}
      style={
        active
          ? { background: accent || "hsl(var(--foreground))", color: "#fff" }
          : undefined
      }
      data-active={active || undefined}
    >
      <span>{children}</span>
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
    <div className="text-left group relative flex flex-col animate-in fade-in zoom-in-95 duration-500">
      <button
        onClick={() => onSelect(product)}
        aria-label={`View ${product.name}`}
        className="block w-full aspect-[4/5] rounded-2xl bg-muted overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-500 group-hover:shadow-xl group-hover:-translate-y-1"
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
            height={750}
            className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground text-xs bg-muted/50">No image</div>
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
        className="absolute top-3 right-3 inline-flex items-center justify-center size-10 rounded-full bg-background/95 backdrop-blur-md shadow-sm opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-110"
        style={{ color: accent || undefined }}
      >
        <Plus className="size-5" />
      </button>

      <div className="mt-4 px-1">
        <h3 className="text-base font-medium line-clamp-1 group-hover:text-foreground transition-colors">{product.name}</h3>
        <p className="text-sm text-muted-foreground font-medium tabular-nums mt-1">
          {formatPrice(product.price_cents, product.currency ?? currency)}
        </p>
      </div>
    </div>
  );
});

export function ProductSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <Skeleton className="aspect-[4/5] w-full rounded-2xl bg-muted/60" />
          <Skeleton className="mt-4 h-5 w-3/4 rounded-md" />
          <Skeleton className="mt-2 h-4 w-1/3 rounded-md" />
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
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