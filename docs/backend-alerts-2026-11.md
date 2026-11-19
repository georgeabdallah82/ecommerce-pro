# Alerts: failed scheduled jobs and failed store requests (November 2026)

Branch `claude/backend-alerts`, based on `origin/main` at 4199a0f (after #634). The "alerts" step from the backend audit.

## What was wrong

- **A scheduled job that failed told nobody.**
  - The Worker's cron (`worker.ts`) runs the morning summary, the check for orders waiting too long, the hourly refund check and the hourly stock release.
  - A failure only reached Cloudflare's log of the cron run.
- **Requests Cloudflare stopped told nobody either.**
  - For example the Free plan's CPU limit ("exceededResources"), 6% of requests in the earlier finding.
  - `.github/workflows/cloudflare-health.yml` shows them, but only when run by hand.

## What changed

1. **A failed scheduled job tells the owner.**
   - The Worker reports each failed job to `app/api/internal/job-failed`. That takes only the Worker's own key or the `CRON_SECRET` bearer, and only the store's own jobs.
   - Every failure goes in the activity log as "job.failed", with the status and the start of the answer.
   - **The owner gets an email and a push** (`lib/order-alerts.ts`).
     - They go to the same people and devices as the other order alerts: the summary address, the super admins and staff devices with alerts on.
     - At most once per job every 6 hours, and only while "Tell me about order problems" is on (Settings › Notifications).
   - The other jobs still run, and the cron run still records the error, as before.
2. **Failed store requests are checked every 6 hours** (`.github/workflows/store-errors.yml`).
   - It reads Cloudflare's analytics for the store's Worker, read-only, with the secrets the health workflow already uses.
   - More than 2% failed, and at least 25, fails the run. GitHub then emails you about it (GitHub settings › Notifications › Actions).
   - The run's summary shows the counts by kind.
   - A visitor who left before the answer is not a failure.
   - A page the store answered with an error of its own isn't counted. A failed checkout already alerts the owner.
   - It can also be run by hand, for any number of hours.

## Not changed, on purpose

- **No new setting:** job alerts follow "Tell me about order problems".
- **Cloudflare's own notifications** (in its dashboard) are not set up here; they need the account.
- **On the Workers Free plan, expect the workflow to fail.** In the earlier finding 6% of requests ran out of CPU time. The Paid plan lifts that limit.

## Verification

- `npm run typecheck`, `npm test` (1314 pass) and `npm run backend:audit` pass. `tests/backend-alerts.test.ts` adds 6 tests.
- `npm run build:cloudflare` with the CI environment passes.
- **The workflow's own script passed 5 cases,** with Cloudflare's answer replaced by a file:
  - healthy (10 of 7,060 stopped);
  - the Free-plan finding (466 of 7,733, 6%) fails the run;
  - busy but fine (100 of 100,100);
  - analytics refused fails the run, with a message;
  - no requests.
- **On Cloudflare's local runtime** (wrangler dev, with the local database):
  - **The report route** alerts once, not again within 6 hours, and refuses a request without the key (401). Both failures are in the activity log.
  - **A real scheduled run with the Order table hidden** failed the check for waiting orders (500). The Worker reported it, the activity log has it with its status, and its 6-hour alert gate was used.
  - **A daily run that worked** reported nothing.
- **The local store was left as it was** (restored from the dump).
