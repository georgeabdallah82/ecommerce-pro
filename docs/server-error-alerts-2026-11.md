# Alerts when the store answers with server errors (November 2026)

Branch `claude/server-error-alerts`, based on `origin/main` at e3ad84f (after #646).

## Why

- **What was already watched:**
  - a failed checkout alerts the owner at once (`lib/order-alerts.ts`);
  - the store error check counts the requests Cloudflare stops or that crash the Worker, every 6 hours (`.github/workflows/store-errors.yml`).
- **The gap:** a page or API that *answers* with an error was never counted. For example, a product page or the order lookup failing on a broken change or a database problem.

## What changed

- **The Worker counts every server error the store answers with** (`worker.ts`, `lib/server-errors.ts`).
  - **What counts:** 500 and up, plus a request that throws, counted as 500.
  - **Where the count is kept:** a small file in the media bucket (`ops/server-errors.json`), written after the answer has gone out. The bucket works even when the database is what fails.
  - **Not counted:**
    - **503:** the maintenance page and the closed store's API answer 503 on purpose.
    - **The store's own scheduled jobs:** they already report their failures.
    - **The image proxy's 502 and 504:** an outside image host failing, not the store. Its own 500 still counts.
- **5 errors within 10 minutes tell the owner** (`app/api/internal/server-errors`, `alertServerErrors` in `lib/order-alerts.ts`).
  - **The alert:**
    - a phone notification and an email, like a failing job, while "Tell me about order problems" is on;
    - every report is also kept in the activity log (`store.server_errors`).
  - **What it says:** which pages failed, and with which errors. For example: "5 requests failed with a server error in 10 minutes: /shop (4), /api/products (1). Errors: 500 ×5."
  - **How often:**
    - at most once every 6 hours;
    - only an alert that went out counts as told. If telling the owner failed (the database is down too), it is tried again in the next 10 minutes, not on every error.
  - **What the alert can't do:** when the database itself is down, the store can't look up whom to tell. Then the uptime monitor (Website status) and the database hours check are what catch it.
- **Notes:** this file.

## Verification

- `npm run typecheck`, `npm test`, `npm run backend:audit` and `npm run build:cloudflare` pass.
- **`tests/server-error-alerts.test.ts` adds 7 tests:**
  - which answers count;
  - 5 within 10 minutes make one alert, while fewer or spread out make none;
  - after an alert, nothing for 6 hours, while a failed try is retried in the next window only;
  - the page that just failed always stays in the list, even after ten others failed once each (a bug this test caught before commit);
  - only a well-formed record is read back;
  - the Worker counts after the answer, and thrown errors as 500;
  - the alert route takes only the Worker's key or the bearer.
- **In the Cloudflare runtime** (`wrangler dev`, with a local media bucket and PostgreSQL):
  - six requests answered 502 through the image proxy, the test case before it was excluded;
  - at the fifth, the Worker asked the store to tell the owner;
  - the activity log got "5 requests failed with a server error in 10 minutes: /api/image-proxy (5). Errors: 502 ×5.";
  - the bucket file recorded the alert, and the sixth error was counted without a second alert.
