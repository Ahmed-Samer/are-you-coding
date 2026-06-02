-- ============================================================================
-- Landing Page — Lead capture table
-- ----------------------------------------------------------------------------
-- Run these statements in the Supabase SQL editor (or apply as a migration).
-- They create the `public.leads` table used by src/lib/leads.functions.ts.
-- ============================================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null check (source in ('exit_intent','inline_hero','sticky_cta')),
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create unique index if not exists leads_email_unique
  on public.leads (lower(email));
create index if not exists leads_created_at_idx
  on public.leads (created_at desc);
create index if not exists leads_ip_hash_created_idx
  on public.leads (ip_hash, created_at desc);

-- Data API grants. No anon grant: all writes are routed through the server
-- function with the service-role client, and admin reads use authenticated.
grant select on public.leads to authenticated;
grant all on public.leads to service_role;

alter table public.leads enable row level security;

drop policy if exists "admins read leads" on public.leads;
create policy "admins read leads"
  on public.leads for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- Contact — messages table
-- ----------------------------------------------------------------------------
-- Used by src/lib/contact.functions.ts (`submitContactMessage`). All writes
-- go through the server function with the service-role client; admins read
-- via the policy below. No anon access.
-- ============================================================================

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  message text not null,
  user_agent text,
  referrer text,
  ip_hash text,
  created_at timestamptz not null default now(),
  constraint contact_messages_name_len check (char_length(name) between 1 and 120),
  constraint contact_messages_email_len check (char_length(email) between 3 and 254),
  constraint contact_messages_company_len check (company is null or char_length(company) <= 160),
  constraint contact_messages_message_len check (char_length(message) between 10 and 4000)
);

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);
create index if not exists contact_messages_ip_hash_created_idx
  on public.contact_messages (ip_hash, created_at desc);
create index if not exists contact_messages_email_created_idx
  on public.contact_messages (lower(email), created_at desc);

grant select on public.contact_messages to authenticated;
grant all on public.contact_messages to service_role;

alter table public.contact_messages enable row level security;

drop policy if exists "admins read contact_messages" on public.contact_messages;
create policy "admins read contact_messages"
  on public.contact_messages for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- Pricing (Screen 04) — Plans table: public read access + highlight flag
-- ----------------------------------------------------------------------------
-- The plans table is the single source of truth for pricing across the
-- pricing page, onboarding, and checkout. Pricing page reads via
-- `listPlans` (server fn). Public, anonymous read access is required so the
-- /pricing route can render before sign-in. Only safe, public columns are
-- exposed; sensitive billing internals must stay off this table.
-- ============================================================================

-- Add the "highlight" flag if it does not exist. Single source of truth for
-- which tier renders as the "popular" card.
alter table public.plans
  add column if not exists highlight boolean not null default false;

-- Currency column (defaults to USD). Skip silently if already present.
alter table public.plans
  add column if not exists currency text not null default 'USD';

-- ---------------------------------------------------------------------------
-- IMPORTANT: the `plan_interval` enum ships with only ('monthly','yearly').
-- We add 'quarterly' so the quarterly tiers below can be inserted. Postgres
-- does not allow a new enum value to be USED in the same transaction it was
-- ADDED in, so run this ALTER statement ON ITS OWN first (Supabase SQL
-- editor: select just this statement and Run), then run the rest of this
-- file. `IF NOT EXISTS` makes the ALTER idempotent.
-- ---------------------------------------------------------------------------
alter type public.plan_interval add value if not exists 'quarterly';

-- Grants — pricing is public, so allow anon SELECT in addition to authenticated.
grant select on public.plans to anon, authenticated;
grant all on public.plans to service_role;

alter table public.plans enable row level security;

drop policy if exists "public read active plans" on public.plans;
create policy "public read active plans"
  on public.plans for select
  to anon, authenticated
  using (is_active = true);

-- Seed / upsert the 6 advertised tiers (Starter / Growth / Scale × monthly / quarterly).
-- Quarterly priced at ~2.7× monthly (≈10% saving vs paying monthly).
-- Growth tier is highlighted. sort_order interleaves so cards render in the
-- same Starter → Growth → Scale order regardless of interval.
insert into public.plans
  (slug, name, description, price_usd, currency, interval, features, is_active, highlight, sort_order)
