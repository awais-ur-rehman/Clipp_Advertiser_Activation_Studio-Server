# Clipp Advertiser Activation Studio

An onboarding automation system with built-in A/B testing, built as a portfolio submission for a Full-Stack Growth Engineer role at Clipp.com. The system automates what happens the moment a new local business signs up to advertise — queuing a personalized task sequence, tracking their activation funnel, and surfacing the comparison between two onboarding variants on a live dashboard.

## Quickstart

```bash
git clone <repo-url>
cd clipp-advertiser-activation-studio
cp .env.example .env

docker compose up
```

Wait for the healthcheck (under 30 seconds), then open [http://localhost:3000](http://localhost:3000).

The API is at [http://localhost:4000](http://localhost:4000). The dashboard is pre-populated by a seed script that runs on first boot. No manual setup needed.

To fire a webhook manually:

```bash
curl -X POST http://localhost:4000/webhooks/advertiser-signed-up \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-api-key-change-in-production" \
  -d '{"business_name": "Main Street Bakery", "email": "baker@mainst.com"}'
```

Refresh the dashboard and the new advertiser appears with their task sequence active.

## What it does

1. A webhook receives `advertiser.signed_up` events from an external billing system
2. Each advertiser is bucketed into Variant A or Variant B using a deterministic hash on their email address
3. Variant A enqueues a 5-task, 7-day onboarding sequence (the control)
4. Variant B enqueues a 3-task, 3-day sequence (the treatment, more aggressive)
5. A worker process consumes the queue, simulates task execution, and handles retries with exponential backoff
6. After 3 failed attempts, a task moves to the dead-letter queue — visible in the dashboard with a retry button
7. The funnel dashboard shows signup, coupon-design, and coupon-publish rates per variant with a delta indicator

## Architecture

```
POST /webhooks/advertiser-signed-up
        │
        ▼
Variant assignment  (SHA-256(email) % 2)
        │
        ▼
Insert Advertiser + Tasks  (Postgres)
        │
        ▼
Enqueue delayed BullMQ jobs  (Redis)
        │
        ▼
Worker process
  - Consumes jobs
  - Checks conditional task logic
  - Logs structured JSON per side effect
  - Retries 3x with exponential backoff (1s, 5s, 25s)
  - Moves to DLQ on final failure
        │
        ▼
Postgres (source of truth for all task state)
        ▲
        │
Next.js dashboard
  /             Funnel comparison, A vs B
  /advertisers  Paginated advertiser list + task timeline per row
  /tasks        Queue health metrics + DLQ table + retry button
```

## API reference

All write endpoints require an `X-API-Key` header. Read endpoints are open.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/webhooks/advertiser-signed-up` | Yes | Create advertiser, assign variant, enqueue tasks |
| `POST` | `/api/advertisers/:id/coupon-designed` | Yes | Record first coupon designed, cancel DAY_3_CHECK_IN if pending |
| `POST` | `/api/advertisers/:id/coupon-published` | Yes | Record first coupon published, cancel DAY_7_SALES_HANDOFF if pending |
| `GET` | `/api/advertisers` | No | Paginated advertiser list with task state |
| `GET` | `/api/funnel` | No | Per-variant funnel counts used by dashboard |
| `GET` | `/api/tasks/dlq` | No | Queue health metrics and dead-letter tasks |
| `POST` | `/api/tasks/dlq/retry` | Yes | Re-queue a dead-letter task |
| `GET` | `/health` | No | Liveness check |

## Variant definitions

**Variant A — control (5 tasks, 7 days)**

| Task | Delay | Conditional |
|------|-------|-------------|
| `WELCOME_EMAIL` | 0h | No |
| `ACCOUNT_SETUP_NUDGE` | 24h | No |
| `FIRST_COUPON_DESIGN_NUDGE` | 72h | No |
| `DAY_3_CHECK_IN` | 96h | Skips if coupon already designed |
| `DAY_7_SALES_HANDOFF` | 168h | Skips if coupon already published |

**Variant B — treatment (3 tasks, 3 days)**

| Task | Delay | Conditional |
|------|-------|-------------|
| `WELCOME_EMAIL` | 0h | No |
| `FIRST_COUPON_DESIGN_NUDGE` | 24h | No |
| `DAY_3_CHECK_IN` | 72h | Skips if coupon already designed |

Conditional tasks check live advertiser state at execution time, not at enqueue time. If the condition is no longer true, the task marks itself completed with a `skipped_condition_unmet` reason and logs it. This avoids sending a check-in email to an advertiser who already designed their coupon between when the job was scheduled and when the worker picked it up.

## Project structure

```
/
├── backend/
│   ├── src/
│   │   ├── controllers/    Request parsing, validation, calls into services
│   │   ├── services/       Business logic, DB access, queue calls
│   │   ├── routes/         HTTP verb + path wiring only
│   │   ├── workers/        BullMQ consumer, retry and DLQ handling
│   │   ├── queue/          BullMQ producer, variant schedule definitions
│   │   ├── experiments/    Variant assignment (SHA-256 hash mod 2)
│   │   ├── middleware/     API key auth, request ID, error handler
│   │   ├── errors/         AppError subclasses with HTTP status codes
│   │   ├── lib/            Prisma singleton, Redis client, Pino logger, env
│   │   ├── server.ts       Express bootstrap + graceful shutdown
│   │   └── worker.ts       Worker process entry point
│   ├── prisma/             Schema and migrations
│   └── scripts/            Seed script (50 advertisers), manual curl tests
├── frontend/               Next.js 15 App Router dashboard
├── docker-compose.yml      One-command local environment
└── .env.example            All required variables with safe defaults
```

## Design decisions

**Deterministic variant assignment on email, not a random coin flip.**
The same email address always lands in the same bucket. This matters for idempotency: if the webhook fires twice for the same advertiser (duplicate event from the billing system), the second call returns a 409 and no duplicate is created. If we used a random assignment and the first write partially failed, a retry could land the advertiser in a different variant, corrupting the experiment.

**BullMQ job ID is the Prisma task ID.**
Setting `jobId: taskId` in BullMQ means re-enqueuing the same task is a no-op if a job with that ID is already in the queue. Retried requests from the API get deduplication for free without any application-level locking.

**Worker state machine is Postgres, not Redis.**
BullMQ's job state in Redis is ephemeral. The canonical task state (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `DEAD_LETTER`) lives in Postgres. The worker updates the DB at each state transition and logs one structured JSON line per transition. If Redis is wiped, the task history is intact and the DLQ dashboard still works.

**Conditional task logic runs at execution time.**
A DAY_3_CHECK_IN job is enqueued regardless of whether the advertiser is likely to design their coupon in the next 96 hours. The worker checks the actual state of `firstCouponAt` when it picks up the job. This keeps the enqueue path simple and avoids trying to predict future advertiser behavior at signup.

**Email sending is simulated with structured logs.**
Each task execution logs what would have been sent. The simulation is self-contained and deterministic, which makes the worker easy to reason about and easy to replace with a real email client later without touching any other layer.

## What I'd ask before building this for real

1. What is the definition of "activation"? Right now it's first coupon designed and first coupon published. Is that what the growth team tracks, or is there a different milestone that actually correlates with retention?

2. How does the billing system emit these events? Is the webhook a push from Stripe, a Zapier trigger, or something internal? The retry and deduplication strategy depends on whether the source guarantees delivery.

3. What's the expected volume? This design handles hundreds of advertisers per day easily. For tens of thousands per day, the worker needs horizontal scaling and the funnel query needs a materialized view or incremental aggregation.

4. How long does a variant run before a decision is made? There's no significance testing in this version — raw conversion rates only. At what sample size does the team typically call an experiment?

5. Should the same advertiser be able to re-enter the experiment? Right now email is a unique key and a duplicate signup is rejected. If an advertiser cancels and re-signs up, do they get a fresh sequence or should they be suppressed?

6. Are the task delays wall-clock delays or business-hours delays? Sending a sales handoff at 3am on a Saturday is different from sending it the next business morning.

7. Who owns the DLQ in production? Right now the retry button is in the internal dashboard. Is that the right place, or should dead-letter tasks page an on-call engineer via PagerDuty?

8. Should Variant B's shorter sequence affect how aggressively sales follows up? If the hypothesis is that faster onboarding increases activation, the sales team probably needs to know which variant an advertiser is in to calibrate their outreach.

9. Is there a holdout group? Running A vs B tells you which sequence is better, but not whether either sequence is better than doing nothing. A no-touch holdout would answer that.

10. What does "coupon designed" mean exactly? Is this a user action in the Clipp product UI, a signal from an external tool, or something else? The current model assumes it's an explicit event posted to this API.

## What's intentionally not built

- **Real email sending.** Every task execution is a simulated log line. Plugging in SendGrid or Postmark is a one-function change in `onboarding-worker.ts`.
- **Statistical significance testing.** The funnel shows raw rates. Significance calculation belongs in the analysis layer once there's enough data to run it.
- **Authentication.** API key on write endpoints only. No user accounts, no JWT, no session management.
- **Multi-arm experiments.** The hash function and schedule table support exactly two variants. Generalizing to N arms is straightforward but out of scope.
- **Advertiser-facing UI.** This is the internal operator console. The advertiser never sees it.
- **Deployment beyond docker compose.** No Kubernetes manifests, no CI/CD pipeline, no staging environment.
- **Observability.** Structured logs to stdout only. No Datadog, no Sentry, no distributed tracing. In production you'd ship logs to a collector and add `correlation_id` to every trace.

## Local development

```bash
# Dependencies
cd backend && npm install

# Database + queue (Docker required)
docker compose up -d postgres redis

# Run migration and generate Prisma client
cd backend && npx prisma migrate dev

# Seed 50 advertisers with varied states
npm run seed

# Start API server (with hot reload)
npm run dev

# Start worker (separate terminal)
npm run worker:dev
```

Environment variables are documented in `.env.example`. All variables are validated at boot via Zod — the process exits immediately if anything is missing or malformed.
