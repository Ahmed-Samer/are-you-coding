# Audit 02 — Onboarding Wizard

## Scope

- Route: `src/routes/_authenticated/onboarding.tsx` (476 lines)
- Server fns: `listPlans`, `createAccountSubscription`,
  `getMyAccountSubscription`, `getMyPendingSubscription`,
  `cancelPendingSubscription` (all in `src/lib/billing.functions.ts`)
- Data: `plans`, `account_subscriptions`

Last round we re-wired the "Cancel and choose plan" path to call
`getMyPendingSubscription` so it could no longer nuke an active
subscription. This audit re-validates the wizard end-to-end now that
the regression is patched.

## Edge cases exercised

- Deep link `/onboarding?plan=<slug>` with monthly/quarterly mismatch
- User opens onboarding in two tabs and creates a subscription in one
- User has an active subscription → redirected to dashboard
- User has a pending subscription → interstitial shown
- Server returns `ALREADY_SUBSCRIBED`, `PLAN_NOT_AVAILABLE`,
  `PLAN_INTERVAL_MISMATCH`
- Double-click "Proceed to checkout"
- Plans query fails on first load
- Cancel-pending while another tab already advanced to checkout

## Findings

### Critical

#### C-01 — `interval` / `setInterval` shadow the global timer functions

- **Symptom:** `const [interval, setInterval] = useState<"monthly" |
  "quarterly">("monthly");` (line 79) shadows the global `setInterval`.
  Any later edit that calls `setInterval(fn, 1000)` inside this file
  silently calls the React state setter with two integer arguments,
  producing a state mutation instead of a timer and **no compile
  error** (TS sees both as valid for the union setter).
- **Root cause:** convenience naming. The variable is the billing
  cadence, not a timer; the global collision was overlooked.
- **Impact:** a hidden footgun. The next person to add e.g. a 60-second
  poll inside this file gets bizarre, silent state churn instead of a
  timer. Worth fixing now while the file is small enough to rename
  surgically.
- **Fix:** rename to `billingInterval` / `setBillingInterval`
  throughout the file (no public API change — `interval` is local
  state).
- **Verification:** `bun x tsc --noEmit` clean; existing onboarding
  test (`src/routes/_authenticated/__tests__/onboarding.test.tsx`)
  still passes.

### High

#### H-01 — `<Navigate />` returned during render causes a redirect-loop window in StrictMode

- **Symptom:** `if (hasActiveSubscription) return <Navigate to="/dashboard" />;`
  (line 227). Under React 18 StrictMode the component renders twice in
  development; rendering `<Navigate />` in a conditional return path
  enqueues two navigations. In production this is benign, but in dev it
  produces duplicate `navigate()` calls and confuses the router state
  enough that the back button silently re-enters the onboarding route.
- **Fix:** trigger the redirect inside `useEffect`
  (`navigate({ to: "/dashboard", replace: true })`) and render `null` in
  the meantime. This is the documented TanStack idiom for "I am a route
  that should never be visible to this user".
- **Verification:** StrictMode dev session — only one navigation
  recorded in the router history; back button from `/dashboard` no
  longer lands on `/onboarding`.

### Medium

#### M-01 — `onCancelPending` does not gate UI while the pending-id fetch is in flight

- The button text stays "Yes, cancel" during the round trip to
  `getMyPendingSubscription` before the cancel call fires; `busy` is
  flipped only after we get the row. Set `busy = true` immediately on
  click.

#### M-02 — Stepper labels are stale

- `STEPS` lists "Choose Plan" and "Confirm" but the screen above still
  shows a Stepper with both. Consider compressing to a single-page
  form; the second step adds nothing the first does not already show.
  Out of scope for this fix round.

### Low

- `prefilledPlan` deep-link is fully resolved on the first plans load —
  good. Document the `deepLinkResolved` ref intent inline.
- `quarterlySavingsPct("Growth")` hard-codes "Growth"; if the Pro plan
  later has a different quarterly discount, the badge will lie. Not a
  bug today; flag for plans-admin work.

## Fix manifest

- `users/fixes/src/routes/_authenticated/onboarding.tsx`

## SQL

None required.