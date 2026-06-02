# Onboarding — Template — Production Roadmap

> Phase 02: Storefront & Onboarding Funnel · Screen 16 of 18 (Wizard step 2 of 4)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

Step 2 of the wizard: choose a storefront template. Selection is sourced from the same shared template registry used by the public Templates marketing page, keeping a single source of truth.

---

## 1. UX & Core Features

**Current state**
- Templates come from the shared registry (good — one source reused by the marketing Templates page and onboarding).
- Each option honors the `available` flag: unavailable templates are disabled with a "soon" treatment and cannot be selected.
- Selection persists in the wizard draft and shows a check indicator; only an available template can advance.

**Gaps & risks**
- **Previews are placeholder tiles** (a generic store icon), not real imagery — mirrors the Phase-01 Templates finding. The user picks a template without seeing what it actually produces.
- **No revalidation at confirm time**: a draft restored from localStorage could reference a template that has since become unavailable or been removed; the confirm step should re-check.
- **No template description/feature depth** to differentiate options beyond a one-line description.
- No focus management on step entry; the grid is keyboard-navigable but lacks a clear roving focus pattern.

**World-class targets**
- Real, optimized template preview imagery matching the launched storefront.
- Confirm-time revalidation that the chosen template still exists and is available.
- Richer per-template detail to support an informed choice.

---

## 2. Performance & Speed

- When real previews replace placeholders, use **optimized, responsive images with explicit dimensions** and lazy-load off-screen options to keep this step light.
- Keep template metadata static/bundled (it is) so the step has no network dependency.
- Reserve aspect-ratio space for preview tiles to keep CLS at zero.
- Pre-generate preview assets at build time — no request-time Node image processing on the Worker.

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Static registry remains acceptable** for current scope and keeps the step fast and resilient.
- **Future dynamic path**: if templates become managed, source them from a Supabase `templates` table read at the edge with caching, exposing only public-safe fields.
- The chosen template id is persisted to the tenant at create time — ensure the create server function validates the template id against the known registry/table so a tampered draft can't persist an invalid template.
- Preview/OG assets served from optimized CDN/static storage.

---

## 4. Actionable Steps (production checklist)

- [x] Replace placeholder tiles with real, optimized template preview imagery that matches the launched storefront.
- [x] Revalidate the selected template's existence/availability at the confirm step (guard restored drafts).
- [x] Validate the persisted template id server-side at create time against the known registry/table.
- [x] Add richer per-template detail to support an informed choice.
- [x] Lazy-load off-screen previews with reserved aspect-ratio boxes (CLS = 0).
- [x] Pre-generate preview/OG assets at build time; serve optimized via CDN.
- [x] Add roving-focus keyboard navigation and focus management on step entry.
- [x] Document the migration path to an edge-cached Supabase `templates` table if templates become dynamic.

Status: shipped — 2026-06-02.
