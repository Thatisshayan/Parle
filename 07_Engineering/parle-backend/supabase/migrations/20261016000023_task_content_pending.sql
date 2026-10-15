-- A28 (Plan 6): the plan is shown at once and each task's practice content is written afterwards, so a saved task can
-- wait for its content ('pending'). Same check as migrations/20261014000001_app_tables.sql, one value added.
alter table public."learner_task" drop constraint if exists "learner_task_content_source_check";
alter table public."learner_task" add constraint "learner_task_content_source_check"
  check ("content_source" in ('generated','approved_bank','plan_only','unavailable','suggestion','pending',''));
