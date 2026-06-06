import { Search, ShoppingCart, Menu, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TemplateProps } from "../types";
import { useState } from "react";
import { formatMoney } from "@/lib/format-price";

const SportHeader = ({ tenantName, logoUrl, cartCount, onOpenCart, onOpenMenu, accent }: any) => (
  <header className="sticky top-0 z-50 bg-background border-b-4 border-foreground">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 h-20 flex items-center justify-between">
      <button onClick={onOpenMenu} className="lg:hidden p-2 -ml-2 text-foreground">
        <Menu className="size-6" strokeWidth={2.5} />
      </button>

      <div className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start">
        {logoUrl ? (
          <img src={logoUrl} alt={tenantName} className="h-8 max-w-[150px] object-contain" />
        ) : (
          <span className="text-2xl font-black tracking-tighter uppercase italic" style={{ color: accent || 'currentColor' }}>{tenantName}</span>
        )}
      </div>

      <nav className="hidden lg:flex items-center gap-8 text-sm font-bold tracking-tight uppercase">
        <a href="#" className="hover:opacity-70 transition-opacity">Men</a>
        <a href="#" className="hover:opacity-70 transition-opacity">Women</a>
        <a href="#" className="hover:opacity-70 transition-opacity">Equipment</a>
      </nav>

      <div className="flex items-center justify-end gap-2 sm:gap-4">
        <button className="hidden sm:flex p-2 hover:bg-muted rounded-none transition-colors">
          <Search className="size-6" strokeWidth={2.5} />
        </button>
        <button onClick={onOpenCart} className="relative p-2 bg-foreground text-background hover:opacity-90 transition-opacity flex items-center gap-2 px-4">
          <ShoppingCart className="size-5" strokeWidth={2.5} />
          {cartCount > 0 && <span className="font-bold">{cartCount}</span>}
        </button>
      </div>
    </div>
  </header>
);

