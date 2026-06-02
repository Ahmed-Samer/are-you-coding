# Production Environment Requirements

An exhaustive inventory of every environment variable required to run this project 100% error-free in production. Derived from a full scan of `process.env.*` and `import.meta.env.*` reads across the codebase.

> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages.

## How configuration maps to platforms

- **Cloudflare Pages — Build env**: `VITE_*` variables are inlined at build time. They must be set as build environment variables in the Cloudflare Pages project settings.
- **Cloudflare Pages — Runtime env**: Server-only variables read via `process.env.*` (SSR / server functions / API routes). Set them as production runtime environment variables (and bound secrets) in Cloudflare Pages.
- **Supabase**: Source of the URL, publishable/anon key, and service-role key values you paste into Cloudflare. Keys are obtained from the Supabase project's API settings.

---

## Client-exposed (Vite, build-time)

Set in **Cloudflare Pages → Build environment variables**. These are bundled into the browser, so use only public keys here.

- **`VITE_SUPABASE_URL`** — Public Supabase project URL used by the browser Supabase client. *Value from Supabase project settings.*
- **`VITE_SUPABASE_ANON_KEY`** — Public anon/publishable key for the browser client; code also reads `VITE_SUPABASE_PUBLISHABLE_KEY` as an alias, so set both to the same value to be safe. *Value from Supabase project settings.*
- **`VITE_SUPABASE_PUBLISHABLE_KEY`** — Alias of the anon key referenced in client code; set to the same publishable key value. *Value from Supabase project settings.*
- **`VITE_SUPABASE_PROJECT_ID`** — Supabase project reference identifier present in the build environment. *Value from Supabase project settings.*

## Server-only (runtime)

Set in **Cloudflare Pages → Production runtime environment variables / Secrets**. Never expose these to the browser.

- **`SUPABASE_URL`** — Server-side Supabase project URL for SSR, server functions, and API routes. *Value from Supabase project settings.*
- **`SUPABASE_PUBLISHABLE_KEY`** — Server-side publishable/anon key used by the auth middleware to act as the signed-in user (RLS respected). *Value from Supabase project settings.*
- **`SUPABASE_SERVICE_ROLE_KEY`** — Service-role key for trusted server operations; **bypasses RLS**, must remain server-only. *Value from Supabase project settings.*
- **`PLATFORM_ROOT_DOMAIN`** — Apex domain used to resolve tenant subdomains and build absolute URLs (sitemap, OG tags, email links). *Configure in Cloudflare Pages.*
- **`CRON_SECRET`** — Shared secret required to authorize calls to `/api/public/cron/*` scheduled endpoints. *Configure in Cloudflare Pages.*
- **`IMPERSONATION_COOKIE_SECRET`** — Secret used to sign/verify the admin impersonation cookie. *Configure in Cloudflare Pages.*
- **`RESEND_API_KEY`** — Resend API key for sending transactional emails. *Value from Resend; configure in Cloudflare Pages.*
- **`EMAIL_FROM`** — *(Optional, has a built-in fallback)* Default "from" address for outbound emails. *Configure in Cloudflare Pages.*
- **`WHATSAPP_API_TOKEN`** — Meta WhatsApp Cloud API token used to send recovery/notification messages. *Value from Meta; configure in Cloudflare Pages.*
- **`WHATSAPP_FROM_PHONE_ID`** — WhatsApp Cloud API sender phone-number ID. *Value from Meta; configure in Cloudflare Pages.*
- **`WHATSAPP_VERIFY_TOKEN`** — Token used to verify the inbound WhatsApp webhook subscription. *Configure in Cloudflare Pages and the Meta webhook setup.*
- **`WHATSAPP_WEBHOOK_SECRET`** — Secret used to validate incoming WhatsApp webhook payloads. *Configure in Cloudflare Pages.*

---

## Summary

- Client-exposed (build-time `VITE_*`): **4**
- Server-only (runtime): **12** (11 required + `EMAIL_FROM` optional)
- **Total environment variables documented: 16** (15 strictly required for error-free production + 1 optional).

Note: `VITE_SUPABASE_ANON_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY` are two names for the same publishable key value; likewise `SUPABASE_PUBLISHABLE_KEY` mirrors the anon key on the server. Set matching values to avoid runtime "missing env" errors.
