# About — Production Roadmap

> Group 1: Marketing / Public · Screen 2 of 5
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

A static company/product story page: intro, mission, values grid, and a team section, all wrapped in the shared platform shell.

---

## 1. UX & Core Features

**Current state**
- Clean, well-structured narrative: hero intro, mission statement, a four-item values grid with icons, and a team section.
- Fully static and fast; complete SEO/OG metadata is already present.

**Gaps & risks**
- **Team section is placeholder.** Cards show generic group labels (no real names, roles, or photos) and empty avatar circles, which reads as unfinished to visitors.
- **No trust signals.** Missing concrete proof points — number of stores launched, regions served, uptime, customer quotes, or press/logos.
- **No motion or progressive reveal.** Sections appear flat; tasteful scroll reveals (respecting reduced motion) would lift perceived quality.
- **No clear secondary CTA.** The page ends without guiding the reader toward signup, templates, or contact.
- **Footer Privacy/Terms links are dead** (shared-shell issue surfaced here too).

**World-class targets**
- Real team identities (or an intentional "small senior team" treatment that doesn't look like missing data).
- Quantified trust band (metrics + a short customer quote).
- Subtle, reduced-motion-aware entrance animations.
- A closing CTA section that routes to signup/templates.

---

## 2. Performance & Speed

- Already lightweight — primarily text and icons, so initial load is fast.
- **Imagery discipline:** if real team/brand photos are added, they must be optimized, responsively sized, and given explicit dimensions to avoid layout shift.
- **Add `Organization` JSON-LD** structured data to strengthen brand/SEO signals at near-zero cost.
- Keep icons tree-shaken (icon set already imports individual icons).

---

## 3. Backend & Cloudflare/Supabase Compliance

- **No data layer is required** for this page in its current form — it is purely presentational and should stay statically rendered for speed and resilience.
- If trust metrics become dynamic later, source them from Supabase via an edge-safe read and cache aggressively; do not introduce per-visit live queries for a marketing page.
- No secrets, no server mutations, no Node-only dependencies — nothing on this page should compromise edge compatibility.

---

## 4. Actionable Steps (production checklist)

- [x] Replace placeholder team cards with real names/roles/photos, or an intentional design that doesn't read as missing data.
- [x] Add a quantified trust band (key metrics) plus at least one genuine customer quote.
- [x] Add `Organization` JSON-LD structured data for richer search/social presence.
- [x] Add reduced-motion-aware scroll reveals to mission, values, and team sections.
- [x] Add a closing CTA section routing to signup/templates.
- [x] Optimize and size any newly added imagery with explicit dimensions.
- [x] Fix the shared footer Privacy/Terms links (cross-cutting across this batch).
