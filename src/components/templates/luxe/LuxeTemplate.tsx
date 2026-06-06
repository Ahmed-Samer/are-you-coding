import { Search, ShoppingBag, Menu, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TemplateProps } from "../types";
import { useState } from "react";
import { formatMoney } from "@/lib/format-price";

const LuxeHeader = ({ tenantName, logoUrl, cartCount, onOpenCart, onOpenMenu, accent }: any) => (
  <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-2xl border-b border-zinc-800">
    <div className="mx-auto max-w-7xl px-6 h-24 flex items-center justify-between">
      <button onClick={onOpenMenu} className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100">
        <Menu className="size-6" strokeWidth={1} />
      </button>

      <div className="flex-1 lg:flex-none flex items-center justify-center lg:justify-start">
        {logoUrl ? (
          <img src={logoUrl} alt={tenantName} className="h-10 max-w-[180px] object-contain" />
        ) : (
          <span className="text-3xl font-serif tracking-widest text-zinc-100 uppercase">{tenantName}</span>
        )}
      </div>

      <nav className="hidden lg:flex items-center gap-10 text-xs font-light tracking-[0.2em] uppercase text-zinc-400">
        <a href="#" className="hover:text-zinc-100 transition-colors">Exclusives</a>
        <a href="#" className="hover:text-zinc-100 transition-colors">Collections</a>
        <a href="#" className="hover:text-zinc-100 transition-colors">Heritage</a>
      </nav>

      <div className="flex items-center justify-end gap-6">
        <button className="hidden lg:flex p-2 text-zinc-400 hover:text-zinc-100 transition-colors">
          <Search className="size-5" strokeWidth={1} />
        </button>
        <button onClick={onOpenCart} className="relative p-2 text-zinc-400 hover:text-zinc-100 transition-colors group">
          <ShoppingBag className="size-5" strokeWidth={1} />
          {cartCount > 0 && (
            <span 
              className="absolute top-0 right-0 flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-zinc-900"
              style={{ backgroundColor: accent || '#d4af37' }}
            >
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </div>
  </header>
);

const LuxeHero = ({ slides, accent }: any) => {
  const mainSlide = slides?.[0] || { title: "The Signature Collection", subtitle: "Uncompromising luxury for the discerning few." };
  return (
    <section className="relative h-[85vh] w-full bg-zinc-950 flex items-center justify-center overflow-hidden">
      {mainSlide.image ? (
        <img src={mainSlide.image} alt={mainSlide.title} className="absolute inset-0 w-full h-full object-cover opacity-60" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-zinc-950" />
      )}
      <div className="absolute inset-0 bg-black/40" />
      
      <div className="relative z-10 text-center px-6 max-w-5xl flex flex-col items-center">
        <div className="mb-6 opacity-80" style={{ color: accent || '#d4af37' }}>
          <Star className="size-6 mx-auto fill-current" strokeWidth={0} />
        </div>
        <h1 className="text-5xl md:text-8xl font-serif text-zinc-100 mb-8 leading-tight tracking-wide drop-shadow-lg">
          {mainSlide.title}
        </h1>
        {mainSlide.subtitle && (
          <p className="text-xl md:text-2xl text-zinc-300 mb-12 font-light tracking-wide max-w-3xl drop-shadow-md">
            {mainSlide.subtitle}
          </p>
        )}
        <button 
          className="px-12 py-5 border text-xs tracking-[0.3em] uppercase font-light transition-all duration-500 hover:bg-white hover:text-black"
          style={{ borderColor: accent || '#d4af37', color: 'white' }}
        >
          Discover
        </button>
      </div>
    </section>
  );
};

export function LuxeTemplate({
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
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-200 font-sans selection:bg-zinc-800" style={themeStyle}>
      <LuxeHeader 
        tenantName={tenant.name} 
        logoUrl={logoUrl} 
        cartCount={cartCount} 
        onOpenCart={onOpenCart} 
        onOpenMenu={() => setMenuOpen(!menuOpen)} 
        accent={accent}
      />

      <main className="flex-1">
        {(!search && !activeCat) && <LuxeHero slides={heroSlides} accent={accent} />}

        <section className="mx-auto max-w-7xl px-6 py-24 md:py-32">
          <div className="flex flex-col md:flex-row items-center justify-between gap-12 mb-20 border-b border-zinc-800 pb-12">
            <div className="text-center md:text-left">
              <h2 className="text-4xl font-serif tracking-wide text-zinc-100 mb-4">
                {search ? `Search: ${search}` : activeCat ? "Category" : "The Masterpieces"}
              </h2>
              <p className="text-zinc-500 font-light tracking-wider uppercase text-xs">
                {totalFilteredCount} {totalFilteredCount === 1 ? 'Item' : 'Items'}
              </p>
            </div>

            <div className="flex items-center gap-6 w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-0 top-1/2 -translate-y-1/2 size-4 text-zinc-500" strokeWidth={1} />
                <Input
                  placeholder="Search..."
                  className="pl-8 h-10 rounded-none border-0 border-b border-zinc-800 bg-transparent px-0 focus-visible:ring-0 focus-visible:border-zinc-400 transition-colors text-sm font-light text-zinc-100 shadow-none placeholder:text-zinc-600"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>

              <Select value={sort} onValueChange={onSortChange}>
                <SelectTrigger className="w-[180px] rounded-none border-0 border-b border-zinc-800 bg-transparent focus:ring-0 shadow-none px-0 text-xs tracking-widest uppercase text-zinc-400">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300 rounded-none">
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="price-asc">Price: Ascending</SelectItem>
                  <SelectItem value="price-desc">Price: Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap justify-center gap-8 mb-20">
              <button 
                onClick={() => onCategoryChange(null)}
                className={`text-xs tracking-[0.2em] uppercase pb-2 transition-all ${!activeCat ? "text-zinc-100 border-b border-current" : "text-zinc-600 hover:text-zinc-300"}`}
              >
                All
              </button>
              {categories.map((c: any) => (
                <button 
                  key={c.id}
                  onClick={() => onCategoryChange(c.id)}
                  className={`text-xs tracking-[0.2em] uppercase pb-2 transition-all ${activeCat === c.id ? "text-zinc-100 border-b border-current" : "text-zinc-600 hover:text-zinc-300"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {isLoading ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-24 animate-pulse">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="flex flex-col gap-6">
                    <div className="aspect-[4/5] bg-zinc-900" />
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-3 bg-zinc-900 w-1/2" />
                      <div className="h-3 bg-zinc-900 w-1/4" />
                    </div>
                  </div>
                ))}
             </div>
          ) : totalFilteredCount === 0 ? (
            <div className="py-40 text-center">
              <p className="text-2xl text-zinc-600 font-serif italic">No items match your desires.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-24">
                {visibleProducts.map((p: any) => {
                  const img = p.images?.[0] || p.image_url;
                  return (
                    <div key={p.id} className="group cursor-pointer flex flex-col items-center" onClick={() => onSelectProduct(p)}>
                      <div className="relative w-full aspect-[4/5] mb-8 overflow-hidden bg-zinc-900">
                        {img ? (
                          <img src={img} alt={p.name} className="object-cover w-full h-full transition-transform duration-[2s] group-hover:scale-110 opacity-90 group-hover:opacity-100" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-800 text-xs tracking-widest uppercase">No Image</div>
                        )}
                      </div>
                      <h3 className="text-xl font-serif text-zinc-100 mb-3 tracking-wide">{p.name}</h3>
                      <p className="text-zinc-500 font-light tracking-widest text-sm">{formatMoney(p.base_price, currency)}</p>
                    </div>
                  );
                })}
              </div>
              {hasMore && (
                <div className="mt-32 flex justify-center">
                  <button 
                    onClick={onLoadMore}
                    className="px-12 py-4 border border-zinc-800 text-xs tracking-[0.3em] uppercase text-zinc-400 hover:text-zinc-100 hover:border-zinc-400 transition-all duration-500"
                  >
                    Reveal More
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="border-t border-zinc-900 py-20 px-6 mt-auto bg-zinc-950">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-10">
          {logoUrl ? (
            <img src={logoUrl} alt={tenant.name} className="h-8 object-contain opacity-50 grayscale" />
          ) : (
            <span className="text-2xl font-serif tracking-widest text-zinc-600 uppercase">{tenant.name}</span>
          )}
          <div className="flex items-center gap-10 text-xs text-zinc-600 uppercase tracking-[0.2em]">
            <a href="#" className="hover:text-zinc-300 transition-colors">Client Services</a>
            <a href="#" className="hover:text-zinc-300 transition-colors">Legal</a>
            <a href="#" className="hover:text-zinc-300 transition-colors">Boutiques</a>
          </div>
          <p className="text-xs text-zinc-700 tracking-widest">
            © {new Date().getFullYear()} {tenant.name}. ALL RIGHTS RESERVED.
          </p>
        </div>
      </footer>
    </div>
  );
}