values
  ('starter-monthly', 'Starter',
   'For new shops launching their first online store.',
   15, 'USD', 'monthly',
   '["Up to 50 products","Free subdomain","WhatsApp ordering","Local payment methods","Email support"]'::jsonb,
   true, false, 10),
  ('growth-monthly', 'Growth',
   'For shops with a growing catalog and steady traffic.',
   39, 'USD', 'monthly',
   '["Unlimited products","Custom domain","Analytics dashboard","Abandoned-cart recovery","Priority email support"]'::jsonb,
   true, true, 20),
  ('scale-monthly', 'Scale',
   'For multi-channel sellers and high-volume operations.',
   89, 'USD', 'monthly',
   '["Everything in Growth","Up to 10 team seats","Promo codes & campaigns","Advanced reporting","Priority WhatsApp support"]'::jsonb,
   true, false, 30),
  ('starter-quarterly', 'Starter',
   'For new shops launching their first online store.',
   40, 'USD', 'quarterly',
   '["Up to 50 products","Free subdomain","WhatsApp ordering","Local payment methods","Email support"]'::jsonb,
   true, false, 11),
  ('growth-quarterly', 'Growth',
   'For shops with a growing catalog and steady traffic.',
   105, 'USD', 'quarterly',
   '["Unlimited products","Custom domain","Analytics dashboard","Abandoned-cart recovery","Priority email support"]'::jsonb,
   true, true, 21),
  ('scale-quarterly', 'Scale',
   'For multi-channel sellers and high-volume operations.',
   240, 'USD', 'quarterly',
   '["Everything in Growth","Up to 10 team seats","Promo codes & campaigns","Advanced reporting","Priority WhatsApp support"]'::jsonb,
   true, false, 31)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    price_usd = excluded.price_usd,
    currency = excluded.currency,
    interval = excluded.interval,
    features = excluded.features,
    is_active = excluded.is_active,
    highlight = excluded.highlight,
    sort_order = excluded.sort_order;

-- ============================================================================
-- Templates (Screen 05) — FUTURE migration path (NOT FOR EXECUTION TODAY)
-- ----------------------------------------------------------------------------
-- Templates currently live in code as a static registry (src/lib/templates.ts).
-- This is intentional today: zero backend dependency, fully cacheable at the
-- edge, and the registry is also reused by the onboarding wizard.
--
-- When templates become content-managed, port the static registry to a
-- `public.templates` table read at the edge with a short TTL module cache.
-- The block below is COMMENTED OUT on purpose — uncomment + run only when
-- the migration actually happens, and mirror the type in src/lib/templates.ts.
--
-- create table if not exists public.templates (
--   slug text primary key,
--   name text not null,
--   description text not null,
--   audience text not null,
--   available boolean not null default true,
--   coming_soon_note text,
--   preview_image text,
--   preview_image_alt text,
--   og_image text,
--   sort_order int not null default 0,
--   created_at timestamptz not null default now()
-- );
--
-- grant select on public.templates to anon, authenticated;
-- grant all on public.templates to service_role;
--
-- alter table public.templates enable row level security;
--
-- drop policy if exists "public read templates" on public.templates;
-- create policy "public read templates"
--   on public.templates for select
--   to anon, authenticated
--   using (true);
-- ============================================================================
-- ============================================================================
-- Signup (Screen 07) — NO DDL REQUIRED
-- ----------------------------------------------------------------------------
-- The signup route writes nothing new to the database directly. Notes for
-- the operator configuring the Supabase project:
--
-- 1. Throttle store: the pre-signup gate and the confirmation-resend gate
--    both write to `public.auth_throttle_events`. That table already exists
--    (created with the auth-throttle infrastructure in an earlier roadmap
--    screen) and is the single source of truth for auth abuse counters.
--
-- 2. Display name: the user's full name is stored in
--    `auth.users.raw_user_meta_data->>'full_name'` via the client-side
--    supabase.auth.signUp({ options: { data: { full_name } } }) call.
--    No `profiles` table is in scope for this screen.
--
-- 3. Supabase Auth dashboard configuration (must match the client policy in
--    src/lib/password-policy.ts):
--      - Authentication → Providers → Email → Min password length: 8
--      - Authentication → Providers → Email → Password requirements:
--        lower + upper + digit + symbol
--      - Authentication → Providers → Email → Leaked password protection
--        (HIBP): ENABLED
--      - Authentication → URL Configuration → Site URL: the Cloudflare
--        production domain
--      - Authentication → URL Configuration → Redirect URLs: include
--        BOTH the production AND preview Cloudflare origins with the
--        `/auth/callback*` path so the email-confirmation link resolves.
-- ============================================================================

