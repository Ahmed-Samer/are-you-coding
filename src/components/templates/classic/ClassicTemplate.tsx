import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AnnouncementBar, StorefrontHeader, StorefrontFooter } from "@/components/storefront/StorefrontHeader";
import {
  HeroSlider, CatChip, ProductCard, ProductSkeletonGrid, FeaturedSection, LoadMoreButton,
} from "@/components/storefront/ProductGrid";
import { TemplateProps } from "../types";

export function ClassicTemplate({
  tenant,
  storeMeta,
  themeStyle,
  accent,
  logoUrl,
  currency,
  announcement,
  availability,
  customDomain,
  products,
  categories,
  featured,
  heroSlides,
  search,
  activeCat,
  sort,
  visibleProducts,
  totalFilteredCount,
  hasMore,
  isLoading,
  onSearchChange,
  onCategoryChange,
  onSortChange,
  onLoadMore,
  onSelectProduct,
  onQuickAdd,
  cartCount,
  onOpenCart,
}: TemplateProps) {
  const theme = (storeMeta.theme ?? {}) as Record<string, any>;

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground" style={themeStyle}>
      {announcement && <AnnouncementBar text={announcement} accent={accent} />}

      <StorefrontHeader
        tenantName={tenant.name}
        logoUrl={logoUrl}
        accent={accent}
        customDomain={customDomain}
        search={search}
        onSearchChange={onSearchChange}
        cartCount={cartCount}
        onOpenCart={onOpenCart}
        isOpen={availability.isOpen}
      />

      <main className="flex-1">
        <HeroSlider slides={heroSlides} accent={accent} fallbackName={tenant.name} />

        {/* Mobile search */}
        <div className="sm:hidden border-b border-border/50 bg-background/50 backdrop-blur-sm sticky top-16 z-20 transition-all">
          <div className="px-6 py-4">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
              <Input
                placeholder="Search products..."
                className="pl-10 h-11 rounded-full bg-muted/40 border-transparent focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring shadow-sm transition-all duration-300"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                aria-label="Search products"
              />
            </div>
          </div>
        </div>

        {/* Category filters (nested) */}
        {categories.length > 0 && (() => {
          const topLevel = categories.filter((c: any) => !c.parent_id);
          const childrenOf = (id: string) => categories.filter((c: any) => c.parent_id === id);
          const activeRoot = (() => {
            if (!activeCat) return null;
            const cur = categories.find((c: any) => c.id === activeCat);
            if (!cur) return null;
            const rootId = (cur.path && typeof cur.path === "string") ? cur.path.split("/")[0] : cur.id;
            return rootId;
          })();
          const subs = activeRoot ? childrenOf(activeRoot) : [];
          return (
            <div className="border-b border-border">
              <div className="mx-auto max-w-6xl px-6 py-3 flex flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [overscroll-behavior-x:contain] [scroll-snap-type:x_proximity]">
                <CatChip active={!activeCat} accent={accent} onClick={() => onCategoryChange(null)}>All</CatChip>
                {topLevel.map((c: any) => (
                  <CatChip key={c.id} active={activeRoot === c.id} accent={accent} onClick={() => onCategoryChange(c.id)}>
                    {c.name}
                  </CatChip>
                ))}
              </div>
              {subs.length > 0 && (
                <div className="mx-auto max-w-6xl px-6 pb-3 flex flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [overscroll-behavior-x:contain] [scroll-snap-type:x_proximity]">
                  {subs.map((c: any) => (
                    <CatChip key={c.id} active={activeCat === c.id} accent={accent} onClick={() => onCategoryChange(c.id)}>
                      {c.name}
                    </CatChip>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {!isLoading && !search && !activeCat && (
          <FeaturedSection
            items={featured}
            currency={currency}
            accent={accent}
            onPick={onSelectProduct}
            onQuickAdd={onQuickAdd}
          />
        )}

        {/* Sort + count bar */}
        <div className="mx-auto max-w-6xl px-6 pt-8 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground tabular-nums">
            {isLoading ? "—" : `${totalFilteredCount} ${totalFilteredCount === 1 ? "product" : "products"}`}
          </p>
          <Select value={sort} onValueChange={(v) => onSortChange(v)}>
            <SelectTrigger className="h-9 w-[160px] text-xs" aria-label="Sort products">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="featured">Featured</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-asc">Price: Low to High</SelectItem>
              <SelectItem value="price-desc">Price: High to Low</SelectItem>
              <SelectItem value="name">Name (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Product grid */}
        <section className="mx-auto max-w-6xl px-6 py-8">
          {isLoading ? (
            <ProductSkeletonGrid count={8} />
          ) : totalFilteredCount === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
              No products match your search.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
                {visibleProducts.map((p: any) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    currency={currency}
                    accent={accent}
                    onSelect={onSelectProduct}
                    onQuickAdd={onQuickAdd}
                  />
                ))}
              </div>
              {hasMore && (
                <LoadMoreButton
                  remaining={totalFilteredCount - visibleProducts.length}
                  onClick={onLoadMore}
                />
              )}
            </>
          )}
        </section>
      </main>

      <StorefrontFooter
        tenantName={tenant.name}
        description={storeMeta.seo_description || "Quality products, delivered fast."}
        theme={theme}
      />
    </div>
  );
}
