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
    <header className="border-b border-border sticky top-0 bg-background/90 backdrop-blur z-30">
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight min-w-0">
          {logoUrl ? (
            <img src={logoUrl} alt={`${tenantName} logo`} width={28} height={28} decoding="async" className="size-7 rounded-md object-cover" />
          ) : (
            <span
              className="inline-block size-7 rounded-md"
              style={{ background: accent || "hsl(var(--foreground))" }}
              aria-hidden
            />
          )}
          <span className="truncate">{tenantName}</span>
          {customDomain && (
            <span className="hidden md:inline-flex items-center gap-1 ml-2 text-xs text-muted-foreground">
              <Globe className="size-3" />
              {customDomain}
            </span>
          )}
          {isOpen !== undefined && (
            <span
              className={`hidden sm:inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                isOpen
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-destructive/15 text-destructive"
              }`}
              aria-label={isOpen ? "Store open" : "Store closed"}
            >
              <Clock className="size-3" />
              {isOpen ? "Open now" : "Closed"}
            </span>
          )}
        </Link>
        <div className="relative hidden sm:block flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search products"
            className="pl-9 h-9"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search products"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenCart}
          className="gap-2 min-h-11 sm:min-h-9"
          aria-label={`Open cart, ${cartCount} items`}
        >
          <ShoppingBag className="size-4" />
          <span className="hidden sm:inline">Cart</span>
          {cartCount > 0 && (
            <span
              className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-medium"
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
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <div className="font-semibold text-foreground">{tenantName}</div>
          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">{description}</p>
        </div>
        <div className="space-y-2 text-muted-foreground">
          {theme.address && (
            <div className="flex items-start gap-2"><MapPin className="size-3.5 mt-0.5 flex-shrink-0" /><span>{theme.address}</span></div>
          )}
          {theme.hours && (
            <div className="flex items-start gap-2"><Clock className="size-3.5 mt-0.5 flex-shrink-0" /><span>{theme.hours}</span></div>
          )}
        </div>
        <div className="flex sm:justify-end gap-3 items-start text-muted-foreground">
          {theme.social?.instagram && (
            <a href={theme.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-foreground">
              <Instagram className="size-4" />
            </a>
          )}
          {theme.social?.facebook && (
            <a href={theme.social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="hover:text-foreground">
              <Facebook className="size-4" />
            </a>
          )}
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-muted-foreground">
          © {new Date().getFullYear()} {tenantName}
        </div>
      </div>
    </footer>
  );
}