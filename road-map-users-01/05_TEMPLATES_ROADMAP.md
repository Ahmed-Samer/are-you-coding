# Templates — Production Roadmap

> Group 1: Marketing / Public · Screen 5 of 5
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

A gallery of storefront templates sourced from a shared registry, each with an inline mock preview, a "live preview" dialog, and CTAs that deep-link into onboarding.

---

## 1. UX & Core Features

**Current state**
- Templates come from a shared registry (good — single source reused by onboarding).
- Each card has an interactive mock preview, a "Use template" CTA, and a "Live preview" dialog with a browser-chrome frame.
- Preview button is keyboard-focusable with an accessible label.

**Gaps & risks**
- **Previews are hand-built mock components, not real screenshots.** They approximate but do not represent the actual storefront output, risking a mismatch between expectation and the launched store.
- **No "coming soon"/availability handling.** The registry carries an `available` flag, but the UI ignores it — an unavailable template would still render full CTAs that lead into onboarding.
- **Preview dialog lacks cross-template navigation.** No prev/next within the dialog, so comparing templates means closing and reopening repeatedly.
- **No empty state.** If the registry were ever empty, the grid would render nothing with no explanatory message.
- **All mock previews render eagerly**, including off-screen cards and the large dialog variant — unnecessary work on first paint.
- **Footer Privacy/Terms links are dead** (shared-shell issue).

**World-class targets**
- Real, optimized template preview imagery that matches the actual storefront.
- Availability-aware cards ("coming soon" treatment that disables onboarding CTAs).
- In-dialog prev/next navigation and full keyboard support.
- A graceful empty state.

---

## 2. Performance & Speed

- **Eager mock rendering:** every card's preview (and large variants) renders up front. Defer/lazy-render off-screen previews and the dialog's large preview until needed.
- **Replace mocks with optimized static preview images** (modern formats, responsive sizes, explicit dimensions, lazy below the fold) to cut DOM/render cost and improve fidelity.
- **Dialog code-splitting:** load the heavy preview/dialog content on demand rather than in the initial bundle.
- Reserve card aspect-ratio space (already using a fixed aspect ratio) to keep layout shift at zero.

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Static registry is acceptable today** and keeps the page fast and resilient — no backend dependency required for current scope.
- **Future dynamic path:** if templates become managed/dynamic, source them from a Supabase `templates` table read at the edge with caching; expose only public-safe fields via RLS.
- Preview images should be served from optimized static/CDN assets; avoid Node-only image processing at request time (incompatible with the Worker runtime) — pre-generate assets at build.
- Ensure each template can carry its own OG/preview image for shareable links.

---

## 4. Actionable Steps (production checklist)

- [x] Replace hand-built mock previews with real, optimized template preview images that match the launched storefront.
- [x] Honor the `available` flag: add a "coming soon" treatment that disables onboarding CTAs for unavailable templates.
- [x] Add prev/next navigation and full keyboard support inside the preview dialog.
- [x] Add a graceful empty state for an empty registry.
- [x] Lazy/defer rendering of off-screen previews and the large dialog preview; code-split the dialog.
- [x] Pre-generate preview/OG assets at build time (no request-time Node-only image processing) and serve them optimized via CDN.
- [x] Add per-template OG/preview images for shareable links.
- [x] Document the migration path to a Supabase-backed `templates` table (edge-cached read, public-safe RLS) if templates become dynamic.
- [x] Fix the shared footer Privacy/Terms links (cross-cutting across this batch).
