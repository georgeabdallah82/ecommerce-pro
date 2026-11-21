# The database hours check follows the last days (November 2026)

Branch `claude/smarter-hours-check`, based on `origin/main` at 037785e (after #645).

## What was wrong

The daily "Database hours check" (`scripts/neon-usage.ts`, `.github/workflows/neon-usage.yml`) warned in two cases:
- once 70% of the month's 100 hours were used;
- when the month's average pace would use them all up.

After #642 cut what kept the database awake, it kept warning every day, and the owner got an alert email each morning:
- **The share used:** the share stays above 70% for the rest of the month, whatever the pace.
- **The pace:** the average still counts the days before the fix. On November 21 it said "about 106 hours".

But the database used 1.7 hours that day, half the 3.5 a day before the fix, which ends the month at about 89.

## What changed

- **The pace comes from the last days.**
  - **Which reading it uses:** the oldest of this period's readings that is 20 hours to 4 days old.
  - **Closer than 20 hours,** one busy evening would count too much. **Further back than 4 days,** a fix made this week would be averaged away.
  - **Projection:** what is used now plus that pace times the days left.
- **Where the readings come from:** the check keeps its last 14 readings (`NEON_HISTORY_FILE`). The workflow carries them from one run to the next in GitHub's cache (`actions/cache/restore` and `save`, saved even when the check warns).
- **It warns when the last days' pace would use up the hours, or once 90% is used** (was 70%, `NEON_WARN_AT_PERCENT`).
- **Without a recent reading** (the first run, or a new month), the pace is the period's average, judged after the first 5 days, as before.
- **A new log line** says which pace was used, e.g. "Pace: 1.7 hours a day over the last 1.0 days". The lines Website status reads ("Database hours used…", "At this pace…", "WARNING:") are unchanged.

## What to expect

- **The first run after the merge has no earlier reading yet.** It uses the month's average and warns one last time.
- **From the next run on,** it uses the last days' pace. At November's numbers it stays quiet, about 89 of 100 by the end of the month.
- **It still alerts the owner** when the pace climbs again, for example once the store opens and real shoppers keep the database awake.

## Verification

- `tests/neon-usage.test.ts` now has 14 tests (was 8):
  - November's real numbers: 71.2, then 72.9 a day later, project about 89 with no warning, where the average alone said 106;
  - a fast last few days, or 90% used, still warn;
  - only this period's readings 20 hours to 4 days old count, the oldest of them;
  - a new month falls back to the average;
  - the last 14 readings are kept;
  - the check reads, reports and keeps the readings end to end, with Neon's answers stood in;
  - the workflow restores and saves the readings and warns at 90%.
- The older test that relied on the 70% default now uses 92% used.
- `npm run typecheck`, `npm test`, `npm run backend:audit` and `npm run build:cloudflare` pass.
