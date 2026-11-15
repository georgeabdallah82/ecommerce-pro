# Admin › Every screen tries a cut-off read again (November 2026)

Branch `claude/admin-retry-reads`, based on `origin/main` at 8eb72cc (after #627).

## What was wrong

**Cloudflare stops some requests part-way.** About 6% of requests in 72 hours ended this way, at the Workers Free plan's 10 ms CPU limit (`docs/admin-load-errors-2026-11.md`). The browser then gets Cloudflare's error page instead of the app's answer.

**Only Add media and Operations retried** (#624). Every other admin screen showed its "could not load" message the first time a read was cut off.

## What changed

- **Every component's request helper** (the `api()` functions in `components/`, 44 files) now goes through `fetchRead` (`lib/retry-fetch.ts`). So do the 15 one-line admin reads outside a helper, such as the team notices banner, the theme editor's lists, Media and live visitors.
- **What `fetchRead` does:**
  - It tries a GET again after 0.4 s and 1.2 s when the host cut it off: a 5xx without the app's JSON, or a dropped connection.
  - Saves (POST, PATCH, DELETE) go once.
  - The app's own errors come back as they are.

## Not changed, on purpose

- **The plan:** the fix for the cut-offs themselves is still the Workers Paid plan, in the Cloudflare dashboard.
- **Saves written across several lines** go once, as before.
- **Page loads** the host cuts off still show Cloudflare's page; reloading works.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass.
  - `tests/admin-retry-reads.test.ts` adds 2 tests: every request helper and one-line admin read uses `fetchRead`.
  - The notices test now looks for `fetchRead`.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- **9 admin screens, on the production build, with the first GET to every admin address answered as Cloudflare does** (a 503 HTML page):
  - Screens: Customers, Inventory, Orders, Discounts, Returns, Media, Analytics, Drivers and Reviews.
  - Every read cut off was tried again, each screen loaded with no error message, and there were no page errors.
  - Discounts, Analytics and Drivers make no browser reads when they open.
