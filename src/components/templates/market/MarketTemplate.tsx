import { Search, ShoppingCart, Menu, ChevronRight, Grid, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TemplateProps } from "../types";
import { useState } from "react";
import { formatMoney } from "@/lib/format-price";

const MarketHeader = ({ tenantName, logoUrl, cartCount, onOpenCart, onOpenMenu, search, onSearchChange, accent }: any) => (
  <header className="sticky top-0 z-50 bg-background border-b shadow-sm">
    <div className="bg-foreground text-background py-1.5 px-4 text-xs text-center sm:text-left flex justify-between">
      <span>Welcome to {tenantName} Marketplace</span>
      <div className="hidden sm:flex gap-4">
        <a href="#" className="hover:underline">Track Order</a>
        <a href="#" className="hover:underline">Sell with us</a>
      </div>
    </div>
    
    <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-4 md:gap-8">
      <button onClick={onOpenMenu} className="lg:hidden p-1 text-muted-foreground hover:text-foreground">
        <Menu className="size-6" />
      </button>

      <div className="shrink-0">
        {logoUrl ? (
          <img src={logoUrl} alt={tenantName} className="h-8 max-w-[120px] object-contain" />
        ) : (
          <span className="text-xl font-bold tracking-tight" style={{ color: accent || 'currentColor' }}>{tenantName}</span>
        )}
      </div>

      <div className="hidden md:flex flex-1 max-w-2xl relative">
        <Select defaultValue="all">
          <SelectTrigger className="w-[140px] rounded-r-none border-r-0 bg-muted/50 focus:ring-0 font-medium">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="electronics">Electronics</SelectItem>
            <SelectItem value="fashion">Fashion</SelectItem>
            <SelectItem value="home">Home & Kitchen</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="What are you looking for?"
          className="rounded-l-none border-l-0 focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-ring bg-muted/20"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <button 
          className="absolute right-0 top-0 bottom-0 px-4 rounded-r-md text-white transition-colors"
          style={{ backgroundColor: accent || 'hsl(var(--primary))' }}
        >
          <Search className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 md:gap-6 shrink-0 ml-auto">
        <div className="hidden lg:flex flex-col text-xs">
          <span className="text-muted-foreground">Hello, Sign in</span>
          <span className="font-bold">Account & Lists</span>
        </div>
        <button onClick={onOpenCart} className="relative flex items-center gap-2 p-2 hover:bg-muted rounded-md transition-colors">
          <div className="relative">
            <ShoppingCart className="size-6" />
            <span 
              className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm"
              style={{ backgroundColor: accent || 'hsl(var(--primary))' }}
            >
              {cartCount}
            </span>
          </div>
          <span className="hidden sm:block font-bold mt-2">Cart</span>
        </button>
      </div>
    </div>
    
    {/* Mobile Search Bar below header */}
    <div className="md:hidden px-4 pb-3">
      <div className="relative">
        <Input
          placeholder="Search products..."
          className="h-10 bg-muted/30 focus-visible:ring-1"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      </div>
    </div>
  </header>
);

