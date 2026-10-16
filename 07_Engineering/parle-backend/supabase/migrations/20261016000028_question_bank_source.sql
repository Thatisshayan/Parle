-- Bank readers fix (R94): one switch names the question bank every reader serves, never both. 'demo' (the demo bank
-- marked is_test_data) until the real bank is imported and complete; an administrator then switches it to 'real' on
-- the admin Content page (refused while the real bank is incomplete). Code reads a missing row as 'real'.
-- waitlist_signup and join_waitlist() are not visited.
insert into public.app_setting (key, value, updated_by)
select 'question_bank_source', 'demo', 'bank-readers'
 where not exists (select 1 from public.app_setting where key = 'question_bank_source');
