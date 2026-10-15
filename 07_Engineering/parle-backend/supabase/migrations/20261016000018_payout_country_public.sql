-- Payout countries are non-private configuration: anyone may read the country list (R1).
grant select ("id", "country_name", "country_code", "status") on public."tutor_payout_country" to anon, authenticated;
create policy "tutor_payout_country: public reads" on public."tutor_payout_country" for select to anon, authenticated using (true);
