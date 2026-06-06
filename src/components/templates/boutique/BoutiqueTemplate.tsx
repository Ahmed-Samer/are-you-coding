import { Search, ShoppingBag, Menu, Heart } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TemplateProps } from "../types";
import { useState } from "react";
import { formatMoney } from "@/lib/format-price";

const BoutiqueHeader = ({ tenantName, logoUrl, cartCount, onOpenCart, onOpenMenu, accent }: any) => (
  <header className="sticky top-4 z-50 mx-4 md:mx-8">
    <div className="bg-background/70 backdrop-blur-xl border border-border/50 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-16 flex items-center justify-between px-6 transition-all duration-300">
      <button onClick={onOpenMenu} className="md:hidden p-2 -ml-2 text-foreground/70 hover:text-foreground">
        <Menu className="size-5" />
      </button>

      <div className="flex-1 md:flex-none flex items-center justify-center md:justify-start">
        {logoUrl ? (
          <img src={logoUrl} alt={tenantName} className="h-7 max-w-[120px] object-contain" />
        ) : (
          <span className="text-xl font-serif italic tracking-wide">{tenantName}</span>
        )}
      </div>

      <nav className="hidden md:flex items-center justify-center gap-8 text-sm font-medium text-foreground/70">
        <a href="#" className="hover:text-foreground transition-colors">Discover</a>
        <a href="#" className="hover:text-foreground transition-colors">Collections</a>
        <a href="#" className="hover:text-foreground transition-colors">Our Story</a>
      </nav>

      <div className="flex items-center justify-end gap-3">
        <button className="hidden md:flex p-2 text-foreground/70 hover:text-foreground transition-colors">
          <Search className="size-5" />
        </button>
        <button onClick={onOpenCart} className="relative p-2 text-foreground/70 hover:text-foreground transition-colors group">
          <ShoppingBag className="size-5 group-hover:scale-110 transition-transform" />
          {cartCount > 0 && (
            <span 
              className="absolute top-0 right-0 flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
              style={{ backgroundColor: accent || '#000' }}
            >
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </div>
  </header>
);

const BoutiqueHero = ({ slides, accent }: any) => {
  const mainSlide = slides?.[0] || { title: "Curated Elegance", subtitle: "Handpicked pieces for your unique style." };
  return (
    <section className="relative mt-4 mx-4 md:mx-8 rounded-[2rem] h-[65vh] overflow-hidden group">
      {mainSlide.image ? (
        <img src={mainSlide.image} alt={mainSlide.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-[20s] group-hover:scale-110" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-tr from-muted to-muted/30" />
      )}
      <div className="absolute inset-0 bg-black/20" />
      
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
        <div className="bg-background/40 backdrop-blur-md border border-white/20 p-10 md:p-16 rounded-[2rem] shadow-2xl max-w-2xl transform transition-transform duration-700 translate-y-4 group-hover:translate-y-0">
          <h1 className="text-4xl md:text-6xl font-serif italic text-white mb-4 drop-shadow-sm">
            {mainSlide.title}
          </h1>
          {mainSlide.subtitle && (
            <p className="text-lg md:text-xl text-white/90 mb-8 font-light drop-shadow-sm">
              {mainSlide.subtitle}
            </p>
          )}
          <button 
            className="px-8 py-3 rounded-full text-sm font-medium text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
            style={{ backgroundColor: accent || 'rgba(0,0,0,0.8)' }}
          >
            Shop the Collection
          </button>
        </div>
      </div>
    </section>
  );
};

export function BoutiqueTemplate({
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

  return (
    <div className="min-h-dvh flex flex-col bg-[#FAF9F6] dark:bg-background text-foreground font-sans selection:bg-primary/20" style={themeStyle}>
      <BoutiqueHeader 
        tenantName={tenant.name} 
        logoUrl={logoUrl} 
        cartCount={cartCount} 
        onOpenCart={onOpenCart} 
        onOpenMenu={() => setMenuOpen(!menuOpen)} 
        accent={accent}
      />

      <main className="flex-1 pb-24">
        {(!search && !activeCat) && <BoutiqueHero slides={heroSlides} accent={accent} />}

        <section className="mx-auto max-w-6xl px-6 mt-20">
          <div className="flex flex-col items-center text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-serif italic mb-6">
              {search ? `Results for "${search}"` : activeCat ? "Curated Collection" : "Our Favorites"}
            </h2>
            
            <div className="w-full max-w-md relative mb-10">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Find something special..."
                className="pl-12 h-12 rounded-full bg-white dark:bg-muted/50 border-transparent shadow-[0_2px_10px_rgb(0,0,0,0.04)] focus-visible:ring-1 focus-visible:ring-border transition-shadow"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>

            {/* Categories */}
            {categories.length > 0 && (
              <div className="flex flex-wrap justify-center gap-3">
                <button 
                  onClick={() => onCategoryChange(null)}
                  className={`px-5 py-2 rounded-full text-sm transition-all ${!activeCat ? "bg-foreground text-background shadow-md" : "bg-white dark:bg-muted/50 text-foreground/70 hover:bg-muted"}`}
                >
                  All
                </button>
                {categories.map((c: any) => (
                  <button 
                    key={c.id}
                    onClick={() => onCategoryChange(c.id)}
                    className={`px-5 py-2 rounded-full text-sm transition-all ${activeCat === c.id ? "bg-foreground text-background shadow-md" : "bg-white dark:bg-muted/50 text-foreground/70 hover:bg-muted"}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end mb-8">
            <Select value={sort} onValueChange={onSortChange}>
              <SelectTrigger className="w-[180px] rounded-full bg-white dark:bg-muted/50 border-transparent shadow-sm">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="featured">Editor's Picks</SelectItem>
                <SelectItem value="newest">Just Arrived</SelectItem>
                <SelectItem value="price-asc">Price: Low to High</SelectItem>
                <SelectItem value="price-desc">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Product Grid */}
          {isLoading ? (
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 animate-pulse">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="flex flex-col gap-4">
                    <div className="aspect-[4/5] bg-muted rounded-3xl" />
                    <div className="h-4 bg-muted w-1/2 rounded-full mx-auto" />
                    <div className="h-4 bg-muted w-1/4 rounded-full mx-auto" />
                  </div>
                ))}
             </div>
          ) : totalFilteredCount === 0 ? (
            <div className="py-24 text-center bg-white dark:bg-muted/30 rounded-3xl border border-border/50">
              <Heart className="size-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-lg text-muted-foreground">We couldn't find what you're looking for.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
                {visibleProducts.map((p: any) => {
                  const img = p.images?.[0] || p.image_url;
                  return (
                    <div key={p.id} className="group cursor-pointer flex flex-col items-center text-center" onClick={() => onSelectProduct(p)}>
                      <div className="relative w-full aspect-[4/5] mb-5 overflow-hidden rounded-3xl bg-muted/50 shadow-sm transition-all duration-500 group-hover:shadow-xl group-hover:-translate-y-1">
                        {img ? (
                          <img src={img} alt={p.name} className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/50">No Image</div>
                        )}
                        
                        {/* Quick Add overlay button */}
                        <div className="absolute inset-x-0 bottom-4 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-y-2 group-hover:translate-y-0">
                          <button className="bg-white/90 backdrop-blur-sm text-black px-6 py-2 rounded-full text-sm font-medium shadow-lg hover:bg-white transition-colors">
                            Quick View
                          </button>
                        </div>
                      </div>
                      
                      <h3 className="text-lg font-serif mb-1 group-hover:text-primary transition-colors">{p.name}</h3>
                      <p className="text-muted-foreground">{formatMoney(p.base_price, currency)}</p>
                    </div>
                  );
                })}
              </div>
              {hasMore && (
                <div className="mt-20 flex justify-center">
                  <button 
                    onClick={onLoadMore}
                    className="px-8 py-3 rounded-full border border-border/60 text-sm font-medium hover:bg-foreground hover:text-background transition-all duration-300 hover:shadow-md"
                  >
                    View More
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="mt-auto mx-4 md:mx-8 mb-4">
        <div className="bg-foreground text-background rounded-3xl p-10 md:p-16 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <h3 className="font-serif italic text-2xl mb-2">{tenant.name}</h3>
            <p className="text-background/60 text-sm max-w-sm">
              Bringing you carefully curated collections with an eye for detail and uncompromising quality.
            </p>
          </div>
          
          <div className="flex gap-8 text-sm text-background/80">
            <div className="flex flex-col gap-2">
              <a href="#" className="hover:text-white transition-colors">Shop</a>
              <a href="#" className="hover:text-white transition-colors">About Us</a>
            </div>
            <div className="flex flex-col gap-2">
              <a href="#" className="hover:text-white transition-colors">Shipping</a>
              <a href="#" className="hover:text-white transition-colors">Returns</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
