# Critical-path checks and alerts for failed GitHub checks (November 2026)

Branch `claude/critical-paths`, based on `origin/main` at 3969762 (after #641). This is item 3 of the three agreed after #641.

## Why

- **Most checks read code, not behaviour.** About 1,400 of the 4,600 test checks look at the code's text. They can pass while a feature is broken. Only the money calculations (#639) placed real orders. The paths a shop can least afford to break are signing in, an order's life, refunds and stock, and those had only thin checks:
  - the browser test cancelled a new order;
  - it did not look at the stock, the shipment or the money left behind.
- **A failing GitHub check reached no one.** The daily "Database hours check" failed for six days in a row and nobody saw it. A failed run is reported only by GitHub's own email, which goes to whoever set the check up, if their notifications allow it.

## 1. The critical paths, checked on a real store and database

The PostgreSQL staging check runs on every pull request. It runs the store's real Worker on a real PostgreSQL (wrangler dev) and drives it with a browser (`scripts/e2e/write-path.mjs`). That test now also runs `scripts/e2e/critical-paths.mjs`, which checks each step's answer and what it left in the database.

- **Customer sign-in** (the real form):
  - a wrong password is refused;
  - the right one signs in;
  - signing out ends the session.
- **An order's life.** The order is for a product of its own with 3 in stock, so every count is exact.
  - Checkout holds 1 unit.
  - The order is confirmed, then prepared.
  - Out for delivery: the unit leaves the stock, and a shipment with its line is recorded.
  - Delivered: as cash on delivery, the order is marked paid.
  - A delivered order cannot go back a step.
- **Refunds of that order:**
  - refused until staff confirm it's them;
  - a wrong password to confirm is refused;
  - a partial refund is recorded, and the order stays delivered;
  - more than what's left to refund is refused, and nothing is recorded;
  - the rest is refunded, so the order is refunded in full: two refunds that add up to its total;
  - a refund alone puts no stock back.
- **Cancelling:**
  - before shipping: the held unit is freed;
  - after shipping: the unit comes back to stock and the shipment is cancelled.
- **Overselling:**
  - an order for more than is left is refused, and nothing is held or created;
  - two shoppers at the same moment for the last unit: it is sold once, and the other shopper is told it's gone (409).
- **Staff sign-in** (fresh browsers, after the 2-step set-up the test already did):
  - a wrong password is refused;
  - the password alone asks for the code and opens nothing;
  - a wrong code is refused;
  - the right code opens admin;
  - the same code can't be used twice.

The launch clean-up rehearsal runs after this test on the same database. Its planted order "#1005" became "#1500", because the test's own orders now reach #1005.

## 2. Failed GitHub checks reach the owner's phone

**`.github/workflows/check-alerts.yml`** runs when one of these finishes on main:
- the daily database hours check;
- the nightly backup;
- the store error check;
- the monthly backup restore check;
- CI, which also puts main live.

It runs only for main's own scheduled, hand-started and push runs. When the check failed, timed out or could not start, it tells the store.

**The store tells the owner like for a failing store job** (`lib/order-alerts.ts`):
- a phone notification and an email ("Tell me about order problems" in Settings > Notifications);
- at most once per check every 6 hours, and once per run however often it is sent;
- the activity log keeps the failure with a link to the run.

Each check has its own words, for example: "The database has used most of its monthly hours, or is on pace to, or the check could not read them. Open Website status for the numbers."

**No secret is shared or stored.**
- GitHub signs a token for that one run of the alert workflow; it is valid for minutes.
- The store (`app/api/internal/github-check-failed`, `lib/github-check-alerts.ts`) checks:
  - GitHub's signature, with GitHub's published keys;
  - the issuer and this store's audience;
  - this repository and its main branch;
  - a `workflow_run` run of the alert workflow itself.
- The report then names the failed check and run. Only the five checks above are accepted.
- The address stays open while the store is in maintenance mode.

**Why a separate workflow, rather than a last step in each check:** the nightly backup is also run by the launch clean-up. A token permission added to the backup would have had to be granted by the clean-up too. One workflow also covers a check that timed out or never started, which a last step can't.

The `STORE_URL` repository variable points the alerts at another address than the live store, if ever needed.

## Verification

- **Checks:** `npm run typecheck`, `npm test` (1371 pass), `npm run backend:audit` and `npm run build:cloudflare` pass.
- **`tests/github-check-alerts.test.ts` adds 6 tests.** The tokens are signed with a test key, so no network is used.
  - A genuine token for the alert workflow on main is accepted. These are refused:
    - another audience or issuer;
    - an expired token, or one not valid yet;
    - another repository, branch or event (a pull request);
    - another workflow, or the alert workflow from another branch.
  - A token that isn't genuine is refused:
    - a changed body;
    - another key under the same name;
    - an unknown key;
    - `alg: none` or `HS256`;
    - malformed tokens.
  - GitHub's keys are read again for a key not seen yet (key change).
  - The report must name one of the five checks and a numeric run.
  - The route answers 401 without a genuine token, and stays open during maintenance.
  - The alert workflow watches exactly the checks the store names, by their workflow names. Its values reach the script only as variables.
- **The PostgreSQL staging check, run locally** as CI runs it:
  - a fresh PostgreSQL;
  - migrations, with the migration diff;
  - the seed;
  - the Cloudflare build;
  - the Worker under `wrangler dev`.
- **Result:**
  - `write-path.mjs`: all passed, including the 30 new checks above. Its orders were #1004 to #1009, and the racing pair answered 201 and 409.
  - The launch clean-up rehearsal, with its order at #1500: all passed.
- **Not checked here:** the alert workflow itself runs only from main, after this is merged. Its first real run will be the next failed check. The daily database hours check fails every morning until the hours come down. Its run log shows the store's answer (`{"ok":true,"alerted":true}`, or `alerted:false` when order-problem alerts are off or one was already sent in the last 6 hours).
