# Spike: local Supabase in Docker (Plan 1, Task 6)

- **Date:** 2026-10-14
- **Machine:** Docker Desktop 29.6.2, 12 CPUs, about 11.6 GiB memory available to Docker. Another container
  (`baserow`, the founder's) was running and was left alone.
- **Start command** (from `07_Engineering/parle-backend/`):
  `bunx supabase start -x imgproxy,vector,logflare,supavisor`
- **First start:** about 7 minutes (18:47 -> 18:54 ET), mostly downloading newer images (Postgres 17.11.0.004 and
  others). Later starts reuse the images and take well under a minute.
- **Memory after start:** about **1.05 GiB** for the 10 containers (Realtime 237 MiB, Studio 205 MiB, Storage
  163 MiB, Postgres 116 MiB, Kong 108 MiB, Postgres Meta 108 MiB, Edge Runtime 69 MiB, others small). Lower than the
  2-3 GB estimated in the spec.
- **Result:** REST endpoint answers (test `tests/local-stack.test.ts` passes). Project id `parle-staging`; API
  `http://127.0.0.1:54321`; Studio `http://127.0.0.1:54323`. The local keys are development keys, printed by
  `bunx supabase status`; they are not secrets of any real project but are still kept out of the docs.
- **Rule:** stop with `bunx supabase stop` at the end of every working session (the PC is short on RAM); Docker
  Desktop must be running first (ask the founder if `docker version` shows no Server).
