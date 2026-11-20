# Database wake-ups: the free plan's hours (November 2026)

Branch `claude/db-hours`, based on `origin/main` at 3969762 (after #641).

## What was wrong

- **The "Database hours check (daily)" failed every day from November 14.** On November 19, 67.6 of the free plan's 100 monthly hours were used with 11 days left, on pace for about 109. When they run out, Neon suspends the database and the whole store stops until the month resets.
- **The database was awake about 13 hours a day while the store was closed.** Neon sleeps after 5 minutes without a query, and wakes on the next one. The scheduled jobs explain about 2 of those hours.
- **The rest came from requests.** The proxy (`proxy.ts`) asked the database two questions before every request that is not a file: is the store in maintenance mode, and does this address redirect.
  - While the store is closed, almost every request comes from robots: search engines, link previews, scanners trying `/wp-login.php`.
  - Each one woke the database. The maintenance page they were sent to then read its settings, the theme and the contact details again.
- **The three hourly jobs woke it 24 times a day**, mostly with nothing to do: the refund check, the release of abandoned card checkouts, and the retries.

## What changed

1. **The proxy answers from a copy** (`lib/edge-config.ts`).
   - **What it holds:** the maintenance switch and every redirect, kept in the media bucket (R2) and in each Worker's memory for a minute. A request no longer touches the database.
   - **When it is rebuilt:** when it is missing or older than 6 hours, in one read of the database (`loadEdgeConfigRows`).
   - **When it is cleared:** by the saves that change it, with the rebuild on the next request.
     - a Settings save (the maintenance switch);
     - Redirects (add, edit, delete);
     - a page or post moved to a new address (`lib/redirect-moves.ts`).
   - **No stale copy after a save:** the copies are cleared again 5 seconds after each save, so a request that read the database just before the save cannot leave an old copy behind.
   - **Fallback:** without a bucket (local development, CI), or if anything fails, the proxy asks the database as before.
   - **Over 5,000 redirects:** the copy says it is incomplete, and an address it does not know is looked up.
2. **The maintenance page answers from its own copy** (`lib/maintenance-page-data.ts`): its texts, the brand, logo and colour, and the contact details.
   - It is rebuilt the same way, and cleared by a Settings save or a theme publish or restore.
   - Only a complete read is kept.
   - The response says where its details came from (`x-page-data: copy` or `database`).
3. **The hourly jobs run only while there is work** (`lib/hourly-jobs.ts`, `lib/hourly-jobs-storage.ts`).
   - **The marker:** a small file in the media bucket, like the order watch's, says "there is work".
     - A failed message kept for another try sets it (`queueRetry`, `lib/outbox.ts`), and so does a card checkout (`app/api/checkout`).
     - After the jobs, `app/api/internal/hourly-idle` clears it when no retry, card checkout awaiting payment or refund awaiting the gateway is left.
     - It clears the marker only if nothing set it during the count (R2's `onlyIf` etag check).
   - **When they run:** at the top of the hour while the marker is set, with no marker yet, and every 6 hours regardless (00:00, 06:00, 12:00 and 18:00 UTC).
   - **Refunds:** a refund sent to the gateway does not set the marker. The 6-hourly run picks it up, so it is confirmed within 6 hours instead of 1.
   - **An hour with nothing to do** costs one read of the marker in the media bucket, and no database time.

## What it saves

- **Requests:** robots and visitors on the closed store no longer wake the database. The proxy and the maintenance page read it at most every 6 hours, or once after a save.
- **Hourly jobs:** from 24 runs a day to 4 when idle, about 100 minutes of database time a day less.
- **The daily check** (`neon-usage.yml`) shows the effect from the next day. The month that ends on November 30 still counts the hours already used.

## Not changed, on purpose

- **Once the store is open**, shoppers' page views read the database (products, prices, stock), as they must. With real traffic the database stays awake most of the day, so plan Neon's paid Launch plan before opening. It is billed by use.
- **The product feed and the sitemap** still read the database when they are fetched: Meta's catalog and search engines fetch them rarely.
- **`/api/health`** still wakes the database on purpose: it checks it. An uptime monitor should call `/robots.txt` instead, or call `/api/health` at most hourly.
- **The daily job, the nightly backup and the hours check** each wake the database once a day.

## Verification

- `npm run typecheck`, `npm test` (1375 pass), `npm run backend:audit`, the dependency audit and `npm run build:cloudflare` (CI environment) pass.
- **Tests:** `tests/database-wakeups.test.ts` adds 10. Three existing tests that pinned the old "every hour" lines in `worker.ts` now check the new rule.
  - **The proxy's copy:** used while readable and under 6 hours old; redirects found, none, or "ask the database" when cut short; the proxy reads it first and falls back.
  - **Clearing:** every save that changes the copies clears them, and again 5 seconds later.
  - **The maintenance page:**
    - a visitor sent by the proxy gets the closed page (503), while `/maintenance` visited directly with the store open still sends you home;
    - without a bucket it reads the database and says so.
  - **The hourly jobs:** when they are due; the Worker reads the marker before waking the database; the idle check answers only the Worker or the bearer, and reports what is waiting.
- **16 checks pass in the Cloudflare runtime** (wrangler dev: workerd with a local R2 bucket and the local PostgreSQL database). Locally the proxy's database lookups are off (they only talk to Neon), so a closed store or a redirect can only come from the copy.
  - **The proxy:** a copy saying "closed" shows the maintenance page (503), and a redirect in the copy is followed (308).
  - **The maintenance page:** it read the database once, then its copy.
  - **A Settings save:** it cleared both copies from the bucket; the store then answered (200), and the maintenance page rebuilt its copy with the new text.
  - **The hourly jobs** (scheduled runs at a chosen time; database connections counted from the runtime's own traces):
    - **They run (6 connections each):** with no marker yet, at 12:00 regardless, and at 09:00 with the marker set. The idle check then cleared the marker.
    - **They don't run (0 connections):** at 09:00 with nothing to do, and at a quarter past.
- **A loop this check caught, fixed before commit:**
  - **The problem:** just after the store reopens, a Worker's one-minute memory can still say "closed" while the maintenance page already reads "open". The page sent visitors home, the proxy sent them back, and the Worker gave up with a 500.
  - **The fix:** the proxy now marks the request it sends to the maintenance page (`x-maintenance-gate`), and the page never sends such a visitor home. For at most a minute they see the closed page instead of an error.
- The local store was restored from the dump afterwards.
