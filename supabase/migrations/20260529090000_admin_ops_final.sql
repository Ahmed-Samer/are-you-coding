-- Phase 5 admin ops: error_reports.resolved + email_templates registry

alter table public.error_reports
  add column if not exists resolved boolean not null default false,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

create index if not exists error_reports_resolved_idx
  on public.error_reports(resolved, created_at desc);

create table if not exists public.email_templates (
  key text primary key,
  subject text not null,
  body_html text not null,
  body_text text,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant select on public.email_templates to authenticated;
grant all    on public.email_templates to service_role;

alter table public.email_templates enable row level security;

create policy "Admins read email templates"
  on public.email_templates for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins write email templates"
  on public.email_templates for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists email_templates_touch on public.email_templates;
create trigger email_templates_touch
  before update on public.email_templates
  for each row execute function public.touch_updated_at();
