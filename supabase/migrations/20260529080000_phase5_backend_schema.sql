-- ============================================================
-- Phase 5: Backend schema — audit, analytics, webhooks,
--          domain verification, email outbox, feature flags,
--          error reports
-- Run this in the Supabase SQL Editor.
--
-- Prerequisites (already applied):
--   - Phase 1..4 migrations
--   - public.has_role(uuid, app_role) SECURITY DEFINER fn
--   - public.is_tenant_owner(uuid, uuid) SECURITY DEFINER fn
--   - public.touch_updated_at() trigger fn
--   - public.app_role enum with at least 'admin'
-- ============================================================

-- ------------------------------------------------------------
-- 0. Shared helpers
-- ------------------------------------------------------------

-- Re-create touch_updated_at defensively (no-op if it already exists with
-- the same body). Safe to run multiple times.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 1. audit_logs — every admin / high-risk mutation
-- ============================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  target_table text,
  target_id uuid,
  diff jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_idx
  on public.audit_logs(actor_id, created_at desc);
create index if not exists audit_logs_target_idx
  on public.audit_logs(target_table, target_id);
create index if not exists audit_logs_created_idx
  on public.audit_logs(created_at desc);

grant select on public.audit_logs to authenticated; -- gated by RLS to admins
grant all    on public.audit_logs to service_role;

alter table public.audit_logs enable row level security;

create policy "Admins read audit_logs"
  on public.audit_logs for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Writes happen exclusively from server fns via service_role; no INSERT
-- policy is granted to anon/authenticated.

