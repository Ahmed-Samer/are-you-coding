-- =====================================================================
-- Admin Analytics RPCs
-- Cohort retention + platform funnel aggregations exposed as SECURITY
-- DEFINER functions. Every call re-checks public.has_role(auth.uid(),'admin')
-- so they are safe to grant to `authenticated` and call from the app
-- with the user's bearer token.
-- =====================================================================

create or replace function public.admin_tenant_cohort_retention(p_weeks int default 12)
returns table (
  cohort_week  date,
  cohort_size  int,
  week_offset  int,
  active_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin only';
  end if;

  if p_weeks is null or p_weeks < 1 or p_weeks > 52 then
    p_weeks := 12;
  end if;

  return query
  with bounds as (
    select date_trunc('week', now())::date as current_week,
           (date_trunc('week', now()) - make_interval(weeks => p_weeks - 1))::date as first_week
  ),
  tenant_cohorts as (
    select t.id,
           date_trunc('week', t.created_at)::date as cohort_week
    from public.tenants t, bounds b
    where t.created_at >= b.first_week
  ),
  cohort_sizes as (
    select cohort_week, count(*)::int as cohort_size
    from tenant_cohorts
    group by cohort_week
  ),
  activity as (
    select tc.id as tenant_id,
           tc.cohort_week,
           date_trunc('week', ae.created_at)::date as activity_week
    from tenant_cohorts tc
    join public.analytics_events ae on ae.tenant_id = tc.id
    union
    select tc.id as tenant_id,
           tc.cohort_week,
           date_trunc('week', o.created_at)::date as activity_week
    from tenant_cohorts tc
    join public.orders o on o.tenant_id = tc.id
  ),
  per_cell as (
    select cohort_week,
           ((activity_week - cohort_week) / 7)::int as week_offset,
           count(distinct tenant_id)::int as active_count
    from activity
    where activity_week >= cohort_week
    group by cohort_week, week_offset
  )
  select cs.cohort_week,
         cs.cohort_size,
         pc.week_offset,
         pc.active_count
  from cohort_sizes cs
  join per_cell pc using (cohort_week)
  order by cs.cohort_week desc, pc.week_offset asc;
end;
$$;

create or replace function public.admin_platform_funnel(p_days int default 30)
returns table (
  stage_key    text,
  stage_label  text,
  tenant_count int,
  stage_order  int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin only';
  end if;

  if p_days is null or p_days < 1 or p_days > 365 then
    p_days := 30;
  end if;

  v_since := now() - make_interval(days => p_days);

  return query
  with cohort as (
    select t.id, t.status
    from public.tenants t
    where t.created_at >= v_since
  ),
  has_product as (
    select distinct p.tenant_id
    from public.products p
    where p.tenant_id in (select id from cohort)
  ),
  has_order as (
    select distinct o.tenant_id
    from public.orders o
    where o.tenant_id in (select id from cohort)
  ),
  paid as (
    select distinct s.tenant_id
    from public.subscriptions s
    where s.tenant_id in (select id from cohort)
      and s.status = 'active'
      and exists (
        select 1 from public.payment_proofs pp
        where pp.subscription_id = s.id
          and pp.status = 'approved'
      )
  )
  select * from (values
    ('signup',            'Signup',            (select count(*)::int from cohort),                              1),
    ('onboarded',         'Onboarded',         (select count(*)::int from cohort where status <> 'pending'),    2),
    ('first_product',     'First product',     (select count(*)::int from has_product),                         3),
    ('first_order',       'First order',       (select count(*)::int from has_order),                           4),
    ('paid_subscription', 'Paid subscription', (select count(*)::int from paid),                                5)
  ) as v(stage_key, stage_label, tenant_count, stage_order)
  order by stage_order;
end;
$$;

grant execute on function public.admin_tenant_cohort_retention(int) to authenticated;
grant execute on function public.admin_platform_funnel(int)         to authenticated;
revoke execute on function public.admin_tenant_cohort_retention(int) from anon;
revoke execute on function public.admin_platform_funnel(int)         from anon;
