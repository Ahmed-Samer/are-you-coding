# Storefront Home — Production Roadmap

> Phase 02: Storefront & Onboarding Funnel · Screen 12 of 18
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

The public, tenant-facing storefront: hero, category filters, search/sort, featured section, and a paginated product grid. This is the highest-traffic, most SEO-sensitive surface in the product and the root of the storefront → product → cart → WhatsApp funnel.

---

## 1. UX & Core Features

**Current state**
- Tenant context is resolved server-side (host → verified custom domain → subdomain slug) with a fail-soft fallback to the platform shell, plus a dev/preview-only `?store=` override.
- Catalog read is a cached server function with sensible client-side stale/gc times and no refetch-on-focus.
- Good interaction model: filter/sort/pagination transitions are atomic via a reducer (filter changes correctly reset the visible page count); search has desktop and mobile variants; product/cart drawers are local UI state.
- Skeleton grid renders during load; an explicit empty state covers "no products match".
- Abandoned-cart deep link (`?recover=<token>`) hydrates the cart before the background sync is allowed to fire, avoiding a write race.

**Gaps & risks**
- **SEO/OG meta is applied client-side only** (via document/head mutation in an effect). Crawlers and social unfurls that don't execute JS see generic platform tags, not the store's title/description/OG image. This must be server-rendered per tenant.
- **No explicit storefront 404 / not-found path** for an unknown, suspended, or pending slug — the resolver silently degrades to the platform shell, so a mistyped store URL shows the marketing site instead of a proper "store not found" page.
- **PWA manifest is generated as a runtime Blob URL** on the client; this won't be picked up reliably by crawlers/installers and adds client work. Prefer a per-tenant manifest endpoint.
- **Product/hero/featured imagery is unoptimized** — no responsive sizes, modern formats, or explicit dimensions, risking layout shift and slow LCP on the hero.
- Category chip row and featured section can cause horizontal overflow jank on small screens; verify reduced-motion handling on the hero slider.

**World-class targets**
- Per-tenant SSR meta (title, description, canonical, OG/Twitter image) emitted at the edge.
- A real storefront not-found page for unresolved/suspended slugs.
- Optimized, responsive, dimensioned imagery with a fast hero LCP.
- Installable PWA via a cacheable per-tenant manifest route.

---

## 2. Performance & Speed

- **Lean on edge + isolate caching** for the catalog read (already cached) and add HTTP `Cache-Control` + `ETag` on the public catalog route so the CDN serves repeat visitors without hitting the origin.
- **Optimize the hero image for LCP**: explicit dimensions, responsive `srcset`, modern formats, and high fetch priority for the first slide only.
- **Lazy-load below-the-fold product imagery**; reserve aspect-ratio boxes to keep CLS at zero.
- **Pre-generate/transform images at build or upload time** — never do request-time Node-only image processing (incompatible with the Worker runtime).
- Code-split the product and cart drawers so they aren't in the first paint bundle.

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Tenant resolution must stay edge-safe**: it already uses an anon-key client and fail-soft fallback so a missing service-role secret never bricks the storefront — preserve this.
- **Move SEO meta to SSR**: resolve tenant + minimal meta during the server render so the initial HTML carries correct per-store tags. Keep the heavy catalog as a cached read.
- **Public reads must expose only public-safe fields** under RLS — never leak internal tenant/billing columns through the storefront payload.
- **`?store=` override must remain restricted** to localhost and sandbox/preview hosts (it is) so it can never force tenant context on the production marketing/admin surface.
- Serve the per-tenant manifest from a cacheable public route rather than a client Blob.
- All caching/invalidation must self-heal at TTL; ensure tenant mutations invalidate the slug→tenant and catalog cache families.

---

## 4. Actionable Steps (production checklist)

1. Render per-tenant SEO/OG/canonical meta server-side at the edge instead of client-side head mutation.
2. Add a real storefront not-found page for unknown/suspended/pending slugs (stop degrading silently to the platform shell).
3. Replace the client Blob manifest with a cacheable per-tenant manifest route.
4. Optimize the hero for LCP (dimensions, responsive sources, modern formats, priority on first slide only).
5. Lazy-load below-the-fold product images with reserved aspect-ratio boxes (CLS = 0).
6. Add HTTP `Cache-Control` + `ETag` to the public catalog route for CDN reuse.
7. Pre-generate image variants at build/upload time; never process images at request time on the Worker.
8. Code-split product and cart drawers out of the initial bundle.
9. Confirm the storefront payload exposes only public-safe fields under RLS.
10. Verify reduced-motion handling on the hero slider and fix small-screen overflow in the category/featured rows.

## Status

- [x] 1. Per-tenant SEO/OG/canonical meta now emitted server-side from `__root.tsx` `head()` (sourced from `resolveTenant` payload). Client `setMeta` block removed from `Storefront.tsx`.
- [x] 2. Storefront not-found page added (`StoreNotFound.tsx`); `resolveTenant` returns `notFound` + `notFoundReason` (`unknown` | `suspended` | `pending`); root head emits `robots: noindex,nofollow` for that branch.
- [x] 3. Per-tenant manifest served from `/api/public/storefront/$tenantSlug/manifest` with `Cache-Control` + `ETag`. `<link rel="manifest">` wired in root head; client Blob manifest effect removed.
- [x] 4. Hero now uses a real `<img>` with explicit dimensions, `srcset`/`sizes`, `fetchpriority=high` + `loading=eager` for slide 0 only; `prefers-reduced-motion` disables auto-rotation.
- [x] 5. Product cards keep aspect-ratio box, explicit `width/height`, `loading=lazy`, `decoding=async`, `fetchpriority=low` (CLS = 0).
- [x] 6. Catalog route already uses `jsonWithCaching` (`Cache-Control` + `ETag` + `Vary`); manifest route uses the same helper with a longer-TTL preset.
- [x] 7. No request-time Node image processing — `image-url.ts` builds Supabase Storage `?width=&format=webp` srcsets purely via URL rewriting.
- [x] 8. `ProductDrawer` and `CartDrawer` lazy-loaded via `React.lazy` + `Suspense`, mounted only when their open state is truthy.
- [x] 9. Public storefront tenant projection audited — only public-safe fields (`seo_*`, `og_image_url`, `logo_url`, `accent_color`, `whatsapp_e164`, `theme`, hours, currency). No `owner_id`/billing/MFA leakage.
- [x] 10. Hero respects `prefers-reduced-motion`; category chip rows now use `flex-nowrap`, hidden scrollbars, `overscroll-behavior-x: contain`, and `scroll-snap-type: x proximity` to fix small-screen overflow jank.

No new SQL was required for Screen 12 (existing RLS policies already restrict storefront reads to active tenants/products and the loader projection is public-safe). `PENDING_SQL_COMMANDS.sql` left unchanged.
