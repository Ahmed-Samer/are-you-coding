# Onboarding — Basics — Production Roadmap

> Phase 02: Storefront & Onboarding Funnel · Screen 15 of 18 (Wizard step 1 of 4)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

Step 1 of the store-creation wizard: store name, web address (slug), and industry/niche. This is where the store's identity — and its permanent subdomain — is chosen, making slug correctness the single most important validation in the funnel.

---

## 1. UX & Core Features

**Current state**
- The whole wizard persists a draft to localStorage, so a reload at any step restores name, slug, niche, template, plan, interval, and current step.
- Slug auto-derives from the store name (slugified) until the user manually edits it, after which it stays user-controlled.
- Inline format hint shows the live `slug.coreweb.app` address and a format error when the pattern fails.
- Niche options render with availability ("soon") states.

**Gaps & risks**
- **Critical: no real-time slug availability check against Supabase.** The slug is only validated against a client-side regex. Uniqueness is enforced only at the final create step, so a user can complete all four steps before discovering their address is taken — a poor, late failure.
- **No reserved-word / blocklist check** client-side (e.g. `app`, `www`, `admin`) — these are rejected by the resolver but not surfaced here.
- **Niche is mostly placeholders** — only one option is truly available, so the selector mostly advertises features that don't exist yet.
- **Draft trust**: the draft is read from localStorage and `JSON.parse`d without shape validation — a corrupted/old draft could crash or carry stale fields.
- No focus management when advancing/returning between steps.

**World-class targets**
- Debounced, edge-safe slug availability lookup with clear available/taken/checking/reserved states inline.
- Reserved-word and format validation surfaced at the point of entry.
- Schema-validated draft hydration that safely discards corrupt/stale drafts.
- Niche options honestly reflecting what's launchable.

---

## 2. Performance & Speed

- **Debounce the availability lookup** (e.g. ~300–500ms after typing stops) and cancel in-flight checks on new input to avoid request floods.
- Cache availability results per slug for the session so re-typing a previously checked slug is instant.
- Keep the wizard a single code-split route; plans data is fetched once and reused across steps (it is) — avoid refetching per step.
- The draft-persist effect writes on every keystroke; debounce the localStorage write to reduce churn.

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Add a dedicated, public-safe slug-availability server function/route** that checks the tenants table (and reserved list) and returns only a boolean + reason — never tenant details. Must be edge-safe (anon-key read, no Node-only deps).
- **Rate-limit the availability endpoint** to prevent enumeration of taken slugs at scale.
- **Availability is advisory, not authoritative** — the final create must still enforce uniqueness atomically (unique constraint) to close the check-then-create race; the UI check only improves UX.
- Validate slug format and reserved words identically on client and server (single shared rule) so behavior matches the tenant resolver's expectations.

---

## 4. Actionable Steps (production checklist)

1. Add a debounced, edge-safe slug-availability check with inline available/taken/checking/reserved states.
2. Surface reserved-word and format errors at entry, mirroring the tenant resolver's rules.
3. Schema-validate the localStorage draft on hydration and discard corrupt/stale drafts safely.
4. Rate-limit the availability endpoint and return only a boolean + reason (no tenant data).
5. Keep final-create uniqueness atomic (unique constraint) so the availability check stays advisory.
6. Debounce the draft-persist write to reduce per-keystroke localStorage churn.
7. Cache per-slug availability results for the session.
8. Align niche options with genuinely launchable industries (or clearly gate "soon" ones).
9. Add focus management when moving between wizard steps.

---

## Status

Implemented 2026-06-02. All 9 actionable steps complete.

- [x] **1. Debounced edge-safe slug availability check** — new `checkSlugAvailability` server fn in `src/lib/onboarding.functions.ts` + 350 ms debounce + cancelable seq guard in `onboarding.tsx`; inline available/taken/checking/reserved states rendered under the slug input.
- [x] **2. Reserved-word and format errors at entry** — `src/lib/slug-rules.ts` (`validateSlug`) runs client-side before any network request and is reused server-side, mirroring the tenant resolver's reserved subdomains.
- [x] **3. Schema-validated draft hydration** — `draftSchema` (zod) + versioned `DRAFT_KEY = coreweb:onboarding:draft:v2`; corrupt or stale drafts are dropped silently.
- [x] **4. Rate-limited availability endpoint, boolean+reason only** — per-IP in-process throttle (30/60s) inside `checkSlugAvailability`; response shape is `{ slug, available, reason }`, never any tenant fields.
- [x] **5. Final-create uniqueness stays atomic** — `tenants.slug` UNIQUE constraint preserved; SQL audit note appended to `PENDING_SQL_COMMANDS.sql`; UI falls back to the basics step if the create call reports "already taken".
- [x] **6. Debounced draft-persist write** — 400 ms timer + flush-on-unmount and flush-on-save-exit.
- [x] **7. Per-slug session cache** — `availabilityCache` ref keyed by slug; re-typing a previously checked slug is instant.
- [x] **8. Niche options honesty** — only `retail` is enabled; the other cards keep `disabled`/`aria-disabled` with a "Available next release" tooltip and never map to a fake DB enum value.
- [x] **9. Focus management between wizard steps** — refs for each step's first interactive element (`name`, first template card, first plan card, confirm CTA) focused on `draft.step` change.
