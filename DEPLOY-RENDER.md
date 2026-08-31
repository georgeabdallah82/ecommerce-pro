# Render deployment

Production now targets MongoDB. The repository keeps the PostgreSQL source database and backup available until the migration is fully signed off.

## Standard deployment

The application can run from the repository or from the prebuilt Docker image published to GitHub Container Registry (GHCR). The image-backed path is useful when Render build-pipeline minutes are exhausted because Render pulls the already-built image instead of rebuilding the repository on Render.

For the image-backed path, Render supports private GitHub Container Registry images with a workspace registry credential. The production image is built for `linux/amd64` and is tagged with both `main` and the Git commit SHA.

### Production environment

Set these variables in the Render web service:

- `DATABASE_URL`: verified MongoDB production URI, including the `ecommerce_production` database name.
- `AUTH_SECRET`: the existing strong production secret.
- `CRON_SECRET`: the existing strong production secret.
- `PAYMENT_WEBHOOK_SECRET`: the existing strong production secret.
- `NEXT_PUBLIC_SITE_URL`: the canonical HTTPS production URL.
- Other application secrets and public configuration required by the service.

Do not place production secrets in GitHub source files, Docker build arguments, or the container image. The Docker build uses only a non-production placeholder for build-time static analysis; Render injects the real runtime secret.

## Health verification

After a production deploy, verify:

1. `/api/health` returns HTTP 200 and reports the database as reachable.
2. `/api/products` returns the expected migrated catalog.
3. `/api/navigation` and `/api/store/settings` return successfully.
4. Login/authentication works with the production secret.
5. A read-only admin/system health check succeeds.
6. The production logs show MongoDB startup verification and no PostgreSQL connection attempt.

## Rollback

Keep the PostgreSQL database and the fresh `pg_dump` backup until the MongoDB production deployment has passed the smoke test, business reconciliation, and an observation window. Do not delete the PostgreSQL source as part of the initial cutover.

## Storage note

The current media upload route writes files to the local filesystem. Render Free web services do not provide persistent local storage, so uploaded media should later be moved to object storage (S3/R2/etc.) before production use.
