# Screen 18 — Onboarding Confirm: Execution Plan

Reference: `road-map-users-02/18_ONBOARDING_CONFIRM_ROADMAP.md`. Scope is the wizard's commit step inside `src/routes/_authenticated/onboarding.tsx` + the server fn `createTenantAndSubscription` in `src/lib/billing.functions.ts`.

## A. UX / Confirm summary panel

- [ ] Render summary `<dl>` from the live `v3` draft with semantic groups: Store basics (name, address), Storefront (industry, template + preview thumbnail), Billing (plan name, period, price + period suffix via `formatPlanPrice` / `intervalLabel`).
- [ ] Add a per-row "Edit" affordance that jumps back to the owning step (`basics` | `template` | `plan`) without losing state.
- [ ] Replace hardcoded `.coreweb.app` and USD strings with a tiny config module `src/lib/branding.ts` exporting `STORE_DOMAIN_SUFFIX` and a `formatStoreAddress(slug)` helper; route the confirm summary + Basics step through it.
- [ ] Confirm-time client revalidation: re-run `isTemplateSelectable(draft.template)` and verify `draft.planSlug` is still in `filteredPlans` for `draft.interval`; on failure, toast and bounce to the owning step.
- [ ] Show inline busy state on the Confirm button (already present) and disable Back + Save & exit while `busy === true`.

## B. Error mapping (server → step + field)

- [ ] Define a typed server error shape: `throw new Error(JSON.stringify({ code, field?, step?, message }))` for the four create-time failures: `SLUG_TAKEN` (step=basics, field=slug), `PLAN_NOT_AVAILABLE` (step=plan), `PLAN_INTERVAL_MISMATCH` (step=plan), `TEMPLATE_NOT_AVAILABLE` (step=template).
- [ ] In `createTenantAndSubscription` replace the current free-text `throw new Error(...)` calls for those four cases with the structured payload (keep human `message` for fallback toast).
- [ ] Add a `parseCreateError(err)` helper in `onboarding.tsx` that tries `JSON.parse(err.message)`, falls back to regex on legacy strings (`/already taken/i`), and returns `{ code, step, field, message }`.
- [ ] In `onCreate`'s catch: route to `step` via `setStep(...)`, set the matching local error state (`slugStatus = "taken"` for SLUG_TAKEN; new `planError` / `templateError` states for the others), toast the human message, and scroll the offending field into view.

## C. Idempotency & double-submit

- [ ] Generate a stable `idempotencyKey` once per draft (UUID stored on the draft object, persisted in v3 — bump key to `coreweb:onboarding:draft:v4` so a fresh key is minted; clear it after a confirmed handoff).
- [ ] Extend `createTenantAndSubscription` input schema with `idempotencyKey: z.string().uuid()`. Before insert, check `tenants` for a row owned by `userId` with matching `idempotency_key`; if found, look up its `subscriptions` row and return `{ tenantId, subscriptionId, slug }` instead of inserting.
- [ ] Append SQL: add `idempotency_key uuid` to `public.tenants` + partial unique index `(owner_id, idempotency_key) where idempotency_key is not null`.
- [ ] Belt-and-braces UI guard: keep `busy` flag and ignore additional `onCreate` calls while `busy === true` (already in place — verify).

## D. Draft lifecycle (clear AFTER handoff)

- [ ] Move `localStorage.removeItem(DRAFT_KEY)` to fire only after `navigate({...})` resolves AND the next route mounts. Implementation: pass a sentinel `?from=onboarding` to the checkout route, and clear the draft inside `checkout.$subscriptionId.tsx`'s mount effect when that sentinel is present.
- [ ] On `onCreate` success, mark draft as `submitted: true` with the returned `subscriptionId` (so a retry returns the same checkout) and persist before navigating.
- [ ] If `navigate` rejects (rare), keep draft intact, show recovery toast with a manual "Continue to checkout" button using the stored `subscriptionId`.

## E. Server-side revalidation (atomic create)

- [ ] In `createTenantAndSubscription`, keep the existing plan + interval + template guards; add a wrapped insert that relies on the existing `tenants.slug` UNIQUE index — on Postgres error `23505` (unique_violation) for `tenants_slug_key`, throw structured `SLUG_TAKEN`.
- [ ] If the `tenants` insert succeeds but the `subscriptions` insert fails, delete the just-inserted tenant before bubbling the error (compensating action — true tx not available with `supabaseAdmin` REST client) so retries don't strand an orphan.

## F. Cache invalidation & checkout handoff

- [ ] Keep invalidation scoped to `["my-tenants"]` and `["my-tenants-stats"]` (already in place — verify no global `invalidateQueries()` is added).
- [ ] Confirm `navigate({ to: "/checkout/$subscriptionId", params: { subscriptionId } })` uses the server-returned id (not draft state), so an idempotent re-submit lands on the same checkout.

## G. Tests (`src/routes/_authenticated/__tests__/onboarding.test.tsx`)

- [ ] Confirm step renders all summary rows from a fully populated v3 draft including price + period suffix.
- [ ] Edit links jump back to the correct step without mutating the draft.
- [ ] `onCreate` happy path: calls server with `{ name, slug, planSlug, interval, niche, template, idempotencyKey }`, clears draft post-handoff, navigates with returned `subscriptionId`.
- [ ] SLUG_TAKEN structured error bounces to basics with `slugStatus = "taken"`.
- [ ] PLAN_INTERVAL_MISMATCH bounces to plan step with inline error.
- [ ] TEMPLATE_NOT_AVAILABLE bounces to template step with inline error.
- [ ] Double-click on Confirm fires server fn exactly once (busy guard).
- [ ] Idempotent retry: second call with same `idempotencyKey` returns existing `subscriptionId` (mocked server) without creating a duplicate.

## H. SQL to APPEND to `PENDING_SQL_COMMANDS.sql`

- [ ] Append a new "Screen 18 — Onboarding Confirm" block:
  ```sql
  alter table public.tenants
    add column if not exists idempotency_key uuid;

  create unique index if not exists tenants_owner_idem_uidx
    on public.tenants (owner_id, idempotency_key)
    where idempotency_key is not null;
  ```
- [ ] Append an audit note confirming `tenants.slug` UNIQUE index is the authoritative anti-race guard, with the idempotent re-creation snippet from Screen 15 referenced.

## I. Files touched

- [ ] `src/routes/_authenticated/onboarding.tsx` — summary panel, edit links, error mapping, idempotency key on draft, deferred draft clear, busy lockdown, branding helper usage.
- [ ] `src/lib/billing.functions.ts` — structured errors, idempotency lookup, compensating tenant delete, `idempotencyKey` in input schema.
- [ ] `src/lib/branding.ts` — new module with `STORE_DOMAIN_SUFFIX` + `formatStoreAddress`.
- [ ] `src/routes/_authenticated/checkout.$subscriptionId.tsx` — read `?from=onboarding` and clear draft on mount.
- [ ] `src/routes/_authenticated/__tests__/onboarding.test.tsx` — extended test matrix above.
- [ ] `PENDING_SQL_COMMANDS.sql` — Screen 18 block above.
- [ ] `road-map-users-02/18_ONBOARDING_CONFIRM_ROADMAP.md` — flip all actionable items to `[x]`.

## J. Out of scope (explicitly)

- No change to `listPlans`, `checkSlugAvailability`, or the `subscriptions` schema.
- No FX/currency conversion in the summary — USD is the catalog currency; EGP conversion happens at checkout (Screen 19).
- No realtime / websocket additions.

Awaiting approval to switch to EXECUTION MODE.