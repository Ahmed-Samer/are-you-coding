# Pricing — Production Roadmap

> Group 1: Marketing / Public · Screen 4 of 5
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

The subscription pricing page: a headline, a local-payments note, and a grid of plan cards that deep-link into onboarding with a selected plan.

---

## 1. UX & Core Features

**Current state**
- Clear headline and a local-payment reassurance line.
- Plan cards with price, blurb, feature list, a highlighted "popular" tier, and CTAs that carry the chosen plan into onboarding.
- Valid `Product`/`Offer` JSON-LD is already present.

**Gaps & risks**
- **Advertised tiers don't match displayed tiers.** Structured data and the broader product describe three tiers (Starter, Growth, Scale), but only two cards render — a real inconsistency that confuses buyers and weakens SEO trust.
- **Quarterly billing is referenced but absent.** Other parts of the product mention quarterly/monthly billing, yet there is no monthly/quarterly toggle here, so cheaper commitments are invisible.
- **Plans are hardcoded.** Prices/features live in a local array, so they can drift from the real billing logic, onboarding, and checkout — a maintenance and correctness risk.
- **No comparison table or FAQ.** Buyers can't easily compare tiers or resolve common objections (payment methods, refunds, switching plans).
- **No loading/empty/error states** because data is static — these become necessary once pricing is sourced dynamically.
- **Footer Privacy/Terms links are dead** (shared-shell issue).

**World-class targets**
- All advertised tiers shown, consistent with structured data and checkout.
- Monthly/quarterly toggle with transparent savings.
- A feature comparison table and a pricing FAQ.
- Pricing sourced from a single backend source of truth shared with onboarding and checkout.

---

## 2. Performance & Speed

- Static render is fast and JSON-LD is in place (good for SEO).
- When pricing becomes dynamic, **fetch at the edge and cache aggressively** (pricing changes rarely) to keep the page near-instant; avoid a per-visit live query that adds latency.
- Reserve card dimensions so a monthly/quarterly toggle or async load doesn't cause layout shift.
- Keep JSON-LD in sync with the rendered tiers to avoid search penalties.

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Single source of truth in Supabase.** Plans (name, slug, price, currency, interval, features, highlight flag) should come from a Supabase `plans` table consumed by pricing, onboarding, and checkout alike — eliminating drift.
- **Edge-safe reads:** fetch via an edge-compatible path with caching; no Node-only modules.
- **Currency/locale correctness:** ensure displayed prices and currency (USD/EGP, local payment methods) match what billing actually charges.
- **RLS:** the `plans` table should expose only safe, public-readable fields via an appropriate read policy; no sensitive billing internals leak to the client.
- Keep JSON-LD generated from the same data source so structured data and UI never diverge.

---

## 4. Actionable Steps (production checklist)

1. [x] Render all advertised tiers (Starter, Growth, Scale) consistently with the structured data and checkout.
2. [x] Add a monthly/quarterly billing toggle with clearly shown savings.
3. [x] Move plan definitions into a Supabase `plans` table and consume it on the pricing page (shared with onboarding/checkout).
4. [x] Generate the JSON-LD from the same data source so structured data always matches the UI.
5. [x] Add a feature comparison table and a pricing FAQ (payment methods, refunds, plan switching).
6. [x] Fetch pricing at the edge with aggressive caching; add loading/empty/error states for the dynamic path.
7. [x] Verify currency/locale and local payment methods match what billing actually charges.
8. [x] Apply read-only RLS exposing only safe public fields on the plans table.
9. [x] Reserve card/layout dimensions to prevent shift from the toggle or async load.
10. [x] Fix the shared footer Privacy/Terms links (cross-cutting across this batch) — verified `/privacy` and `/terms` routes resolve correctly via `PlatformShell` footer.
