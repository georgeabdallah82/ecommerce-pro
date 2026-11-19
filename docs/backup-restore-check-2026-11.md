# Backups: a monthly restore check of the copy kept in R2 (November 2026)

Branch `claude/backup-restore-check`, based on `origin/main` at 1ca4a50 (after #636). A first-month item from the backend audit.

## What the audit got wrong, and what was left

- **The nightly backup already restores each copy** (`.github/workflows/database-backup.yml`).
  - It restores into a throwaway database and compares row counts with the live store before keeping it in R2.
  - The audit missed this.
- **What nothing checked was the other half:** that a recent copy is in the R2 bucket and comes back out whole with the account's token, as it would on the day it is needed.

## What changed

**`.github/workflows/backup-restore-check.yml`** runs on the 3rd of each month (05:41 in Beirut), and by hand.

1. It downloads the newest nightly copy (`yallahaul-YYYY-MM-DD.dump`) from the last two days.
2. It reads which PostgreSQL version the copy was made from, and restores it into a throwaway database of that version.
3. It checks what came back:
   - at least 50 tables;
   - applied migrations;
   - the store's settings;
   - an active staff account to sign in with.

   The run's summary lists the tables, migrations, settings, staff accounts, products and orders.
4. **Anything wrong fails the run, and GitHub emails you:**
   - no copy from the last two days (the nightly backup may have stopped, or the token cannot read the bucket);
   - a copy that cannot be read;
   - a check that fails.

The live database is not touched, and its address is not used.

## Not changed, on purpose

- **The nightly backup** stays as it is.
- **The copy is not compared with the live store:** the nightly job does that on the day it makes it.

## Verification

- `npm run typecheck`, `npm test` and `npm run backend:audit` pass. `tests/backup-restore-check.test.ts` adds 3 tests.
- No app code changed, so the store's build is the same as main's.
- **The workflow's own step scripts passed 3 cases.** Stand-ins replaced `npx` (R2) and `docker` (PostgreSQL), using the local PostgreSQL 16 tools:
  - **A good copy from yesterday** downloaded, was read as PostgreSQL 16, and restored. It showed 86 tables, 26 migrations, 10 settings, 1 staff account, 6 products and 3 orders.
  - **No copy in the last two days** failed the run, saying the daily backup may have stopped.
  - **A damaged copy** failed the run, saying it could not be read.
