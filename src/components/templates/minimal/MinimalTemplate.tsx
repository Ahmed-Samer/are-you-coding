import { Search, ShoppingBag, Menu, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TemplateProps } from "../types";
import { useState } from "react";
import { formatMoney } from "@/lib/format-price";

// Helper components for Minimal Template
const MinimalHeader = ({ tenantName, logoUrl, cartCount, onOpenCart, onOpenMenu }: any) => (
  <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/20">
    <div className="mx-auto max-w-7xl px-6 h-20 flex items-center justify-between">
      <button onClick={onOpenMenu} className="lg:hidden p-2 -ml-2 text-foreground/80 hover:text-foreground">
        <Menu className="size-5" strokeWidth={1.5} />
      </button>

      <div className="flex-1 lg:flex-none">
        {logoUrl ? (
          <img src={logoUrl} alt={tenantName} className="h-8 max-w-[140px] object-contain" />
        ) : (
          <span className="text-xl font-medium tracking-tight uppercase">{tenantName}</span>
        )}
      </div>

      <nav className="hidden lg:flex items-center gap-8 text-sm font-medium tracking-wide uppercase text-foreground/80">
        <a href="#" className="hover:text-foreground transition-colors">Shop</a>
        <a href="#" className="hover:text-foreground transition-colors">Collections</a>
        <a href="#" className="hover:text-foreground transition-colors">About</a>
      </nav>

      <div className="flex items-center justify-end gap-4">
        <button className="hidden lg:flex p-2 text-foreground/80 hover:text-foreground transition-colors">
          <Search className="size-5" strokeWidth={1.5} />
        </button>
        <button onClick={onOpenCart} className="relative p-2 text-foreground/80 hover:text-foreground transition-colors">
          <ShoppingBag className="size-5" strokeWidth={1.5} />
          {cartCount > 0 && (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-foreground text-background text-[10px] font-bold">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </div>
  </header>
);

const MinimalHero = ({ slides, accent }: any) => {
  const mainSlide = slides?.[0] || { title: "New Arrivals", subtitle: "Discover our latest collection." };
  return (
    <section className="relative h-[75vh] w-full bg-muted flex items-center justify-center overflow-hidden">
      {mainSlide.image ? (
        <img src={mainSlide.image} alt={mainSlide.title} className="absolute inset-0 w-full h-full object-cover opacity-90 mix-blend-multiply" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/50" />
      )}
      <div className="relative z-10 text-center px-6 max-w-4xl flex flex-col items-center">
        <h1 className="text-5xl md:text-7xl font-light tracking-tighter text-foreground mb-6 leading-tight">
          {mainSlide.title}
        </h1>
        {mainSlide.subtitle && (
          <p className="text-lg md:text-xl text-foreground/70 mb-10 font-light max-w-2xl">
            {mainSlide.subtitle}
          </p>
        )}
        <button 
          className="group flex items-center gap-3 px-8 py-4 bg-foreground text-background text-sm tracking-widest uppercase font-medium hover:bg-foreground/90 transition-all duration-300"
          style={{ backgroundColor: accent || undefined }}
        >
          Explore Collection
          <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" strokeWidth={1.5} />
        </button>
      </div>
    </section>
  );
};

export function MinimalTemplate({
  tenant,
  themeStyle,
  accent,
  logoUrl,
  currency,
  categories,
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
  cartCount,
  onOpenCart,
}: TemplateProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Using themeStyle but forcing a clean light look for minimal if possible, 
  // or just letting standard CSS variables apply cleanly.
  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground selection:bg-foreground selection:text-background font-sans" style={themeStyle}>
      <MinimalHeader 
        tenantName={tenant.name} 
        logoUrl={logoUrl} 
        cartCount={cartCount} 
        onOpenCart={onOpenCart} 
        onOpenMenu={() => setMenuOpen(!menuOpen)} 
      />

      <main className="flex-1">
        {(!search && !activeCat) && <MinimalHero slides={heroSlides} accent={accent} />}

        <section className="mx-auto max-w-7xl px-6 py-16 md:py-24">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
            <div className="max-w-xl w-full">
              <h2 className="text-3xl font-light tracking-tight mb-4">
                {search ? `Search: ${search}` : activeCat ? "Category" : "The Collection"}
              </h2>
              <div className="relative">
                <Search className="absolute left-0 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" strokeWidth={1.5} />
                <Input
                  placeholder="Search products..."
                  className="pl-8 h-12 rounded-none border-0 border-b border-border/40 bg-transparent px-0 focus-visible:ring-0 focus-visible:border-foreground transition-colors text-lg font-light shadow-none"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Select value={sort} onValueChange={onSortChange}>
                <SelectTrigger className="w-[180px] rounded-none border-0 border-b border-border/40 focus:ring-0 shadow-none px-0 text-sm tracking-wide uppercase">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="newest">New Arrivals</SelectItem>
                  <SelectItem value="price-asc">Price: Low to High</SelectItem>
                  <SelectItem value="price-desc">Price: High to Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-6 mb-16">
              <button 
                onClick={() => onCategoryChange(null)}
                className={`text-sm tracking-wider uppercase pb-1 transition-all ${!activeCat ? "text-foreground border-b border-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                All
              </button>
              {categories.map((c: any) => (
                <button 
                  key={c.id}
                  onClick={() => onCategoryChange(c.id)}
                  className={`text-sm tracking-wider uppercase pb-1 transition-all ${activeCat === c.id ? "text-foreground border-b border-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Product Grid */}
          {isLoading ? (
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-16 animate-pulse">
                {[1,2,3,4,5,6,7,8].map(i => (
                  <div key={i} className="flex flex-col gap-4">
                    <div className="aspect-[3/4] bg-muted w-full" />
                    <div className="h-4 bg-muted w-2/3" />
                    <div className="h-4 bg-muted w-1/3" />
                  </div>
                ))}
             </div>
          ) : totalFilteredCount === 0 ? (
            <div className="py-32 text-center">
              <p className="text-xl text-muted-foreground font-light">No products found matching your criteria.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-16">
                {visibleProducts.map((p: any) => {
                  const img = p.images?.[0] || p.image_url;
                  return (
                    <div key={p.id} className="group cursor-pointer flex flex-col" onClick={() => onSelectProduct(p)}>
                      <div className="relative aspect-[3/4] mb-6 overflow-hidden bg-muted">
                        {img ? (
                          <img src={img} alt={p.name} className="object-cover w-full h-full transition-transform duration-1000 group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground font-light tracking-widest uppercase text-xs">No Image</div>
                        )}
                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      </div>
                      <div className="flex flex-col gap-2 items-center text-center">
                        <h3 className="text-lg font-medium tracking-tight group-hover:underline underline-offset-4 decoration-border/50 transition-all">{p.name}</h3>
                        <p className="text-muted-foreground font-light">{formatMoney(p.base_price, currency)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasMore && (
                <div className="mt-24 flex justify-center">
                  <button 
                    onClick={onLoadMore}
                    className="px-10 py-4 border border-border text-sm tracking-widest uppercase font-medium hover:bg-foreground hover:text-background transition-all duration-300"
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="border-t border-border/20 py-16 px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <p className="text-sm text-muted-foreground tracking-wide font-light">
            © {new Date().getFullYear()} {tenant.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground uppercase tracking-wider font-light">
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