-- ============================================================
-- 2. analytics_events — storefront analytics
-- ============================================================
do $$ begin
  create type public.analytics_event_type as enum (
    'page_view',
    'product_view',
    'add_to_cart',
    'checkout_start',
    'order_placed'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.analytics_events (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type public.analytics_event_type not null,
  session_id text,
  product_id uuid references public.products(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_tenant_created_idx
  on public.analytics_events(tenant_id, created_at desc);
create index if not exists analytics_events_tenant_type_created_idx
  on public.analytics_events(tenant_id, event_type, created_at desc);
create index if not exists analytics_events_product_idx
  on public.analytics_events(product_id);

grant select on public.analytics_events to authenticated;
grant all    on public.analytics_events to service_role;

alter table public.analytics_events enable row level security;

create policy "Tenant owner reads own analytics"
  on public.analytics_events for select to authenticated
  using (public.is_tenant_owner(tenant_id, auth.uid()));

create policy "Admins read all analytics"
  on public.analytics_events for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Inserts are performed by a rate-limited public server fn using
-- supabaseAdmin; no anon/authenticated insert policy is granted.

-- ============================================================
-- 3. whatsapp_webhook_events — raw inbound webhook payloads
-- ============================================================
create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  signature text,
  verified boolean not null default false,
  tenant_id uuid references public.tenants(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_webhook_events_created_idx
  on public.whatsapp_webhook_events(created_at desc);
create index if not exists whatsapp_webhook_events_tenant_idx
  on public.whatsapp_webhook_events(tenant_id, created_at desc);
create index if not exists whatsapp_webhook_events_unprocessed_idx
  on public.whatsapp_webhook_events(created_at)
  where processed_at is null;

grant select on public.whatsapp_webhook_events to authenticated;
grant all    on public.whatsapp_webhook_events to service_role;

alter table public.whatsapp_webhook_events enable row level security;

create policy "Admins read webhook events"
  on public.whatsapp_webhook_events for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Inserts happen from the verified public route handler via supabaseAdmin.

-- ============================================================
-- 4. domain_verification_attempts — TXT/CNAME lookup history
-- ============================================================
create table if not exists public.domain_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.domains(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  record_type text not null check (record_type in ('TXT','CNAME','A','AAAA')),
  expected text,
  found text,
  success boolean not null default false,
  error text
);

create index if not exists dva_domain_attempted_idx
  on public.domain_verification_attempts(domain_id, attempted_at desc);

grant select on public.domain_verification_attempts to authenticated;
grant all    on public.domain_verification_attempts to service_role;

alter table public.domain_verification_attempts enable row level security;

create policy "Tenant owner reads own verification attempts"
  on public.domain_verification_attempts for select to authenticated
  using (
    exists (
      select 1 from public.domains d
      where d.id = domain_verification_attempts.domain_id
        and public.is_tenant_owner(d.tenant_id, auth.uid())
    )
  );

create policy "Admins read all verification attempts"
  on public.domain_verification_attempts for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Inserts performed by server fns using service_role.

-- ============================================================
-- 5. email_outbox — transactional email queue
-- ============================================================
do $$ begin
  create type public.email_status as enum ('queued','sent','failed');
exception when duplicate_object then null; end $$;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.email_status not null default 'queued',
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists email_outbox_status_idx
  on public.email_outbox(status, created_at);
create index if not exists email_outbox_queued_idx
  on public.email_outbox(created_at)
  where status = 'queued';

grant select on public.email_outbox to authenticated;
grant all    on public.email_outbox to service_role;

alter table public.email_outbox enable row level security;

create policy "Admins read email outbox"
  on public.email_outbox for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Inserts/updates exclusively by service_role from server fns.

-- ============================================================
-- 6. feature_flags — Admin → Flags UI
-- ============================================================
create table if not exists public.feature_flags (
  key text primary key,
  description text,
  enabled boolean not null default false,
  rollout_percent int not null default 0
    check (rollout_percent between 0 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists feature_flags_enabled_idx
  on public.feature_flags(enabled);

grant select on public.feature_flags to anon, authenticated;
grant all    on public.feature_flags to service_role;

alter table public.feature_flags enable row level security;

create policy "Anyone reads feature flags"
  on public.feature_flags for select to anon, authenticated
  using (true);

create policy "Admins write feature flags"
  on public.feature_flags for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists feature_flags_touch on public.feature_flags;
create trigger feature_flags_touch
  before update on public.feature_flags
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 7. error_reports — client + server error sink
-- ============================================================
do $$ begin
  create type public.error_scope as enum ('client','server');
exception when duplicate_object then null; end $$;

create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  scope public.error_scope not null,
  route text,
  message text not null,
  stack text,
  user_id uuid references auth.users(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists error_reports_created_idx
  on public.error_reports(created_at desc);
create index if not exists error_reports_scope_created_idx
  on public.error_reports(scope, created_at desc);
create index if not exists error_reports_user_idx
  on public.error_reports(user_id, created_at desc);
create index if not exists error_reports_tenant_idx
  on public.error_reports(tenant_id, created_at desc);

grant select on public.error_reports to authenticated;
grant all    on public.error_reports to service_role;

alter table public.error_reports enable row level security;

create policy "Admins read error reports"
  on public.error_reports for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Inserts performed by a rate-limited authenticated server fn that uses
-- service_role; no direct authenticated INSERT policy is granted.

-- ============================================================
-- 8. Backfill GRANTs audit (defensive re-grants on existing tables)
-- ============================================================
-- These are idempotent; they ensure no prior migration drift left any
-- public-schema table without the standard authenticated/service_role
-- grants required for the Data API and server fns.

grant select, insert, update, delete on public.tenants            to authenticated;
grant select, insert, update, delete on public.subscriptions      to authenticated;
grant select, insert, update, delete on public.payment_proofs     to authenticated;
grant select, insert, update, delete on public.domains            to authenticated;
grant select, insert, update, delete on public.categories         to authenticated;
grant select, insert, update, delete on public.products           to authenticated;
grant select, insert, update, delete on public.orders             to authenticated;
grant select                          on public.plans             to anon, authenticated;
grant select                          on public.payment_methods   to anon, authenticated;
grant select                          on public.fx_rates          to anon, authenticated;
grant select                          on public.user_roles        to authenticated;

grant all on public.tenants          to service_role;
grant all on public.subscriptions    to service_role;
grant all on public.payment_proofs   to service_role;
grant all on public.domains          to service_role;
grant all on public.categories       to service_role;
grant all on public.products         to service_role;
grant all on public.orders           to service_role;
grant all on public.plans            to service_role;
grant all on public.payment_methods  to service_role;
grant all on public.fx_rates         to service_role;
grant all on public.user_roles       to service_role;

-- ============================================================
-- Done. After running, regenerate src/integrations/supabase/types.ts.
-- ============================================================
