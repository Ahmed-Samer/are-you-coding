# Audit 01 — Checkout: Upload Proof (Screen 21)

## Scope

- Route: `src/routes/_authenticated/checkout.$subscriptionId.tsx` (1012 lines)
- Component: `src/components/checkout/UploadProofStep.tsx` (508 lines)
- Server fns: `src/lib/checkout-proof.functions.ts`,
  `src/lib/checkout-proof.server.ts`
- Data: `account_subscriptions`, `payment_proofs`, `payment_methods`,
  `fx_rates`, Storage bucket `payment-proofs`.

Screen 21 was rebuilt last round to use signed-URL direct uploads with a
server-side magic-byte MIME sniff. The Bank Instructions screen (20) and
the Pending Approval screen (22) live in the same route file. The audit
covers all four checkout sub-steps because they share state.

## Edge cases exercised

- Slow network with `await preprocessImage` and signed-URL minting
- Double-submit (Enter held, double-click on "Send for review")
- Mid-flow tab switch + return (window focus refetch)
- Hard refresh while a pending proof exists
- Proof gets rejected by admin while the page is open
- Subscription is cancelled via the kill-switch trigger while user is on
  the page
- SSR path (the route is under `_authenticated/` which is `ssr: false`,
  so this is mostly N/A, but `ManualCopyField` is still risky if reused)
- Safari iOS clipboard (no `navigator.clipboard` outside secure context)
- Storage Quota / private-browsing (impacts shared cart state, not proof)
- Resend-instructions email rate limit

## Findings

### Critical

#### C-01 — Dead legacy upload path is still wired through state but unreachable from UI

- **Symptom:** the parent route declares `submit`, `setBusy`, `file`,
  `uploading`, `confirmSubmit`, an `onSubmitProof` async function (lines
  ~401-450) and a `ConfirmDialog` for "Submit this proof for review?"
  (line 636). After the Screen 21 rewrite, the JSX renders
  `<UploadProofStep …/>` (line 897) which has its own internal submit
  pipeline. Nothing opens `confirmSubmit` and nothing calls
  `onSubmitProof` anymore.
- **Root cause:** incomplete cleanup of the previous direct-upload
  implementation. The legacy `submit` (`submitPaymentProof`) and the
  direct `supabase.storage.from("payment-proofs").upload(...)` call
  remain reachable through the imported server fn and the browser
  Supabase client. Any future code that flips this dialog open would
  bypass the server-side magic-byte sniff and double-write a proof row.
- **Impact:** medium-term ticking time-bomb. Today: bundle bloat + reader
  confusion. Tomorrow: a regression that re-uses these helpers ships a
  proof flow that silently bypasses the MIME-safety net added in Screen
  21.
- **Fix:** delete `submit`, `onSubmitProof`, `confirmSubmit` state and
  its dialog, the parent's `file` / `uploading` state, and the
  unreachable direct `supabase.storage.upload(...)`. Drop the unused
  imports (`Upload`, `X`, `supabase`, `submitPaymentProof`).
- **Verification:** `bun run lint` reports no unused-symbol warnings;
  `bun x tsc --noEmit` is clean; the upload flow is exercised by an
  end-to-end submission (route still transitions to `pending`).

#### C-02 — `ManualCopyField` reads `navigator.platform` unguarded

- **Symptom:** `navigator.platform.toLowerCase().includes("mac")` at line
  129 throws `Cannot read properties of undefined (reading 'toLowerCase')`
  if `navigator.platform` is removed by a future browser (it is already
  deprecated and reduced to a frozen string in Firefox), and crashes the
  whole checkout if the component is ever rendered during SSR.
- **Root cause:** `_authenticated` is `ssr: false` today, so the bug is
  latent; but the component is exported and could be reused under SSR.
  `navigator.platform` is on every browser-vendor deprecation list and
  is the wrong source for OS detection.
- **Impact:** silent crash on SSR refactor + slow degradation as browsers
  start returning empty strings or `undefined` for `navigator.platform`.
- **Fix:** compute `isMac` once with a SSR-safe guard
  (`typeof navigator !== "undefined" && (navigator.userAgent || navigator.platform || "")
  .toLowerCase().includes("mac")`) and inline it. The component remains
  ergonomic but never crashes.
- **Verification:** unit-render `ManualCopyField` with `navigator`
  stubbed to `{}` — no throw, displays the Ctrl-C hint by default.

### High

#### H-01 — Redundant `focus` listener double-refetches the checkout

- **Symptom:** `useEffect` at line 343 adds a manual `window` `focus`
  listener that calls `refetchCheckout()`, but the underlying
  `useQuery` already enables `refetchOnWindowFocus` (TanStack Query
  default `true`). Every tab return fires the query twice.
- **Impact:** noticeable extra latency, redundant 401-spam if the user
  signed out in another tab, doubled cost on `getCheckoutContext`.
- **Fix:** drop the manual listener. Rely on the Query default.
- **Verification:** open DevTools → Network, blur and refocus the tab —
  only one `getCheckoutContext` round trip per focus event.

#### H-02 — Auto-jumping to "proof" on rejection clobbers user's in-progress instructions step

- **Symptom:** the `useEffect [sub]` calls `setStep("proof")` the moment
  it sees the latest proof transitioned to `rejected`. If the user is
  already typing a new reference number on the "instructions" step (e.g.
  they came back to fix a typo), they are yanked forward without
  warning.
- **Fix:** keep the toast (telling them the proof was rejected) but only
  set the step if the user is currently on `pending`. From any other
  step we trust the user's intent and just refresh the badge in place.
- **Verification:** simulate by manually updating
  `payment_proofs.status` to `rejected` while sitting on the
  "instructions" step — toast fires, step does not change.

### Medium

#### M-01 — `proofs[0]` assumed to be the newest

- The route reads "latest proof" as `proofs[0]`. Order is guaranteed by
  the server fn (`getCheckoutContext` already does
  `order("created_at", { ascending: false })` per the existing
  contract). Not actionable here, but worth a defensive sort if that
  contract is ever loosened.

#### M-02 — `refetchInterval` polls every 15 s even after `pending_review`

- The poll only stops when `status === "active"`. If the admin rejects
  the proof, the row stays `pending_payment` and the poll keeps running
  forever. Acceptable today (the route only mounts while the user is
  here), flagged for the dunning epic.

### Low

- `goTo` is a one-line wrapper around `setStep`; remove for clarity.
- `lastProofStatusRef` updates are correct but the variable shadowing
  inside the effect (a local `latestProof` shadowing the outer one) is
  a readability nit.

## Fix manifest

- `users/fixes/src/routes/_authenticated/checkout.$subscriptionId.tsx`
- `users/fixes/src/components/checkout/UploadProofStep.tsx` — **no
  changes**; the component is already production-grade. Included in
  `fixes/` is omitted to make the diff obvious.

## SQL

None required. The kill-switch and FK re-point from the previous round
remain in effect; this audit does not touch the schema.