-- Profile photos (R13, Plan 5): at most 10 files per person in the bucket (parle-account-service keeps one after each
-- save), and the storage rules work out the signed-in user once per query. Bucket size and type limits stay.
create or replace function public.my_profile_photo_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from storage.objects
  where bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text;
$$;
revoke all on function public.my_profile_photo_count() from public, anon;
grant execute on function public.my_profile_photo_count() to authenticated;

drop policy if exists "profile photos: owner uploads to own folder" on storage.objects;
create policy "profile photos: owner uploads to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.my_profile_photo_count()) < 10);
drop policy if exists "profile photos: owner deletes own" on storage.objects;
create policy "profile photos: owner deletes own" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
