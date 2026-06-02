
-- Lock search_path on touch_updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Revoke direct execute on internal security-definer functions
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.touch_updated_at() from anon, authenticated, public;
revoke execute on function public.has_role(uuid, public.app_role) from anon, public;
-- authenticated keeps execute on has_role because client-facing RLS-derived checks may invoke it via PostgREST RPC if ever needed; lock to definer only:
-- Actually has_role is only used inside RLS policies (where it runs regardless of grants). Revoke from authenticated too.
revoke execute on function public.has_role(uuid, public.app_role) from authenticated;