-- ============================================================================
-- Forgot Password (Screen 08) — NO DDL REQUIRED
-- ----------------------------------------------------------------------------
-- The forgot-password route writes nothing new to the database directly. It
-- reuses the existing `public.auth_throttle_events` table (kind =
-- 'password_reset') for per-email (3/h) and per-IP (5/h) throttling. Notes
-- for the operator configuring the Supabase project:
--
-- 1. Supabase Auth → URL Configuration:
--      - Site URL: the Cloudflare production domain.
--      - Additional Redirect URLs: must include BOTH production and preview
--        Cloudflare origins with the `/reset-password` path so the recovery
--        email link resolves correctly. Example entries:
--          https://<prod-domain>/reset-password
--          https://<preview-domain>/reset-password
--    A mismatch here is the most common cause of a broken recovery handoff
--    to Screen 09 (Reset Password).
--
-- 2. Throttle store: reuses `public.auth_throttle_events`, already created
--    in an earlier roadmap screen. No new kinds, columns, or policies.
-- ============================================================================

-- ============================================================================
-- Reset Password (Screen 09) — NO DDL REQUIRED
-- ----------------------------------------------------------------------------
-- The reset-password route writes nothing new to the database. Supabase Auth
-- owns the recovery token lifecycle end-to-end. Notes for the operator:
--
-- 1. Supabase Auth → URL Configuration (must match Screen 08):
--      - Site URL: the Cloudflare production domain.
--      - Additional Redirect URLs MUST include `/reset-password` on BOTH
--        production and preview Cloudflare origins. A mismatch breaks the
--        recovery handoff silently.
--
-- 2. Supabase Auth → Providers → Email — password policy must match
--    src/lib/password-policy.ts:
--      - Min password length: 8
--      - Password requirements: lower + upper + digit + symbol
--      - Leaked password protection (HIBP): ENABLED
--
-- 3. Supabase Auth → Email Templates → "Recovery":
--      - Token TTL defaults to 1 hour. The invalid-state copy on Screen 09
--        ("links are valid for about an hour") assumes this default. If the
--        TTL is changed in the dashboard, update the copy in
--        src/routes/reset-password.tsx to match.
-- ============================================================================

