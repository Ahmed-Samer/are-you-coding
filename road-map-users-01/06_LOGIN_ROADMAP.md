# Login — Production Roadmap

> Group 2: Authentication · Screen 6 of 33 (Auth batch 1 of 5)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

The primary sign-in surface. Combines password sign-in, Google OAuth handoff, a two-factor (AAL2) challenge step, a failed-attempt cooldown, and a confirmation-email resend affordance.

> **Audit this screen as part of one lifecycle, not in isolation.** Login is the hub that the other four auth screens route into and out of. See the shared lifecycle in screen 10's roadmap.

---

## 1. UX & Core Features

**Current state**
- Clean single-column form with email/password, inline field errors, and a clear primary action.
- Google OAuth as a secondary path, with a visual divider.
- A dedicated MFA challenge view replaces the form when AAL2 is required (6-digit code, verify/cancel).
- A visible cooldown banner after repeated failures and a "resend confirmation email" affordance when sign-in fails on an unconfirmed account.
- Links out to Forgot Password (screen 8) and Signup (screen 7).

**Gaps & risks**
- **Inconsistent focus management.** The MFA step auto-focuses its input, but the main form does not auto-focus email on mount, and neither view is a true focus-trap. Switching between the form and the MFA view does not announce the context change to assistive tech.
- **Errors are toast-only.** Validation and auth failures surface as transient toasts rather than a persistent, accessible live region tied to the form — screen-reader users may miss them entirely.
- **Cooldown is per-tab and resettable.** The visible countdown lives in component state, so a page reload or a second tab clears it. The real protection is the server throttle; the UI implies a stronger guarantee than it provides.
- **Resend affordance is fragile.** It only appears when the error text happens to match a "confirm" pattern, so confirmation problems phrased differently never expose the resend button.
- **MFA cancel signs the user out silently.** Cancelling the challenge calls sign-out and drops back, which can be confusing without an explicit explanation.

**World-class targets**
- Auto-focus the first field; trap focus within each view; announce view transitions (form ↔ MFA) via an accessible live region.
- Persistent, accessible inline error summary in addition to (or instead of) toasts.
- A cooldown that reflects the server's authoritative throttle state, not just local component state.
- Deterministic detection of unconfirmed-account state to reliably surface resend.

---

## 2. Performance & Speed

- Keep the auth route bundle lean: the MFA challenge UI, OAuth handoff, and throttle wrappers should not bloat the critical sign-in path. Defer/lazy-load anything not needed for first paint of the form.
- Avoid layout shift when the cooldown banner, resend banner, and inline errors appear — reserve space or animate height so the primary button does not jump.
- The shared shell should not pull heavy marketing-only chunks into the auth route.

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Throttle authority must live server-side.** The pre-login gate and failure recording are the real controls; the client cooldown is cosmetic. Ensure the gate is consulted before every attempt and that its decision (including remaining time) can drive the UI.
- **Revalidate identity, do not trust cached session.** Post-login navigation should rely on a server-validated user, not a cached session read, so the redirect target is trustworthy under SSR/edge.
- **Edge runtime compliance.** All auth calls must be Web-standard/fetch-based (no Node-only modules) so they run on Cloudflare Workers. Cookies/session handling must survive the edge routing boundary.
- **Secrets stay server-side.** Service credentials and throttle internals never reach the client; only the publishable key is exposed.

---

## 4. Interconnection (cross-screen lifecycle)

- **Inbound:** receives users from Signup (screen 7) after account creation, and from the Forgot/Reset flow once a password is changed.
- **Redirect param:** must faithfully forward the `redirect` search param so users land where they intended after sign-in; an already-authenticated visitor is bounced straight to that target.
- **Google path:** hands off to Auth Callback (screen 10) with a `next` target — the callback, not Login, finalizes the session and decides the landing page.
- **Outbound links:** "Forgot?" → screen 8; "Create an account" → screen 7 (param continuity must be preserved across that hop).

---

## 5. Actionable Steps (production checklist)

- [x] Auto-focus the email field on mount and the code field in the MFA view; implement a focus-trap for both views.
- [x] Add an accessible, persistent inline error region (live region) alongside toasts for validation and auth failures.
- [x] Drive the cooldown UI from the server throttle's authoritative remaining-time, so reloads/second tabs can't bypass the displayed limit.
- [x] Make unconfirmed-account detection deterministic (not string-matching) so the resend affordance always appears when relevant.
- [x] Announce form ↔ MFA transitions and clarify what "Cancel" does (it signs you out).
- [x] Ensure post-login navigation uses a revalidated user identity, not a cached session, before redirecting.
- [x] Preserve the `redirect` param on every outbound link (to Signup, Forgot) and through the Google/callback handoff.
- [x] Reserve layout space for cooldown/resend/error banners to eliminate layout shift.
- [x] Confirm the entire sign-in path is edge-compatible (no Node-only dependencies) and session cookies survive Cloudflare routing.
