-- =====================================================================
-- Sprint 3.1 — Tenant Billing Management
--   * billing_adjustments  (immutable financial ledger)
--   * invoice_number_seq + invoices table
--   * tenant_credits view
--   * payment_proofs.refunded_at column
--   * invoices storage bucket + RLS
-- =====================================================================

-- ---------- 1. payment_proofs.refunded_at ----------
alter table public.payment_proofs
  add column if not exists refunded_at timestamptz;

-- ---------- 2. invoice number sequence ----------
create sequence if not exists public.invoice_number_seq
  start with 1
  increment by 1
  minvalue 1
  no cycle;

grant usage, select on sequence public.invoice_number_seq to service_role;

-- ---------- 3. billing_adjustments (immutable ledger) ----------
create table if not exists public.billing_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  kind text not null check (kind in (
    'refund','credit_grant','credit_consumed',
    'comp_extension','plan_change','manual_extension'
  )),
  amount_usd numeric(12,2),
  period_delta_days integer,
  from_plan_id uuid references public.plans(id),
  to_plan_id uuid references public.plans(id),
  reason text not null check (length(reason) >= 1),
  external_reference text,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists billing_adjustments_tenant_idx
  on public.billing_adjustments(tenant_id, created_at desc);
create index if not exists billing_adjustments_subscription_idx
  on public.billing_adjustments(subscription_id);
create index if not exists billing_adjustments_kind_idx
  on public.billing_adjustments(kind);

-- Append-only at the grant level. RLS still enabled as defence-in-depth.
revoke all on public.billing_adjustments from anon, authenticated;
grant select, insert on public.billing_adjustments to service_role;

alter table public.billing_adjustments enable row level security;
-- No policies for anon/authenticated → all access funneled through service_role.

-- ---------- 4. tenant_credits view ----------
create or replace view public.tenant_credits as
select
  tenant_id,
  coalesce(sum(amount_usd), 0)::numeric(12,2) as balance_usd
from public.billing_adjustments
where kind in ('credit_grant','credit_consumed')
group by tenant_id;

grant select on public.tenant_credits to service_role;

-- ---------- 5. invoices table ----------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null unique references public.payment_proofs(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  invoice_number text not null unique,
  storage_path text not null,
  total_usd numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists invoices_tenant_idx
  on public.invoices(tenant_id, created_at desc);

grant select on public.invoices to authenticated;
grant all on public.invoices to service_role;

alter table public.invoices enable row level security;

-- Tenants can read their own invoices (owner OR member via tenant_members).
drop policy if exists "Tenant members read own invoices" on public.invoices;
create policy "Tenant members read own invoices"
  on public.invoices for select to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = invoices.tenant_id
        and t.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = invoices.tenant_id
        and tm.user_id = auth.uid()
    )
  );

-- ---------- 6. invoices storage bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Tenant owners (and members) can read PDFs under tenants/{tenant_id}/...
drop policy if exists "Tenant members read own invoice pdfs" on storage.objects;
create policy "Tenant members read own invoice pdfs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = 'tenants'
    and (
      exists (
        select 1 from public.tenants t
        where t.id::text = (storage.foldername(name))[2]
          and t.owner_id = auth.uid()
      )
      or exists (
        select 1 from public.tenant_members tm
        where tm.tenant_id::text = (storage.foldername(name))[2]
          and tm.user_id = auth.uid()
      )
    )
  );
-- Writes go through service_role (admin server fns); no insert policy needed.

-- ---------- 7. RPC for invoice number allocation ----------
create or replace function public.next_invoice_number()
returns bigint
language sql
security definer
set search_path = public
as $$
  select nextval('public.invoice_number_seq');
$$;

revoke all on function public.next_invoice_number() from public, anon, authenticated;
grant execute on function public.next_invoice_number() to service_role;
