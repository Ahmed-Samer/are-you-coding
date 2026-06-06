import { Link } from "@tanstack/react-router";
import { Search, ShoppingBag, Globe, Instagram, Facebook, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AnnouncementBar({ text, accent }: { text: string; accent: string | null }) {
  return (
    <div
      className="text-center text-xs py-2 px-4 border-b border-border"
      style={accent ? { background: accent, color: "#fff" } : { background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}
    >
      {text}
    </div>
  );
}

export function StorefrontHeader({
  tenantName,
  logoUrl,
  accent,
  customDomain,
  search,
  onSearchChange,
  cartCount,
  onOpenCart,
  isOpen,
}: {
  tenantName: string;
  logoUrl: string | null;
  accent: string | null;
  customDomain: string | null;
  search: string;
  onSearchChange: (v: string) => void;
  cartCount: number;
  onOpenCart: () => void;
  isOpen?: boolean;
}) {
  return (
    <header className="border-b border-border/40 sticky top-0 bg-background/80 backdrop-blur-lg z-30 transition-all duration-300">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight min-w-0 group">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={`${tenantName} logo`} 
              width={32} 
              height={32} 
              decoding="async" 
              className="size-8 rounded-lg object-cover shadow-sm transition-transform duration-300 group-hover:scale-105" 
            />
          ) : (
            <span
              className="inline-block size-8 rounded-lg shadow-sm transition-transform duration-300 group-hover:scale-105"
              style={{ background: accent || "hsl(var(--foreground))" }}
              aria-hidden
            />
          )}
          <span className="truncate text-lg">{tenantName}</span>
          {customDomain && (
            <span className="hidden md:inline-flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-muted/50 text-xs text-muted-foreground border border-border/50">
              <Globe className="size-3" />
              {customDomain}
            </span>
          )}
          {isOpen !== undefined && (
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                isOpen
                  ? "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}
              aria-label={isOpen ? "Store open" : "Store closed"}
            >
              <Clock className="size-3" />
              {isOpen ? "Open now" : "Closed"}
            </span>
          )}
        </Link>

        <div className="relative hidden sm:block flex-1 max-w-md transition-all group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-10 h-10 rounded-full bg-muted/30 border-transparent hover:bg-muted/50 focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-border transition-all duration-300"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search products"
          />
        </div>

        <Button
          variant="outline"
          onClick={onOpenCart}
          className="gap-2.5 h-10 rounded-full px-4 border-border/50 hover:bg-accent/50 transition-all duration-300 shrink-0"
          aria-label={`Open cart, ${cartCount} items`}
        >
          <ShoppingBag className="size-4.5" />
          <span className="hidden sm:inline font-medium">Cart</span>
          {cartCount > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold shadow-sm transition-transform animate-in zoom-in"
              style={accent ? { background: accent, color: "#fff" } : { background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}
            >
              {cartCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}

export function StorefrontFooter({
  tenantName,
  description,
  theme,
}: {
  tenantName: string;
  description: string;
  theme: Record<string, any>;
}) {
  return (
    <footer className="border-t border-border/50 bg-muted/20">
      <div className="mx-auto max-w-6xl px-6 py-16 grid gap-10 sm:grid-cols-3 text-sm">
        <div className="space-y-4">
          <div className="font-semibold text-foreground text-lg tracking-tight">{tenantName}</div>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">{description}</p>
        </div>
        <div className="space-y-3 text-muted-foreground">
          {theme.address && (
            <div className="flex items-start gap-3 transition-colors hover:text-foreground"><MapPin className="size-4 mt-0.5 flex-shrink-0" /><span>{theme.address}</span></div>
          )}
          {theme.hours && (
            <div className="flex items-start gap-3 transition-colors hover:text-foreground"><Clock className="size-4 mt-0.5 flex-shrink-0" /><span>{theme.hours}</span></div>
          )}
        </div>
        <div className="flex sm:justify-end gap-4 items-start text-muted-foreground">
          {theme.social?.instagram && (
            <a href={theme.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="p-2 rounded-full bg-muted hover:bg-foreground hover:text-background transition-all duration-300">
              <Instagram className="size-4.5" />
            </a>
          )}
          {theme.social?.facebook && (
            <a href={theme.social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="p-2 rounded-full bg-muted hover:bg-foreground hover:text-background transition-all duration-300">
              <Facebook className="size-4.5" />
            </a>
          )}
        </div>
      </div>
      <div className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted-foreground flex flex-col sm:flex-row justify-between items-center gap-4">
          <span>© {new Date().getFullYear()} {tenantName}. All rights reserved.</span>
          <span className="opacity-60">Powered by RentWebify</span>
        </div>
      </div>
    </footer>
  );
}