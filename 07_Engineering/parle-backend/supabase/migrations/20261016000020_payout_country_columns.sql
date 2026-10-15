-- Payout countries are public (000018), but who created a row is not: signed-in users had a table-wide read grant
-- from 000004, which exposed created_by (an administrator's email) and owner_id. Final review, Plan 4.
revoke select on public."tutor_payout_country" from authenticated;
grant select ("id", "country_name", "country_code", "status") on public."tutor_payout_country" to authenticated;
