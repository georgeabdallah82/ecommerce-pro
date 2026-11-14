# Admin › "Unable to load your library" and "Could not load sales channels" (November 2026)

Branch `claude/admin-load-errors`, based on `origin/main` at 5da85b4 (after #623).

## What happened

On 14 November the owner saw two errors on the live store:
- **Add media** on a collection said "Unable to load your library".
- **Operations** said "Could not load sales channels. Refresh to try again."

Both screens show their own fallback text when a request fails without the app's answer.

**What Cloudflare saw.** The read-only Cloudflare health report (`.github/workflows/cloudflare-health.yml`) was run for the last 6 and 72 hours.
- **72 hours:**
  - 7,733 requests across 37 Worker versions;
  - 466 of them (6.0%) ended as `exceededResources`: Cloudflare stopped them part-way.
- **Where:** five versions had these failures. One lost 243 of its 643 requests.
- **How long they ran:** every stopped request had used about 10 ms of CPU (median 10 ms on every version) and about 13 ms of real time.
- **Version `391e6931`** (PR #621) was live when both screenshots were taken. 89 of its 1,141 requests were stopped.

**What the browser gets.** A stopped request gets Cloudflare's error page (error 1102), not the app's JSON. So Add media fell back to "Unable to load your library", and Operations to "Could not load sales channels".

**Neither route nor any recent change caused it.** The same thing happened on four earlier versions, and any request can be stopped this way, page loads included.

## Why

**Stopping at 10 ms of CPU matches the Workers Free plan's limit** of 10 ms per request.
- The store's requests often need more: on the same versions, the median successful request used 18 to 270 ms.
- Cloudflare lets most of them through, but stops some.
- **On the plan:**
  - The workflow's token can't read the plan.
  - `lib/website-status-shared.ts` assumes Workers Paid ("10 million requests a month included").
  - If the account is on the Free plan, this is the cause.

**What fixes it is an account change, not a code change:** the Workers Paid plan, where a request can use up to 30 s of CPU. Check and change it in the Cloudflare dashboard, under Workers & Pages › Plans.

## What changed

1. **`lib/retry-fetch.ts`, `fetchRead`:** a read (GET) the host stopped is tried again, after 0.4 s and then 1.2 s.
   - **What counts as stopped:** a 5xx without the app's JSON, or a dropped connection.
   - **What is never retried:**
     - a save (POST, PATCH, DELETE), which goes once;
     - the app's own errors, which are JSON and come back as they are.
2. **Add media** (`components/media-picker.tsx`):
   - **Library reads** use `fetchRead`.
   - **Library errors:**
     - They show in the Library tab, with "Try again". They used to show on the Upload tab, where they had nothing to do with uploading.
     - The Library tab no longer says "No files in your library yet" when the library didn't load.
   - **Uploads:** an upload the host stopped says "Unable to upload image". It used to show a JSON parse error.
   - **The dialog:**
     - It is a modal dialog named "Add media": focus moves in, Tab stays inside, Escape closes it, and focus goes back to the button that opened it.
     - The Close button is named, and the tabs say which one is chosen.
3. **Operations** (`components/admin-operations-hub.tsx`):
   - Its reads use `fetchRead`.
   - The message names the lists that didn't load and has "Try again" beside it.

## Not changed, on purpose

- **The Workers plan** is the owner's decision, in the Cloudflare dashboard.
- **Other screens:** their reads and page loads can still be stopped the same way.
  - `fetchRead` is ready for any other read.
  - A page load the host stops shows Cloudflare's page, and reloading it works.
- **The plan figures in `lib/website-status-shared.ts`** stay until the plan is confirmed.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/admin-load-errors.test.ts` adds 5 tests, run against a stand-in `fetch`.
- `npm run build:cloudflare` with the CI environment passes, including the worker charset check.
- **14 browser checks pass on the production build.** The host stopping a request is simulated with a 503 HTML page, as Cloudflare sends.
  - **Add media:**
    - It is a modal dialog with focus inside, axe finds nothing, and Escape returns focus to the opener.
    - A library read stopped once is tried again and loads (2 requests, no error).
    - When it keeps failing:
      - the Upload tab says nothing about it;
      - the Library tab says "Your library didn't load." with "Try again", after 3 tries, and not that the library is empty;
      - "Try again" loads it.
  - **Operations:**
    - A stopped read is tried again and every list loads.
    - When it keeps failing, the message names sales channels and has "Try again", which loads it.
    - A save the host stopped is sent once.
  - No page errors.
- **The local store was left as it was;** nothing was saved.
