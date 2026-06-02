
-- ============ ENUMS ============
create type public.plan_interval as enum ('monthly', 'yearly');
create type public.payment_method_kind as enum ('instapay', 'vodafone_cash', 'bank_transfer');
create type public.subscription_status as enum ('pending_payment', 'active', 'expired', 'cancelled');
create type public.payment_proof_status as enum ('pending', 'approved', 'rejected');

-- ============ PLANS ============
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  price_usd numeric(10,2) not null check (price_usd >= 0),
  interval public.plan_interval not null default 'monthly',
  features jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.plans to anon, authenticated;
grant all on public.plans to service_role;
alter table public.plans enable row level security;
create policy plans_public_select on public.plans for select using (is_active = true);
create policy plans_admin_all on public.plans for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();

-- ============ PAYMENT METHODS ============
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  kind public.payment_method_kind not null,
  label text not null,
  account_identifier text not null,
  account_holder text,
  instructions text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.payment_methods to anon, authenticated;
grant all on public.payment_methods to service_role;
alter table public.payment_methods enable row level security;
create policy payment_methods_public_select on public.payment_methods for select using (is_active = true);
create policy payment_methods_admin_all on public.payment_methods for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create trigger payment_methods_touch before update on public.payment_methods
  for each row execute function public.touch_updated_at();

-- ============ FX RATES ============
create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null default 'USD',
  quote_currency text not null default 'EGP',
  rate numeric(12,4) not null check (rate > 0),
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index fx_rates_lookup_idx on public.fx_rates (base_currency, quote_currency, effective_at desc);
grant select on public.fx_rates to anon, authenticated;
grant all on public.fx_rates to service_role;
alter table public.fx_rates enable row level security;
create policy fx_rates_public_select on public.fx_rates for select using (true);
create policy fx_rates_admin_write on public.fx_rates for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ============ SUBSCRIPTIONS ============
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status public.subscription_status not null default 'pending_payment',
  currency text not null default 'USD',
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_tenant_idx on public.subscriptions (tenant_id);
grant select, insert, update on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy subscriptions_owner_select on public.subscriptions for select to authenticated
  using (exists (select 1 from public.tenants t where t.id = subscriptions.tenant_id and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))));
create policy subscriptions_owner_insert on public.subscriptions for insert to authenticated
  with check (exists (select 1 from public.tenants t where t.id = subscriptions.tenant_id and t.owner_id = auth.uid()));
create policy subscriptions_owner_update on public.subscriptions for update to authenticated
  using (exists (select 1 from public.tenants t where t.id = subscriptions.tenant_id and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))))
  with check (exists (select 1 from public.tenants t where t.id = subscriptions.tenant_id and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))));
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ============ PAYMENT PROOFS ============
create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  reference_number text not null,
  amount_usd numeric(10,2) not null check (amount_usd >= 0),
  amount_egp numeric(12,2),
  fx_rate numeric(12,4),
  screenshot_path text,
  notes text,
  status public.payment_proof_status not null default 'pending',
  reviewer_id uuid,
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_proofs_subscription_idx on public.payment_proofs (subscription_id);
create index payment_proofs_tenant_idx on public.payment_proofs (tenant_id);
create index payment_proofs_status_idx on public.payment_proofs (status);
grant select, insert, update on public.payment_proofs to authenticated;
grant all on public.payment_proofs to service_role;
alter table public.payment_proofs enable row level security;
create policy payment_proofs_owner_select on public.payment_proofs for select to authenticated
  using (exists (select 1 from public.tenants t where t.id = payment_proofs.tenant_id and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))));
create policy payment_proofs_owner_insert on public.payment_proofs for insert to authenticated
  with check (exists (select 1 from public.tenants t where t.id = payment_proofs.tenant_id and t.owner_id = auth.uid()));
create policy payment_proofs_admin_update on public.payment_proofs for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create trigger payment_proofs_touch before update on public.payment_proofs
  for each row execute function public.touch_updated_at();

-- ============ APPROVAL TRIGGER ============
create or replace function public.handle_payment_proof_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_interval public.plan_interval;
begin
  if NEW.status = 'approved' and (OLD.status is distinct from 'approved') then
    select p.interval into v_interval
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.id = NEW.subscription_id;

    update public.subscriptions
    set status = 'active',
        period_start = now(),
        period_end = case when v_interval = 'yearly' then now() + interval '1 year' else now() + interval '1 month' end,
        updated_at = now()
    where id = NEW.subscription_id;

    update public.tenants
    set status = 'active', updated_at = now()
    where id = NEW.tenant_id;

    NEW.reviewed_at := now();
  elsif NEW.status = 'rejected' and (OLD.status is distinct from 'rejected') then
    NEW.reviewed_at := now();
  end if;
  return NEW;
end;
$$;

create trigger payment_proofs_on_approval
  before update on public.payment_proofs
  for each row execute function public.handle_payment_proof_approval();

-- ============ STORAGE BUCKET ============
insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false)
  on conflict (id) do nothing;

-- Tenant owners can upload to <tenant_id>/...
create policy "payment_proofs_owner_insert_obj" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.tenants t
      where t.id::text = (storage.foldername(name))[1]
        and t.owner_id = auth.uid()
    )
  );

create policy "payment_proofs_owner_select_obj" on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      public.has_role(auth.uid(), 'admin')
      or exists (
        select 1 from public.tenants t
        where t.id::text = (storage.foldername(name))[1]
          and t.owner_id = auth.uid()
      )
    )
  );
