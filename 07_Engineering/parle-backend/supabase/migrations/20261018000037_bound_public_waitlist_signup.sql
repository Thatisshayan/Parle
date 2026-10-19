-- Route public signup through parle-waitlist-join so body, IP, address, and overall request limits apply.
-- The original join_waitlist RPC is created outside this repository on production, so clean local stacks may not
-- have it yet. The local test-only stand-in mirrors the restricted grant for integration tests.
do $$
begin
  if to_regprocedure('public.join_waitlist(text,text,text,text,text)') is not null then
    execute 'revoke all privileges on function public.join_waitlist(text,text,text,text,text) from public, anon, authenticated';
    execute 'grant execute on function public.join_waitlist(text,text,text,text,text) to service_role';
  end if;
end $$;
