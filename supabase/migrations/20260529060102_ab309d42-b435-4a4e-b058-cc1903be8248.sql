
-- =========================================================
-- Phase 1 foundations: profiles, roles, tenants, domains
-- =========================================================

-- ---------- Enums ----------
create type public.app_role as enum ('admin', 'user');
create type public.tenant_niche as enum ('retail', 'clinic', 'pharmacy');
create type public.tenant_status as enum ('pending', 'active', 'suspended');
create type public.domain_kind as enum ('subdomain', 'custom');
create type public.domain_status as enum ('pending', 'verified', 'failed');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- user_roles + has_role ----------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "user_roles_select_own"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- ---------- tenants ----------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  slug text not null unique,
  name text not null,
  niche public.tenant_niche not null default 'retail',
  status public.tenant_status not null default 'pending',
  theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$')
);

create index tenants_owner_idx on public.tenants(owner_id);
create index tenants_status_idx on public.tenants(status);

grant select, insert, update on public.tenants to authenticated;
grant select on public.tenants to anon;  -- storefronts are publicly resolvable by slug
grant all on public.tenants to service_role;

alter table public.tenants enable row level security;

-- Owners can read/update their tenant
create policy "tenants_owner_select"
  on public.tenants for select
  to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "tenants_owner_update"
  on public.tenants for update
  to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "tenants_owner_insert"
  on public.tenants for insert
  to authenticated
  with check (owner_id = auth.uid());

-- Public can read active tenants only (for storefront resolution)
create policy "tenants_public_active_select"
  on public.tenants for select
  to anon
  using (status = 'active');

-- ---------- domains ----------
create table public.domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  host text not null unique,
  kind public.domain_kind not null,
  status public.domain_status not null default 'pending',
  verification_token text not null default encode(gen_random_bytes(16), 'hex'),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index domains_tenant_idx on public.domains(tenant_id);

grant select, insert, update, delete on public.domains to authenticated;
grant select on public.domains to anon;  -- needed to resolve host -> tenant at edge
grant all on public.domains to service_role;

alter table public.domains enable row level security;

create policy "domains_owner_all"
  on public.domains for all
  to authenticated
  using (
    exists (select 1 from public.tenants t where t.id = domains.tenant_id and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
  )
  with check (
    exists (select 1 from public.tenants t where t.id = domains.tenant_id and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
  );

create policy "domains_public_verified_select"
  on public.domains for select
  to anon
  using (status = 'verified');

-- ---------- updated_at trigger ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger tenants_touch_updated_at
  before update on public.tenants
  for each row execute function public.touch_updated_at();