-- ============================================================================
-- Auth Callback (Screen 10) — NO DDL REQUIRED
-- ----------------------------------------------------------------------------
-- The auth-callback route writes nothing new to the database. The post-auth
-- branching decision (Dashboard vs Onboarding) is read via a server function
-- protected by `requireSupabaseAuth`, using the user's own RLS-scoped client
-- against `public.tenants` (owner_id = auth.uid()) — the same definition the
-- dashboard already uses for "my stores". No supabaseAdmin involved.
--
-- Operator configuration (Supabase dashboard):
--
-- 1. Supabase Auth → URL Configuration:
--      - Site URL: the Cloudflare production domain.
--      - Additional Redirect URLs MUST include `/auth/callback` on BOTH
--        production and preview Cloudflare origins. Example entries:
--          https://<prod-domain>/auth/callback
--          https://<preview-domain>/auth/callback
--    A mismatch here causes Supabase to reject the OAuth/email redirect and
--    leaves the user stranded with `error=redirect_uri_mismatch`.
--
-- 2. Supabase Auth → Providers → Google (and any other OAuth provider):
--      - Authorized redirect URI MUST include the Supabase project's
--        `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase
--        handles the provider hop) AND the URL Configuration whitelist
--        above must include `/auth/callback` for the final hand-off.
--
-- 3. RLS dependency: the branching read trusts RLS on `public.tenants` to
--    return only rows where `owner_id = auth.uid()`. If those policies are
--    ever loosened (e.g. broad `to anon using (true)`), the
--    Dashboard-vs-Onboarding decision becomes untrustworthy. Keep
--    `public.tenants` policies tightly scoped to `auth.uid()`.
-- ============================================================================

-- ============================================================================
-- Group 02 · Screen 11 — Invite Accept rate-limiting
-- ----------------------------------------------------------------------------
-- Backs `enforceRateLimit()` row-count windows for the `acceptTenantInvite`
-- server fn. Two windows are evaluated per request:
--   - per-IP:        max 10 attempts / 60s
--   - per-token-prefix (first 8 chars of raw token): max 5 attempts / 60s
-- Service role only — never read or written by anon/authenticated. Raw
-- invite tokens are NEVER stored; only the 8-char prefix.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invite_accept_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip           text NOT NULL,
  token_prefix text NOT NULL,
  outcome      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_accept_attempts_ip_created
  ON public.invite_accept_attempts (ip, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invite_accept_attempts_prefix_created
  ON public.invite_accept_attempts (token_prefix, created_at DESC);

GRANT ALL ON public.invite_accept_attempts TO service_role;

ALTER TABLE public.invite_accept_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role bypasses RLS, so anon/authenticated cannot
-- read or write. The `supabaseAdmin` client used by the server fn is the
-- single legitimate writer/reader.

-- ============================================================================
-- Group 02 · Screen 13 — Product Detail Drawer + SSR product page
-- ----------------------------------------------------------------------------
-- Tightens anon SELECT policies on product-related tables to guarantee that
-- only ACTIVE products of ACTIVE tenants are exposed to public visitors,
-- regardless of whether the read comes from the cached storefront catalog
-- or the single-product loader behind the new /p/<productId> route.
--
-- Each policy uses `DROP POLICY IF EXISTS` then `CREATE POLICY` so this
-- block is safe to re-run. Apply only the statements for tables whose
-- existing policy is BROADER than the active-tenant + active-product gate.
-- ============================================================================

DROP POLICY IF EXISTS "storefront_public_variant_options_read" ON public.variant_options;
CREATE POLICY "storefront_public_variant_options_read"
  ON public.variant_options FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.tenants t ON t.id = p.tenant_id
      WHERE p.id = variant_options.product_id
        AND p.is_active = TRUE
        AND t.status = 'active'
    )
  );

DROP POLICY IF EXISTS "storefront_public_variant_option_values_read" ON public.variant_option_values;
CREATE POLICY "storefront_public_variant_option_values_read"
  ON public.variant_option_values FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.variant_options o
      JOIN public.products p ON p.id = o.product_id
      JOIN public.tenants t ON t.id = p.tenant_id
      WHERE o.id = variant_option_values.option_id
        AND p.is_active = TRUE
        AND t.status = 'active'
    )
  );

DROP POLICY IF EXISTS "storefront_public_product_variants_read" ON public.product_variants;
CREATE POLICY "storefront_public_product_variants_read"
  ON public.product_variants FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.tenants t ON t.id = p.tenant_id
      WHERE p.id = product_variants.product_id
        AND p.is_active = TRUE
        AND t.status = 'active'
    )
  );

DROP POLICY IF EXISTS "storefront_public_product_variant_option_values_read" ON public.product_variant_option_values;
CREATE POLICY "storefront_public_product_variant_option_values_read"
  ON public.product_variant_option_values FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.tenants t ON t.id = p.tenant_id
      WHERE pv.id = product_variant_option_values.variant_id
        AND pv.is_active = TRUE
        AND p.is_active = TRUE
        AND t.status = 'active'
    )
  );

DROP POLICY IF EXISTS "storefront_public_product_images_read" ON public.product_images;
CREATE POLICY "storefront_public_product_images_read"
  ON public.product_images FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.tenants t ON t.id = p.tenant_id
      WHERE p.id = product_images.product_id
        AND p.is_active = TRUE
        AND t.status = 'active'
    )
  );

-- Grants — required for PostgREST to even consider the policies above.
GRANT SELECT ON public.variant_options TO anon, authenticated;
GRANT SELECT ON public.variant_option_values TO anon, authenticated;
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT SELECT ON public.product_variant_option_values TO anon, authenticated;
GRANT SELECT ON public.product_images TO anon, authenticated;
GRANT ALL ON public.variant_options TO service_role;
GRANT ALL ON public.variant_option_values TO service_role;
GRANT ALL ON public.product_variants TO service_role;
GRANT ALL ON public.product_variant_option_values TO service_role;
GRANT ALL ON public.product_images TO service_role;

-- ============================================================================
-- Screen 14 — Cart Drawer (audit only, no schema changes required)
-- ----------------------------------------------------------------------------
-- Audited 2026-06-02:
--   * abandoned_carts.attachCartContact already enforces `consent: literal(true)`
--     server-side and is rate-limited via enforceRateLimit() — no policy change.
--   * validatePromo() and createOrder() both scope every catalog/promo lookup
--     to data.tenantId and reject cross-tenant codes/products — no policy change.
--   * Cart state is client-only (localStorage); no new tables introduced.
-- If a future audit finds a gap, append a fresh, idempotent migration here.
-- ============================================================================

-- ============================================================================
-- Screen 15 — Onboarding Basics (audit only, no schema changes required)
-- ----------------------------------------------------------------------------
-- Audited 2026-06-02:
--   * public.tenants.slug already has a UNIQUE constraint — the advisory
--     checkSlugAvailability() server fn is non-authoritative; the unique
--     index closes the check-then-create race at INSERT time inside
--     createTenantAndSubscription().
--   * checkSlugAvailability() is anon-callable but uses supabaseAdmin with
--     a head-count + explicit column projection — it returns ONLY
--     { available, reason } and never any tenant fields, so it cannot leak
--     ownership data.
--   * Reserved-word list lives in src/lib/slug-rules.ts (single source of
--     truth shared by client + server). No DB table needed.
--   * Per-IP soft throttle (30/min) lives in-process inside
--     checkSlugAvailability(); no rate_limit table required.
-- If a future audit finds the unique index missing, append idempotently:
--   do $$ begin
--     if not exists (
--       select 1 from pg_indexes
--       where schemaname='public' and indexname='tenants_slug_key'
--     ) then
--       alter table public.tenants add constraint tenants_slug_key unique (slug);
--     end if;
--   end $$;
-- ============================================================================

-- ============================================================================
-- Screen 16 — Onboarding Template: persist chosen template on tenants
-- ----------------------------------------------------------------------------
-- Adds a `template` column to public.tenants, constrained to the known
-- registry slugs (src/lib/templates.ts). No new GRANTs needed — existing
-- table grants cover the new column. No RLS change.
-- ============================================================================

alter table public.tenants
  add column if not exists template text not null default 'atelier';

alter table public.tenants
  drop constraint if exists tenants_template_check;
alter table public.tenants
  add constraint tenants_template_check
  check (template in ('atelier','market','boutique','concierge'));

create index if not exists tenants_template_idx on public.tenants (template);

-- ============================================================================
-- Screen 17 — Onboarding Plan step (idempotent public-safe read on plans).
-- ----------------------------------------------------------------------------
-- The plans catalog is read by the Marketing Pricing page (Screen 04), the
-- Onboarding Plan step (Screen 17), and Checkout (Screens 19-22). All reads
-- go through the `listPlans` server function which selects only public-safe
-- columns. These GRANTs make sure the underlying SELECT works for both
-- anon (pricing/marketing) and authenticated (onboarding/checkout) roles.
-- ============================================================================

grant select on public.plans to anon;
grant select on public.plans to authenticated;

-- ============================================================================
-- Screen 18 — Onboarding Confirm: idempotency key on tenants
-- ----------------------------------------------------------------------------
-- The onboarding wizard mints a UUID per draft and forwards it to
-- createTenantAndSubscription. The server checks for an existing (owner_id,
-- idempotency_key) tuple before insert, returning the previously-created
-- tenant+subscription on a retry rather than producing a duplicate.
--
-- The authoritative anti-race for slug uniqueness remains the existing
-- tenants_slug_key UNIQUE index (audited in Screen 15). On Postgres 23505
-- the server now throws a structured SLUG_TAKEN error that the UI maps
-- back to the basics step.
-- ============================================================================

alter table public.tenants
  add column if not exists idempotency_key uuid;

create unique index if not exists tenants_owner_idem_uidx
  on public.tenants (owner_id, idempotency_key)
  where idempotency_key is not null;

-- ============================================================================
-- Screen 19 — Checkout Review: price snapshot on subscriptions
-- ----------------------------------------------------------------------------
-- The Review step compares the price the user agreed to during onboarding
-- against the live `plans.price_usd`. If admin edits the plan between
-- onboarding-confirm and review, we surface a "price changed" notice and
-- charge the live price (server is the source of truth).
--
-- `price_usd_snapshot` is populated on insert by createTenantAndSubscription
-- and never mutated afterwards.
-- ============================================================================

alter table public.subscriptions
  add column if not exists price_usd_snapshot numeric(10,2);

-- Backfill historical rows so the Review page has a snapshot to compare
-- against. Idempotent — only touches rows where the snapshot is null.
update public.subscriptions s
   set price_usd_snapshot = p.price_usd
  from public.plans p
 where s.plan_id = p.id
   and s.price_usd_snapshot is null;

-- RLS audit (no-op if already correct): tenant owners must be able to read
-- their own subscriptions regardless of status, so pre-active/cancelled
-- rows remain visible to the Checkout wizard.
drop policy if exists "subscriptions_select_owner" on public.subscriptions;
create policy "subscriptions_select_owner"
  on public.subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
       where t.id = subscriptions.tenant_id
         and t.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- Screen 20 — Checkout Bank Instructions: deterministic reference codes
--                                          + resend-email cooldown column
-- ----------------------------------------------------------------------------
-- A subscription's reference code is the public identifier the user writes
-- on their bank/wallet transfer so admins can reconcile the payment. It MUST
-- be deterministic from the subscription id (no random suffixes) so it stays
-- stable across re-reads, retries, and resends.
--
-- Algorithm (matches public.compute_subscription_reference and the TS helper
-- in src/lib/billing.functions.ts → computeReferenceCode):
--   1. Strip dashes from the UUID and uppercase it.
--   2. Take the last 8 hex chars.
--   3. Compute (sum of hex-digit values) mod 10 as the check digit.
--   4. Output: "REF-<8 hex chars>-<check digit>"
-- ----------------------------------------------------------------------------

create or replace function public.compute_subscription_reference(p_id uuid)
returns text
language plpgsql
immutable
as $$
declare
  hex     text;
  chars   text;
  s       int := 0;
  i       int;
  digit   int;
begin
  hex   := upper(replace(p_id::text, '-', ''));
  chars := right(hex, 8);
  for i in 1..length(chars) loop
    digit := position(substr(chars, i, 1) in '0123456789ABCDEF') - 1;
    s     := s + digit;
  end loop;
  return 'REF-' || chars || '-' || (s % 10)::text;
end;
$$;

alter table public.subscriptions
  add column if not exists reference_code text;

-- Backfill historical rows. Idempotent — only touches rows where the
-- reference is null.
update public.subscriptions
   set reference_code = public.compute_subscription_reference(id)
 where reference_code is null;

-- Uniqueness guard. A reference collision means two subscriptions whose
-- UUIDs share the same last 8 hex chars AND the same Luhn-style sum mod 10
-- — extremely rare, but enforce it so admin reconciliation is unambiguous.
create unique index if not exists subscriptions_reference_code_key
  on public.subscriptions(reference_code);

-- Auto-populate reference_code at insert time so application code never has
-- to round-trip a second UPDATE just to capture the id-derived value.
create or replace function public.set_subscription_reference()
returns trigger
language plpgsql
as $$
begin
  if new.reference_code is null then
    new.reference_code := public.compute_subscription_reference(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_set_reference on public.subscriptions;
create trigger subscriptions_set_reference
  before insert on public.subscriptions
  for each row execute function public.set_subscription_reference();

-- "Resend instructions to my email" cooldown timestamp. Used by the
-- resendBankInstructionsEmail server function to enforce a per-subscription
-- rate limit (default 60s) so a refresh-loop can't fan out into an email
-- storm.
alter table public.subscriptions
  add column if not exists instructions_email_sent_at timestamptz;

-- ============================================================================
-- Group 03 · Screen 21 — Checkout Upload Proof
-- ----------------------------------------------------------------------------
-- Adds the 'pending_review' value to the subscription_status enum so the
-- finalizeProofUpload server fn can atomically advance a subscription from
-- 'pending_payment' once a proof has been persisted + MIME-sniffed.
-- Postgres requires the ALTER TYPE to commit BEFORE the new value can be
-- USED; run this statement on its own first, then the rest of the block.
-- ============================================================================

alter type public.subscription_status add value if not exists 'pending_review';

-- The Storage bucket `payment-proofs` and its tenant-scoped RLS policies
-- (insert/select keyed on `(storage.foldername(name))[1] = tenants.id`)
-- ship with migration 20260529061839. No bucket-policy changes required
-- here — the server-minted signed-upload-URL flow writes to the same
-- `{tenant_id}/{subscription_id}/proof-<ts>.<ext>` path convention.

-- ----------------------------------------------------------------------------
-- Operator note (no DDL): audit_log entries for proof submission are written
-- by src/lib/checkout-proof.functions.ts via writeAuditLog with
--   action      = 'proof.submitted'
--   target_table = 'payment_proofs'
--   diff        = { storage_path, mime, byte_size, sha256, amount_usd, ... }
-- which uses the existing public.audit_logs table created in the admin
-- foundation migration. No new audit columns are required.
