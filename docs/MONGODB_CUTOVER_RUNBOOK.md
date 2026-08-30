# PostgreSQL → MongoDB Cutover Runbook

## Hard safety gates

1. `mongodb-staging.yml` must be green.
2. The source database for the migration must be a verified PostgreSQL snapshot/staging copy for the staging rehearsal.
3. The target must be a dedicated MongoDB staging database for the rehearsal.
4. `mongodb-data-validation.yml` must pass model counts, SHA-256 row checksums, referential-integrity checks, typecheck, backend audit, and build.
5. Production PostgreSQL is not changed during the rehearsal.
6. No production cutover is permitted until a fresh production backup/snapshot is confirmed and a rollback connection is verified.

## Staging rehearsal

Configure GitHub Actions secrets in the repository/environment:

- `MIGRATION_SOURCE_DATABASE_URL` — PostgreSQL staging/snapshot connection string.
- `MIGRATION_TARGET_DATABASE_URL` — dedicated MongoDB staging connection string with replica-set support.

Run the **MongoDB data migration validation** workflow manually and enter `MIGRATE-STAGING`.

The workflow will:

1. Check both secrets exist without printing them.
2. Prepare and push the MongoDB Prisma schema.
3. Export PostgreSQL data into a temporary NDJSON snapshot.
4. Clear only the dedicated staging MongoDB target.
5. Import all models in schema order.
6. Compare per-model row counts and SHA-256 checksums.
7. Check every non-null Prisma relation reference for an existing target record.
8. Run typecheck, backend audit, and a production build.

Never point `MIGRATION_TARGET_DATABASE_URL` at production for this workflow.

## Production migration

Production migration is a separate controlled operation and must not use `--replace-target`.

1. Confirm current PostgreSQL backup/snapshot and restore procedure.
2. Put the storefront/admin writes into a maintenance/read-only window or otherwise freeze writes.
3. Export PostgreSQL using `SOURCE_DATABASE_URL`.
4. Import into a new empty production MongoDB database.
5. Run `validate-mongodb-migration.mjs` against that target.
6. Compare critical business totals manually: users, products, variants, inventory, orders, order items, payments, coupons, reviews, settings, and media metadata.
7. Run application smoke tests against MongoDB: authentication, storefront browsing, product/variant selection, cart, checkout, inventory reservation, admin order management, refunds/returns, reviews, settings, and notifications.
8. If any validation fails, stop and keep PostgreSQL live.
9. If all gates pass, take a final PostgreSQL backup and perform the final delta migration for writes created during the rehearsal window.
10. Re-run validation after the final sync.
11. Change the production `DATABASE_URL` to MongoDB and deploy.
12. Monitor errors, checkout, inventory, authentication, and order creation.

## Rollback

If any production smoke test or monitoring check fails:

1. Stop new writes if necessary.
2. Restore the production `DATABASE_URL` to the verified PostgreSQL connection.
3. Redeploy/restart the application.
4. Verify checkout and admin order access.
5. Preserve the MongoDB database for investigation; do not delete it during the rollback window.

## Important migration invariants

- Existing IDs remain unchanged for normal models.
- Composite-key join models receive deterministic IDs derived from their logical key pair.
- Migration checksums are calculated over canonicalized rows sorted by ID, so export ordering cannot create a false match/mismatch.
- The staging import may use `--replace-target`; production must not.
