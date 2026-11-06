# Job Runners

Core never runs a workflow inline: it hands each run to a **job runner**. Which one is
chosen when Core starts, from `~/.tipeline/config.json` (`src/engine/runner/JobRunnerFactory.ts`).

| Runner | When | What it does |
|--------|------|--------------|
| **Bree** (default) | No config file, or `"runner": "bree"` | Runs each job in a worker thread inside Core. Schedules are Bree cron, interval or date jobs. |
| **BullMQ** | `"runner": "bullmq"` plus a `redis` URL | Puts jobs on a Redis queue. Workers — in Core, or separate processes on other machines — pick them up. Schedules are BullMQ repeatable or delayed jobs. |

## Configuration

`~/.tipeline/config.json`:

```json
{ "runner": "bree", "concurrency": 10 }
```

```json
{ "runner": "bullmq", "redis": "redis://localhost:6379", "concurrency": 4 }
```

| Key | Default | Meaning |
|-----|---------|---------|
| `runner` | `bree` | `bree` or `bullmq` |
| `redis` | — | Redis URL. Required for `bullmq`. |
| `concurrency` | `10` (Bree), `4` (BullMQ) | How many runs this Core executes at once. With BullMQ, `0` makes Core an orchestrator only: it queues jobs but never runs them. |

Restart Core after changing it.

## Schedules

Both runners take the same schedules (`src/engine/runner/scheduleTiming.ts`):

- **Repeating**: a 5-field cron, or 6 fields with seconds first. Bree is given `hasSeconds` for 6 fields; BullMQ reads both.
- **Interval**: `schedule.every_seconds`, with no cron, for repeats a cron can't keep even ("every 40 seconds" — `*/40` would fire at :00 and :40). Bree gets an `interval` job, BullMQ `repeat.every`. The first run is one interval after the job is registered, so after a Core restart it starts counting again. `nextRunAt` is worked out from `last_run_at` (or when the schedule was saved or turned on).
- **One-time**: `schedule.run_at`, with no cron. Bree gets a `date` job, BullMQ a delayed job. A time missed while Core was off fires a second after start-up.
- When a Bree schedule fires, `last_run_at` is set, and a one-time schedule is turned off (`enabled = 0`). BullMQ doesn't record runs yet, so its one-time schedules stay listed as on.
- Schedules closer than every 10 seconds are refused (`MIN_SCHEDULE_INTERVAL_SECONDS` in `@tipeline/utils`). Bree never starts a job that's still running, so a slow run skips the next tick instead of overlapping it.

## Distributed workers (BullMQ)

`docker/distributed/` has a Docker Compose setup with Redis and two worker containers.

1. Make your local Core an orchestrator. In `~/.tipeline/config.json`:

   ```json
   { "runner": "bullmq", "redis": "redis://localhost:6379", "concurrency": 0 }
   ```

2. Build and start Redis and the workers (the first build compiles native modules for
   Linux and takes a few minutes):

   ```bash
   cd docker/distributed
   docker compose build
   docker compose up -d
   docker compose logs -f worker-1 worker-2
   ```

3. Start Core from the repo root: `npm -w apps/core run server`.

4. Run a workflow: `tipeline workflow exec <identifier>`. The job shows up in a worker's
   log, and progress flows back to the CLI or Desktop as it does locally.

5. Stop everything with `docker compose down`.

The workers mount `~/.tipeline` at the same absolute path as the host, so the database path
stored in `database.json` resolves inside the container too. Each worker reads
`REDIS_URL`, `WORKER_CONCURRENCY` and `WORKER_ID`.

```
CLI / Desktop
     │ IPC
     ▼
Local Core (orchestrator, concurrency 0)
     │ queues the job
     ▼
Redis :6379
     ├── worker-1 picks it up → runs it → reports progress
     └── worker-2 picks it up → runs it → reports progress
            │
            └─ QueueEvents → Core re-emits on its event bus → CLI / Desktop
```

On a Tipeline Server deployment, see [Docker setup → Distributed workers](/server/docker#_7-distributed-workers-bullmq).
