-- A setting change and its audit row in one transaction (S24).
create or replace function public.save_setting_with_audit(p_key text, p_value text, p_updated_by text, p_owner uuid, p_created_by text, p_audit jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_key, '') = '' then raise exception 'save_setting_with_audit: key required'; end if;
  update public.app_setting set value = p_value, updated_by = p_updated_by, updated_at = now() where key = p_key;
  if not found then
    insert into public.app_setting (key, value, updated_by, owner_id, created_by) values (p_key, p_value, p_updated_by, p_owner, p_created_by);
  end if;
  insert into public.admin_audit_log (actor_user_id, actor_label, action, target_type, target_id, old_value, new_value, occurred_at_utc, owner_id, created_by)
  values (p_audit->>'actor_user_id', p_audit->>'actor_label', p_audit->>'action', p_audit->>'target_type', p_audit->>'target_id',
          p_audit->>'old_value', p_audit->>'new_value', p_audit->>'occurred_at_utc', p_owner, p_created_by);
end; $$;
revoke all on function public.save_setting_with_audit(text, text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_setting_with_audit(text, text, text, uuid, text, jsonb) to service_role;
