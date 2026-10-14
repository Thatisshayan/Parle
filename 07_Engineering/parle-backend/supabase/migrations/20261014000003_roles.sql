-- Roles live in auth.users.app_metadata.role, which only the service role (server code) can write (S3).
create or replace function public.app_role() returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'learner');
$$;
create or replace function public.is_admin() returns boolean language sql stable as $$
  select public.app_role() = 'admin';
$$;
grant execute on function public.app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
