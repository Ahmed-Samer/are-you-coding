# Product Detail Drawer — Production Roadmap

> Phase 02: Storefront & Onboarding Funnel · Screen 13 of 18
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

A slide-over view of a single product: image gallery with zoom, variant selection (option matrix), quantity, add-to-cart, share, and in-drawer navigation to other products. The conversion moment between browsing and the cart.

---

## 1. UX & Core Features

**Current state**
- Variant model is robust: options/values/variants/links are filtered to the active product, with selection state resolving to a concrete variant and price.
- Gallery supports multiple images, an active index, prev/next, and pointer-based zoom.
- "Open another" lets the shopper jump between products without closing the drawer.
- Quantity stepper and add-to-cart with a stable line key (product + variant).

**Gaps & risks**
- **Drawer state is not deep-linkable or shareable** — there is no URL param for the open product, so a shared "product" link cannot reopen that product, and the product has **no SSR-rendered page for SEO or social unfurls**. This is the biggest gap: products are effectively invisible to crawlers.
- **Gallery images are eager and unoptimized** (no responsive sizes, formats, or dimensions), inflating payload when the drawer opens.
- **Out-of-stock / unavailable-variant states are thin** — selecting an incompatible option combination needs clear disabled/empty treatment and a blocked add-to-cart with explanation.
- **Focus trap & restoration** within the sheet, and **reduced-motion** for the slide/zoom, need verification.
- Share action behavior on browsers without the Web Share API needs a clipboard fallback with confirmation.

**World-class targets**
- A canonical, SSR-rendered product route (deep-linkable, indexable, OG image = product image) that the drawer mirrors for in-store browsing.
- Optimized, responsive gallery imagery with explicit dimensions.
- Clear stock/availability and invalid-combination handling.
- Full keyboard accessibility (focus trap, restore, escape) and reduced-motion support.

---

## 2. Performance & Speed

- **Defer gallery image loading** to drawer open; load the active image first, then prefetch neighbors on idle.
- **Serve responsive, modern-format images with explicit dimensions** to eliminate layout shift inside the drawer.
- Memoize variant lookups (already partially done) so option selection doesn't recompute the full matrix each render.
- Keep the drawer code-split from the storefront initial bundle.
- Avoid recomputing `imagesByProduct`-style maps per open; derive once from the cached catalog payload.

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Single-product read should be edge-cached** (it already has a cached loader and a public product route) — reuse that for both the drawer and the future SSR product page so there is one code path.
- **Expose only public-safe product fields** under RLS; never include cost, internal SKUs beyond what's needed, or tenant-internal flags.
- **Variant integrity is server-authoritative**: price and stock for the chosen variant must be validated server-side at add-to-cart/order time, not trusted from the client payload.
- For the SSR product page, derive OG/Twitter image from the product's cover image via loader data; omit when no image exists rather than emitting a generic one.
- All image transforms pre-generated (no request-time Node image processing on the Worker).

---

## 4. Actionable Steps (production checklist)

1. Add a canonical, SSR-rendered, deep-linkable product route (indexable, product image as OG) that the in-store drawer mirrors.
2. Sync drawer open/close to a URL param so product links are shareable and restore correctly.
3. Optimize gallery images: responsive sources, modern formats, explicit dimensions, active-first then prefetch neighbors.
4. Add clear out-of-stock and invalid-variant-combination states that block add-to-cart with an explanation.
5. Verify and harden focus trap, focus restoration, escape-to-close, and reduced-motion for slide/zoom.
6. Add a clipboard fallback (with confirmation) for share where Web Share API is unavailable.
7. Reuse the single cached product loader for both the drawer and the SSR page (one code path).
8. Enforce server-side validation of variant price/stock at add-to-cart/order time.
9. Confirm the product payload exposes only public-safe fields under RLS.

---

## Status

- [x] 1. Canonical SSR product route at `/p/$productId` shipped (`src/routes/p.$productId.tsx`) with per-product `<title>`, description, `og:title`, `og:description`, `og:type=product`, `og:image` (cover photo, omitted when none), `twitter:card`/`twitter:image`, `<link rel="canonical">`, and inline JSON-LD `Product` structured data.
- [x] 2. Drawer state synced to `?product=<uuid>` via `validateSearch` (`@tanstack/zod-adapter`) on the index route; opening/closing the drawer uses `useNavigate` so browser back/forward and shared links both reopen the correct product.
- [x] 3. Gallery images optimized: WebP `srcset` (480/768/1024/1600), explicit `width`/`height`, `fetchpriority="high"` + `loading="eager"` on active image only, thumbnails lazy-loaded, neighbors prefetched on `requestIdleCallback` (with `setTimeout` fallback). Aspect-ratio container keeps CLS at 0.
- [x] 4. Out-of-stock and invalid-variant-combination states surface an inline `aria-live="polite"` notice and force the Add-to-cart button into `"Unavailable"`, `"Out of stock"`, or `"Choose options"` labels with `disabled` semantics. Unavailable option pills get `aria-disabled` + `title="Unavailable"`.
- [x] 5. Focus management hardened: `SheetDescription` `sr-only` description for screen readers, Radix dialog focus trap + ESC-to-close + focus restoration; gallery supports keyboard `ArrowLeft`/`ArrowRight`; `prefers-reduced-motion` disables the zoom transform and slide transitions.
- [x] 6. Share button uses `navigator.share` when available, falls back to `navigator.clipboard.writeText` + success toast, and finally falls back to a copy-this-link `toast.info` for browsers without either API. `AbortError` (user cancel) is silently ignored.
- [x] 7. Drawer and SSR page both render the SAME `<ProductDetailView/>` component and both back ultimately onto the SAME cached `loadStorefrontProductCached(tenantId, productId)` server loader (exposed by `getStorefrontProduct` in `src/lib/catalog.functions.ts`). One code path, one cache key.
- [x] 8. Server-authoritative variant validation: new `validateCartLines` server fn in `src/lib/cart.functions.ts` re-resolves price + stock for any submitted line via the cached product loader; the drawer fires it after every add and surfaces a toast on drift. Checkout (Screen 19) will re-invoke before `createOrder` for final enforcement.
- [x] 9. Public product payload audited — `loadStorefrontProductCached` projects only public-safe columns (`id, name, sku, description, price_cents, currency, stock, image_url, category_id` plus public variant fields). RLS tightening for `variant_options`, `variant_option_values`, `product_variants`, `product_variant_option_values`, and `product_images` appended to `PENDING_SQL_COMMANDS.sql` (active tenant + active product gate; idempotent `DROP POLICY IF EXISTS … CREATE POLICY`).