const SportHero = ({ slides, accent }: any) => {
  const mainSlide = slides?.[0] || { title: "PUSH YOUR LIMITS", subtitle: "New gear designed for peak performance." };
  return (
    <section className="relative w-full bg-zinc-900 text-white overflow-hidden" style={{ minHeight: '60vh' }}>
      {mainSlide.image && (
        <img src={mainSlide.image} alt={mainSlide.title} className="absolute inset-0 w-full h-full object-cover opacity-50" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-transparent" />
      
      <div className="relative z-10 h-full flex flex-col justify-center px-6 md:px-16 lg:px-24 py-20 max-w-5xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 font-bold uppercase text-xs tracking-wider" style={{ backgroundColor: accent || '#e11d48' }}>
          <Zap className="size-4" /> New Drop
        </div>
        <h1 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter uppercase leading-[0.9] mb-6 italic">
          {mainSlide.title}
        </h1>
        {mainSlide.subtitle && (
          <p className="text-lg md:text-2xl font-bold mb-10 max-w-xl">
            {mainSlide.subtitle}
          </p>
        )}
        <button 
          className="self-start px-10 py-5 text-lg font-black uppercase tracking-tight bg-white text-black hover:bg-zinc-200 transition-colors"
        >
          Shop Now
        </button>
      </div>
    </section>
  );
};

export function SportTemplate({
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
    <div className="min-h-dvh flex flex-col bg-background text-foreground font-sans selection:bg-foreground selection:text-background" style={themeStyle}>
      <SportHeader 
        tenantName={tenant.name} 
        logoUrl={logoUrl} 
        cartCount={cartCount} 
        onOpenCart={onOpenCart} 
        onOpenMenu={() => setMenuOpen(!menuOpen)} 
        accent={accent}
      />

      <main className="flex-1">
        {(!search && !activeCat) && <SportHero slides={heroSlides} accent={accent} />}

        <section className="mx-auto max-w-[1400px] px-4 sm:px-6 py-12 md:py-20">
          <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-6 mb-12">
            <div className="w-full lg:w-1/2">
              <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight mb-6">
                {search ? `Results: ${search}` : activeCat ? "Gear" : "Latest Arrivals"}
              </h2>
              <div className="relative flex">
                <Input
                  placeholder="Search gear..."
                  className="h-14 rounded-none border-4 border-foreground border-r-0 focus-visible:ring-0 text-lg font-bold"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
                <button className="bg-foreground text-background px-6 border-4 border-foreground">
                  <Search className="size-6" strokeWidth={3} />
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
              <div className="text-2xl font-black text-muted-foreground">{totalFilteredCount} Items</div>
              <Select value={sort} onValueChange={onSortChange}>
                <SelectTrigger className="w-full sm:w-[200px] h-12 rounded-none border-4 border-muted focus:ring-0 font-bold uppercase">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-4 border-foreground font-bold uppercase">
                  <SelectItem value="featured">Top Picks</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="price-asc">Price: Low - High</SelectItem>
                  <SelectItem value="price-desc">Price: High - Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-12">
              <button 
                onClick={() => onCategoryChange(null)}
                className={`px-6 py-3 font-black uppercase text-sm border-2 transition-all ${!activeCat ? "bg-foreground text-background border-foreground" : "bg-muted text-foreground border-transparent hover:border-foreground"}`}
              >
                All Gear
              </button>
              {categories.map((c: any) => (
                <button 
                  key={c.id}
                  onClick={() => onCategoryChange(c.id)}
                  className={`px-6 py-3 font-black uppercase text-sm border-2 transition-all ${activeCat === c.id ? "bg-foreground text-background border-foreground" : "bg-muted text-foreground border-transparent hover:border-foreground"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {isLoading ? (
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
                {[1,2,3,4,5,6,7,8].map(i => (
                  <div key={i} className="flex flex-col">
                    <div className="aspect-square bg-muted border-4 border-transparent mb-4" />
                    <div className="h-6 bg-muted w-3/4 mb-2" />
                    <div className="h-6 bg-muted w-1/3" />
                  </div>
                ))}
             </div>
          ) : totalFilteredCount === 0 ? (
            <div className="py-32 text-center bg-muted border-4 border-dashed border-muted-foreground/30">
              <p className="text-3xl font-black uppercase italic text-muted-foreground">Nothing found.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 gap-y-12">
                {visibleProducts.map((p: any) => {
                  const img = p.images?.[0] || p.image_url;
                  return (
                    <div key={p.id} className="group cursor-pointer flex flex-col" onClick={() => onSelectProduct(p)}>
                      <div className="relative aspect-square mb-4 overflow-hidden bg-muted border-4 border-transparent group-hover:border-foreground transition-colors">
                        {img ? (
                          <img src={img} alt={p.name} className="object-cover w-full h-full mix-blend-multiply dark:mix-blend-normal group-hover:scale-110 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground font-bold">NO IMG</div>
                        )}
                        <div className="absolute top-4 left-4 bg-foreground text-background font-black px-3 py-1 text-sm uppercase translate-y-[-150%] group-hover:translate-y-0 transition-transform">
                          View
                        </div>
                      </div>
                      <h3 className="text-xl font-black tracking-tight uppercase leading-tight mb-1">{p.name}</h3>
                      <p className="text-lg font-bold text-muted-foreground" style={{ color: accent || undefined }}>{formatMoney(p.base_price, currency)}</p>
                    </div>
                  );
                })}
              </div>
              {hasMore && (
                <div className="mt-16 flex justify-center">
                  <button 
                    onClick={onLoadMore}
                    className="px-12 py-5 bg-foreground text-background font-black uppercase text-lg hover:bg-zinc-800 transition-colors"
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="bg-zinc-900 text-white py-16 px-6 mt-auto">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            {logoUrl ? (
              <img src={logoUrl} alt={tenant.name} className="h-10 object-contain mb-6 invert" />
            ) : (
              <h3 className="text-3xl font-black italic uppercase mb-6">{tenant.name}</h3>
            )}
            <p className="text-zinc-400 font-bold uppercase max-w-xs">Equipping you for every challenge.</p>
          </div>
          <div className="flex flex-col gap-4 font-bold uppercase text-zinc-400">
            <a href="#" className="hover:text-white transition-colors">Help Center</a>
            <a href="#" className="hover:text-white transition-colors">Track Order</a>
            <a href="#" className="hover:text-white transition-colors">Returns</a>
          </div>
          <div className="flex flex-col justify-end text-zinc-500 font-bold text-sm">
            © {new Date().getFullYear()} {tenant.name}.
          </div>
        </div>
      </footer>
    </div>
  );
}
