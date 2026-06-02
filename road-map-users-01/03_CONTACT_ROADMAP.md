# Contact — Production Roadmap

> Group 1: Marketing / Public · Screen 3 of 5
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

A contact page with a message form (name, email, company, message) plus a sidebar of direct channels (email, WhatsApp, location).

---

## 1. UX & Core Features

**Current state**
- Well-laid-out form with labeled fields, a clear primary action, a sending state, and a success toast.
- Helpful sidebar with email, WhatsApp, and location cards.

**Gaps & risks**
- **Submission is a fake delay.** The handler waits on a timer, resets the form, and shows a success toast — **no message is ever delivered or stored.** Users believe they contacted the team when they did not. This is the critical defect.
- **No real validation or error UI.** Only native required attributes exist; there is no field-level validation messaging and no failure state — a real backend error would still show "success".
- **No spam protection.** Without a honeypot/challenge and rate limiting, a live endpoint would be abused.
- **No success screen/empty state beyond a toast.** A persistent confirmation (with what-happens-next) is more reassuring than a transient toast.
- **Hardcoded contact details** (email, WhatsApp number) should be centralized/configurable rather than inline.
- **Footer Privacy/Terms links are dead** (shared-shell issue).

**World-class targets**
- Real, delivered + persisted submissions with confirmation and graceful failure handling.
- Inline, accessible field validation with clear error messaging.
- Spam resistance (honeypot + rate limit) invisible to legitimate users.
- A persistent success state and an auto-reply expectation set for the user.

---

## 2. Performance & Speed

- Minimal and fast; no heavy assets — no significant rendering bottlenecks.
- Keep the form interactive without blocking; defer any non-critical sidebar logic.
- Ensure no layout shift when validation messages appear (reserve space or animate height gracefully).

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Wire submissions to a real backend.** Use a Supabase-backed server function or a public endpoint that:
  - Validates all inputs server-side with a schema (length/format bounds on name, email, company, message).
  - Persists the message to a `contact_messages` table with timestamp and metadata.
  - Sends a notification email via the project's existing Resend integration.
- **Edge compatibility:** the entire path must use Web-standard/fetch-based APIs — no Node-only modules — so it runs on Cloudflare Workers.
- **Abuse protection:** add IP rate limiting and a honeypot; reject oversized payloads.
- **RLS & secrets:** the storage table must enforce row-level security; email/API keys stay server-side only. Never expose service credentials to the client.

---

## 4. Actionable Steps (production checklist)

1. [x] Replace the timer stub with a real submission that persists to Supabase and sends a notification email via Resend.
2. [x] Add server-side schema validation with strict length/format bounds on every field.
3. [x] Add IP rate limiting and a honeypot for spam resistance; reject oversized payloads.
4. [x] Add inline, accessible field-level validation with clear error messaging.
5. [x] Add a genuine error/failure state with retry, distinct from the success path.
6. [x] Replace the transient success toast with (or add) a persistent confirmation that sets reply expectations.
7. [x] Centralize contact details (email, WhatsApp number, location) instead of hardcoding inline.
8. [x] Confirm the submission path is fully edge-compatible (no Node-only dependencies) and the storage table has correct RLS.
9. [x] Fix the shared footer Privacy/Terms links (cross-cutting across this batch) — completed in the Landing Page phase.

---

## Production status

- Implementation lives in `src/routes/contact.tsx`, `src/lib/contact.functions.ts`, `src/lib/contact-info.ts`.
- Tests: `src/routes/__tests__/contact.test.tsx`.
- DB: append-only block in `PENDING_SQL_COMMANDS.sql` creates `public.contact_messages` (CHECK length bounds, indexes, RLS, admin-only read policy via `public.has_role`). **Run that SQL in Supabase before going live.**
- Edge runtime: server fn uses only `fetch`, `crypto.createHash`, `@tanstack/react-start/server` helpers, and `supabaseAdmin` — no Node-only modules.
- Optional env overrides: `CONTACT_INBOX`, `EMAIL_FROM`, `VITE_CONTACT_EMAIL`, `VITE_CONTACT_WHATSAPP`, `VITE_CONTACT_LOCATION`. `RESEND_API_KEY` is reused from the Landing Page leads pipeline.
