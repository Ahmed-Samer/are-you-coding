# Landing Page — Production Roadmap

> Group 1: Marketing / Public · Screen 1 of 5
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

The platform homepage shown on the root domain: hero, trust logos, "how it works", a lazy-loaded below-the-fold section, a scroll-triggered sticky CTA, and an exit-intent email capture modal.

---

## 1. UX & Core Features

**Current state**
- Strong hero with clear value proposition, dual CTAs, and trust microcopy.
- Below-the-fold content is split out and lazy-loaded behind a Suspense fallback.
- A sticky CTA appears after deep scroll and can be dismissed.
- An exit-intent modal captures an email when the cursor leaves the viewport top.

**Gaps & risks**
- **Form submissions are visual-only stubs.** Both the exit-intent capture and any inline email field reset state on submit but persist nothing — the lead is silently lost. This is the single biggest "looks done but isn't" issue.
- **Exit-intent never fires on mobile/touch.** It listens for a top-edge `mouseout`, which never happens on phones/tablets — a large share of traffic never sees it. No scroll-depth or time-on-page fallback exists.
- **Modal accessibility is incomplete.** No focus trap, no focus return to the trigger on close, and no `Escape`-to-close. Background scroll is not locked while the modal is open.
- **No reduced-motion handling.** Scroll-driven UI and any entrance animation ignore `prefers-reduced-motion`.
- **Sticky CTA threshold is a magic pixel value** (fixed scroll offset) rather than relative to viewport/content height — behaves inconsistently across screen sizes.
- **Logos strip is plain text placeholders**, undermining the "trusted by" social proof it is meant to provide.
- **No empty/error/success states** for the capture forms (only an optimistic success view); a failed network call would appear to succeed.
- **Footer Privacy/Terms links are dead** (placeholder anchors) — a trust and potential compliance gap surfaced via the shared shell.

**World-class targets**
- Real, persisted lead capture with inline validation, pending, success, and error states.
- Mobile-aware intent triggers (scroll depth + idle time) replacing desktop-only exit intent.
- Fully accessible modal: focus trap, restore focus, `Escape`, scroll lock, `aria-modal` semantics.
- Genuine social proof (real or tastefully styled brand marks) and a testimonials/results band.
- Motion that respects reduced-motion preferences.

---

## 2. Performance & Speed

- **Good:** below-the-fold is code-split and lazy-loaded, keeping the initial bundle lean.
- **Layout shift:** the hero and lazy section need reserved dimensions so deferred content and any imagery do not cause cumulative layout shift; the Suspense fallback should match the real section's height.
- **Imagery:** any hero/OG/social or logo imagery must be optimized (modern formats, responsive sizes, explicit width/height, lazy where below the fold).
- **Prefetch:** the primary "Start free trial" CTA should prefetch its destination on hover/viewport so the signup route feels instant.
- **Event listeners:** scroll and mouse listeners should be passive and throttled (scroll already passive) to avoid main-thread jank.
- **Background grid/visual effects** should be pure CSS (already are) and must not trigger expensive repaints.

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Lead capture must hit a real backend.** Route email capture through a Supabase-backed server function (preferred for first-party calls) or a public endpoint, persisting to a `leads`/`subscribers` table with timestamp and source.
- **Validation & abuse protection:** validate the email server-side, enforce length/format limits, and rate-limit by IP to prevent spam — never trust the client stub.
- **Edge runtime safety:** the submission path must avoid Node-only modules; use Web-standard APIs and the project's existing email mechanism (Resend) so it runs cleanly on Cloudflare Workers.
- **No secrets in client code:** keep any keys server-side; the page itself only needs the publishable config.
- **RLS:** the capture table must have row-level security with an insert path scoped appropriately (server-side service role or a tightly scoped public insert policy).

---

## 4. Actionable Steps (production checklist)

- [x] 1. Replace the exit-intent and inline email stubs with a real, persisted capture flow backed by Supabase (with insert, source attribution, and timestamp). — `src/lib/leads.functions.ts`, `PENDING_SQL_COMMANDS.sql`.
- [x] 2. Add server-side email validation and IP rate limiting to the capture endpoint; confirm it runs on the edge with no Node-only dependencies. — Zod + `enforceRateLimit` (`leads.functions.ts`).
- [x] 3. Add full form states: idle, validating, pending, success, and a visible error state with retry. — `useLeadCapture` hook + `LeadCaptureModal` + inline hero form.
- [x] 4. Make the modal fully accessible: focus trap, focus restore, `Escape` to close, background scroll lock, and `aria-modal` semantics. — shadcn `Dialog` (Radix) in `LeadCaptureModal.tsx`.
- [x] 5. Add mobile/touch-aware intent triggers (scroll depth + idle timer) so the capture works beyond desktop exit intent. — `useIntentTrigger` (`src/lib/use-intent-trigger.ts`).
- [x] 6. Gate all motion and scroll-driven effects behind `prefers-reduced-motion`. — `useReducedMotion` applied to hero grid background.
- [x] 7. Replace the sticky-CTA fixed pixel threshold with a viewport/content-relative trigger. — `window.innerHeight * 1.5` in `StickyCTA`.
- [x] 8. Reserve explicit dimensions for the hero and the lazy below-fold block to eliminate layout shift; size the Suspense fallback to match. — `min-h` reservations on Hero + Suspense fallback.
- [x] 9. Optimize and correctly size all imagery (hero, OG, logos) with explicit dimensions and modern formats. — Inline SVG brand marks with fixed `width/height`; OG image left as existing `/og-image.jpg`.
- [x] 10. Prefetch the primary CTA destination on hover/viewport entry. — `router.preloadRoute({ to: '/signup' })` on hover + `IntersectionObserver` on sticky CTA.
- [x] 11. Replace placeholder logo text with real/curated social proof and add a results or testimonials band. — `LogosStrip` SVG marks + new `ResultsBand` lazy-included from `LandingBelowFold`.
- [x] 12. Fix the shared footer Privacy/Terms links to real pages (cross-cutting; tracked across this batch). — New `/privacy` and `/terms` routes wired into `PlatformShell` footer.
