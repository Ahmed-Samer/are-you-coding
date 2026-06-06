import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CartProvider, makeLineKey, useCart } from "@/lib/cart";
import { getStorefront } from "@/lib/catalog.functions";
import { getRecoveredCart } from "@/lib/abandoned-carts.functions";
import { useAbandonedCartSync } from "@/lib/use-abandoned-cart-sync";
import type { ResolvedTenant } from "@/lib/tenant.functions";
import { getAvailability } from "@/lib/availability";
import { quickAdd } from "./storefront-utils";
import { TemplateComponents } from "../templates";
import { TemplateProps } from "../templates/types";

// Read `?product=<uuid>` (validated by the index route's searchSchema) so
// the drawer becomes deep-linkable and back/forward-friendly. We use
// getRouteApi (not Route.useSearch) because Storefront is also rendered
// from the platform shell during preview overrides where the route handle
// isn't directly importable.
const indexRouteApi = getRouteApi("/");

// Drawers are below-the-fold UI — lazy-load so they don't ship in the
// first paint bundle. Each drawer is mounted only when its parent state
// flips on (`detail !== null` for ProductDrawer, `cartOpen` for CartDrawer).
const ProductDrawer = lazy(() =>
  import("./ProductDrawer").then((m) => ({ default: m.ProductDrawer })),
);
const CartDrawer = lazy(() =>
  import("./CartDrawer").then((m) => ({ default: m.CartDrawer })),
);

const PAGE_SIZE = 12;

// Filter/pagination state is linked: any filter change must reset the visible
// page count. A reducer makes those linked transitions atomic and removes the
// "reset pagination" effect that previously fired on every filter change.
type SortKey = "featured" | "price-asc" | "price-desc" | "name" | "newest";
type FilterState = { search: string; activeCat: string | null; sort: SortKey; visibleCount: number };
type FilterAction =
  | { type: "search"; value: string }
  | { type: "category"; value: string | null }
  | { type: "sort"; value: SortKey }
  | { type: "loadMore" };

const initialFilters: FilterState = { search: "", activeCat: null, sort: "featured", visibleCount: PAGE_SIZE };

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "search":   return { ...state, search: action.value, visibleCount: PAGE_SIZE };
    case "category": return { ...state, activeCat: action.value, visibleCount: PAGE_SIZE };
    case "sort":     return { ...state, sort: action.value, visibleCount: PAGE_SIZE };
    case "loadMore": return { ...state, visibleCount: state.visibleCount + PAGE_SIZE };
  }
}

export function Storefront({ tenant }: { tenant: ResolvedTenant }) {
  return (
    <CartProvider tenantId={tenant.id}>
      <StorefrontInner tenant={tenant} />
    </CartProvider>
  );
}