export function MarketTemplate({
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
  onQuickAdd,
}: TemplateProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh flex flex-col bg-muted/20 text-foreground font-sans" style={themeStyle}>
      <MarketHeader 
        tenantName={tenant.name} 
        logoUrl={logoUrl} 
        cartCount={cartCount} 
        onOpenCart={onOpenCart} 
        onOpenMenu={() => setMenuOpen(!menuOpen)} 
        search={search}
        onSearchChange={onSearchChange}
        accent={accent}
      />

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row gap-6">
        {/* Sidebar Filters */}
        <aside className="hidden md:block w-64 shrink-0">
          <div className="bg-background rounded-xl border p-5 sticky top-24">
            <h3 className="font-bold flex items-center gap-2 mb-4 text-lg">
              <Grid className="size-5" /> Categories
            </h3>
            <div className="space-y-1">
              <button 
                onClick={() => onCategoryChange(null)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${!activeCat ? "bg-muted font-semibold" : "hover:bg-muted/50"}`}
              >
                All Departments
              </button>
              {categories.map((c: any) => (
                <button 
                  key={c.id}
                  onClick={() => onCategoryChange(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between group ${activeCat === c.id ? "bg-muted font-semibold" : "hover:bg-muted/50"}`}
                >
                  <span>{c.name}</span>
                  <ChevronRight className={`size-4 opacity-0 group-hover:opacity-100 transition-opacity ${activeCat === c.id ? "opacity-100" : ""}`} />
                </button>
              ))}
            </div>

            <hr className="my-6" />

            <h3 className="font-bold mb-4 text-sm">Sort By</h3>
            <Select value={sort} onValueChange={onSortChange}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder="Recommended" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">Recommended</SelectItem>
                <SelectItem value="newest">Newest Arrivals</SelectItem>
                <SelectItem value="price-asc">Price: Low to High</SelectItem>
                <SelectItem value="price-desc">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </aside>

        <section className="flex-1 min-w-0">
          {/* Mobile Category Chips */}
          <div className="md:hidden flex overflow-x-auto gap-2 pb-4 mb-2 [-ms-overflow-style:none] [scrollbar-width:none]">
            <button 
              onClick={() => onCategoryChange(null)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium border ${!activeCat ? "bg-foreground text-background border-foreground" : "bg-background text-foreground hover:bg-muted"}`}
            >
              All
            </button>
            {categories.map((c: any) => (
              <button 
                key={c.id}
                onClick={() => onCategoryChange(c.id)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium border ${activeCat === c.id ? "bg-foreground text-background border-foreground" : "bg-background text-foreground hover:bg-muted"}`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Results Info */}
          <div className="flex justify-between items-center bg-background p-4 rounded-xl border mb-6">
            <h2 className="font-semibold text-lg">
              {search ? `Results for "${search}"` : activeCat ? "Category Results" : "Top Products"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-bold text-foreground">{visibleProducts.length}</span> of {totalFilteredCount}
            </p>
          </div>

          {/* Product Grid */}
          {isLoading ? (
             <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
                {[1,2,3,4,5,6,7,8].map(i => (
                  <div key={i} className="bg-background rounded-xl border p-4">
                    <div className="aspect-square bg-muted rounded-lg mb-4" />
                    <div className="h-4 bg-muted w-full mb-2" />
                    <div className="h-4 bg-muted w-2/3 mb-4" />
                    <div className="h-8 bg-muted w-1/3 rounded-md" />
                  </div>
                ))}
             </div>
          ) : totalFilteredCount === 0 ? (
            <div className="py-24 text-center bg-background rounded-xl border">
              <Search className="size-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium">No results found.</p>
              <p className="text-sm text-muted-foreground">Try adjusting your filters or search query.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visibleProducts.map((p: any) => {
                  const img = p.images?.[0] || p.image_url;
                  return (
                    <div key={p.id} className="group bg-background rounded-xl border hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col">
                      <div className="relative aspect-square p-4 cursor-pointer" onClick={() => onSelectProduct(p)}>
                        {img ? (
                          <img src={img} alt={p.name} className="object-contain w-full h-full mix-blend-multiply dark:mix-blend-normal group-hover:scale-105 transition-transform" />
                        ) : (
                          <div className="w-full h-full bg-muted rounded-lg flex items-center justify-center text-xs text-muted-foreground">No Image</div>
                        )}
                        {/* Fake badge for market feel */}
                        {p.base_price > 100 && (
                          <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase">
                            Hot Deal
                          </div>
                        )}
                      </div>
                      
                      <div className="p-4 flex flex-col flex-1 border-t bg-muted/5">
                        <h3 className="text-sm font-medium line-clamp-2 mb-1 group-hover:text-primary cursor-pointer" onClick={() => onSelectProduct(p)}>
                          {p.name}
                        </h3>
                        <div className="flex items-center gap-1 mb-2">
                          {[1,2,3,4,5].map(star => (
                            <Star key={star} className={`size-3 ${star <= 4 ? "fill-amber-400 text-amber-400" : "fill-muted text-muted"}`} />
                          ))}
                          <span className="text-[10px] text-muted-foreground ml-1">(124)</span>
                        </div>
                        <p className="text-xl font-bold mb-4 mt-auto">
                          {formatMoney(p.base_price, currency)}
                        </p>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onQuickAdd?.(p); }}
                          className="w-full py-2 rounded-lg text-sm font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: accent || 'hsl(var(--primary))' }}
                        >
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasMore && (
                <div className="mt-8 flex justify-center">
                  <button 
                    onClick={onLoadMore}
                    className="px-8 py-2.5 bg-background border rounded-full text-sm font-bold hover:bg-muted transition-colors shadow-sm"
                  >
                    Show More Results
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="bg-zinc-900 text-white pt-12 pb-8 mt-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h4 className="font-bold mb-4">Get to Know Us</h4>
            <div className="flex flex-col gap-2 text-sm text-zinc-400">
              <a href="#" className="hover:text-white">About Us</a>
              <a href="#" className="hover:text-white">Careers</a>
              <a href="#" className="hover:text-white">Press Releases</a>
            </div>
          </div>
          <div>
            <h4 className="font-bold mb-4">Make Money with Us</h4>
            <div className="flex flex-col gap-2 text-sm text-zinc-400">
              <a href="#" className="hover:text-white">Sell Products</a>
              <a href="#" className="hover:text-white">Become an Affiliate</a>
              <a href="#" className="hover:text-white">Advertise</a>
            </div>
          </div>
          <div>
            <h4 className="font-bold mb-4">Payment Products</h4>
            <div className="flex flex-col gap-2 text-sm text-zinc-400">
              <a href="#" className="hover:text-white">Business Card</a>
              <a href="#" className="hover:text-white">Shop with Points</a>
              <a href="#" className="hover:text-white">Reload Your Balance</a>
            </div>
          </div>
          <div>
            <h4 className="font-bold mb-4">Let Us Help You</h4>
            <div className="flex flex-col gap-2 text-sm text-zinc-400">
              <a href="#" className="hover:text-white">Your Account</a>
              <a href="#" className="hover:text-white">Your Orders</a>
              <a href="#" className="hover:text-white">Shipping Rates</a>
            </div>
          </div>
        </div>
        <div className="border-t border-zinc-800 pt-8 text-center text-zinc-500 text-sm">
          © {new Date().getFullYear()} {tenant.name}. Marketplace Template.
        </div>
      </footer>
    </div>
  );
}