function StorefrontInner({ tenant }: { tenant: ResolvedTenant }) {
  const fetcher = useServerFn(getStorefront);
  const { data, isLoading } = useQuery({
    queryKey: ["storefront", tenant.id],
    queryFn: () => fetcher({ data: { tenantId: tenant.id } }),
    staleTime: 5 * 60_000, // 5 min — public catalog rarely changes between visits
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const cart = useCart();
  const navigate = useNavigate();
  // URL-driven drawer state: `?product=<uuid>` and `?cart=open` are the
  // single source of truth so drawers are shareable, browser-back-closable
  // and SSR-stable.
  const { product: openProductId, cart: cartParam } = indexRouteApi.useSearch();
  const cartOpen = cartParam === "open";
  const setCartOpen = useCallback(
    (next: boolean) => {
      navigate({
        to: "/",
        search: (prev: any) => ({ ...prev, cart: next ? "open" : undefined }),
        replace: true,
      });
    },
    [navigate],
  );
  const [filters, dispatch] = useReducer(filterReducer, initialFilters);
  const { search, activeCat, sort, visibleCount } = filters;
  // Deep-link hydration must finish before the sync hook is allowed to fire,
  // otherwise the first debounced sync could race the recovered cart write.
  const [hydrating, setHydrating] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("recover");
  });
  const hydrationDoneRef = useRef(false);

  const products = data?.products ?? [];
  const categories = data?.categories ?? [];
  const productImages = (data?.productImages ?? []) as any[];
  const imagesByProduct = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const img of productImages) {
      const arr = m.get(img.product_id) ?? [];
      arr.push(img);
      m.set(img.product_id, arr);
    }
    return m;
  }, [productImages]);
  const detail = openProductId ? products.find((p: any) => p.id === openProductId) ?? null : null;
  const detailImages = detail ? (imagesByProduct.get(detail.id) ?? []) : [];
  const storeMeta = (data?.tenant ?? {}) as any;
  const theme = (storeMeta.theme ?? {}) as Record<string, any>;
  const accent: string | null = storeMeta.accent_color ?? theme.accent_color ?? null;
  const logoUrl: string | null = storeMeta.logo_url ?? null;
  const currency: string = storeMeta.currency ?? "EGP";
  const availability = getAvailability(storeMeta);
  const announcement: string | null = theme.announcement ?? null;
  const heroSlides: { title: string; subtitle?: string; image?: string }[] =
    Array.isArray(theme.hero_slides) && theme.hero_slides.length > 0
      ? theme.hero_slides
      : [{ title: tenant.name, subtitle: "Browse the catalog and check out on WhatsApp." }];
  const featuredIds: string[] = Array.isArray(theme.featured_ids) ? theme.featured_ids : [];
  const featured = featuredIds.length
    ? products.filter((p: any) => featuredIds.includes(p.id))
    : products.slice(0, 4);

  // ---- Abandoned-cart deep link (?recover=<token>) ----
  const recoverFn = useServerFn(getRecoveredCart);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hydrationDoneRef.current) return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("recover");
    if (!token) {
      setHydrating(false);
      return;
    }
    hydrationDoneRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await recoverFn({ data: { token } });
        if (cancelled) return;
        if (res.found && res.cart.tenantId === tenant.id) {
          const items = Array.isArray(res.cart.items) ? (res.cart.items as any[]) : [];
          const normalised = items
            .filter((it) => it && it.productId && it.name)
            .map((it) => ({
              lineKey: it.lineKey ?? makeLineKey(it.productId, it.variantId ?? null),
              productId: String(it.productId),
              variantId: it.variantId ?? null,
              variantLabel: it.variantLabel ?? null,
              name: String(it.name),
              priceCents: Number(it.priceCents ?? 0),
              imageUrl: it.imageUrl ?? null,
              quantity: Math.max(1, Math.min(999, Number(it.quantity ?? 1))),
            }));
          cart.adoptSessionId(res.cart.sessionId);
          cart.setRecoveryCartId(res.cart.id);
          cart.setRecoveryToken(token);
          if (normalised.length > 0) {
            cart.replaceItems(normalised);
            setCartOpen(true);
          }
        } else if (!res.found) {
          toast.error("This recovery link has expired.");
        } else {
          console.warn("[recover] tenant mismatch — ignoring");
          toast.error("This cart belongs to a different store.");
        }
      } catch (e) {
        console.warn("[recover] hydration failed", (e as Error)?.message);
      } finally {
        // Strip ?recover from the URL so back-nav doesn't replay hydration.
        try {
          url.searchParams.delete("recover");
          const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash;
          window.history.replaceState({}, "", next);
        } catch { /* noop */ }
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id]);

  // ---- Debounced background sync (mounts once at storefront root) ----
  useAbandonedCartSync({
    tenantId: tenant.id,
    currency,
    promoCode: null,
    hydrating,
  });

  // Apply tenant accent color + font pair as scoped CSS variables.
  const themeStyle = useMemo(() => {
    const s: Record<string, string> = {};
    if (accent) s["--store-accent"] = accent;
    if (theme.font_heading) s["--store-font-heading"] = String(theme.font_heading);
    if (theme.font_body) s["--store-font-body"] = String(theme.font_body);
    return s as React.CSSProperties;
  }, [accent, theme.font_heading, theme.font_body]);

  // SEO meta and per-tenant PWA manifest are now emitted server-side from
  // `__root.tsx` `head()`, sourced from the tenant DTO carried in
  // `TenantContext`. The client-side `setMeta(...)` and Blob-URL manifest
  // effects that previously lived here have been removed because crawlers
  // and installers don't run JS.

  // Pagination resets are atomic inside the reducer — no effect needed.

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Build descendant set for activeCat using path.
    let allowed: Set<string> | null = null;
    if (activeCat) {
      allowed = new Set<string>([activeCat]);
      const cur = categories.find((c: any) => c.id === activeCat);
      const prefix = cur?.path ?? activeCat;
      for (const c of categories) {
        const p: string = c.path ?? c.id;
        if (p === prefix || p.startsWith(`${prefix}/`)) allowed.add(c.id);
      }
    }
    const list = products.filter((p: any) => {
      if (allowed && (!p.category_id || !allowed.has(p.category_id))) return false;
      if (q && !(`${p.name} ${p.sku ?? ""} ${p.description ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
    switch (sort) {
      case "price-asc":  list.sort((a: any, b: any) => a.price_cents - b.price_cents); break;
      case "price-desc": list.sort((a: any, b: any) => b.price_cents - a.price_cents); break;
      case "name":       list.sort((a: any, b: any) => a.name.localeCompare(b.name)); break;
      case "newest":     list.sort((a: any, b: any) => (b.created_at ?? "").localeCompare(a.created_at ?? "")); break;
    }
    return list;
  }, [products, categories, search, activeCat, sort]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const customDomain = hostname && !/\.lovable\.(app|dev|project\.com)$/i.test(hostname) ? hostname : null;

  // Stable handlers so memoized ProductCard rows don't re-render on every parent update.
  const handleSelectProduct = useCallback(
    (p: any) => {
      navigate({ to: "/", search: (prev: any) => ({ ...prev, product: p.id }), replace: false });
    },
    [navigate],
  );
  const handleQuickAdd = useCallback((p: any) => quickAdd(cart, p), [cart]);
  const handleLoadMore = useCallback(() => dispatch({ type: "loadMore" }), []);
  const handleOpenCart = useCallback(() => setCartOpen(true), [setCartOpen]);
  const handleSearchChange = useCallback((v: string) => dispatch({ type: "search", value: v }), []);
  const handleCloseDetail = useCallback(
    (o: boolean) => {
      if (!o) navigate({ to: "/", search: (prev: any) => ({ ...prev, product: undefined }), replace: true });
    },
    [navigate],
  );

  const TemplateComponent = TemplateComponents[(tenant.template || "classic") as keyof typeof TemplateComponents] || TemplateComponents.classic;

  const templateProps: TemplateProps = {
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
    visibleProducts: visible,
    totalFilteredCount: filtered.length,
    hasMore: visible.length < filtered.length,
    isLoading,
    onSearchChange: handleSearchChange,
    onCategoryChange: (catId) => dispatch({ type: "category", value: catId }),
    onSortChange: (v) => dispatch({ type: "sort", value: v as SortKey }),
    onLoadMore: handleLoadMore,
    onSelectProduct: handleSelectProduct,
    onQuickAdd: handleQuickAdd,
    cartCount: cart.count,
    onOpenCart: handleOpenCart,
  };

  return (
    <>
      <TemplateComponent {...templateProps} />

      {detail && (
        <Suspense fallback={null}>
          <ProductDrawer
            product={detail}
            tenantId={tenant.id}
            images={detailImages}
            variants={data?.variants ?? null}
            allProducts={products}
            currency={currency}
            accent={accent}
            open={!!detail}
            onOpenChange={handleCloseDetail}
            onOpenAnother={handleSelectProduct}
          />
        </Suspense>
      )}
      {cartOpen && (
        <Suspense fallback={null}>
          <CartDrawer
            open={cartOpen}
            onOpenChange={setCartOpen}
            tenantId={tenant.id}
            tenantName={tenant.name}
            currency={currency}
            accent={accent}
            tenantWhatsapp={storeMeta.whatsapp_e164 ?? null}
            availability={availability}
            shippingZones={(storeMeta as any).shipping_zones}
          />
        </Suspense>
      )}
    </>
  );
}