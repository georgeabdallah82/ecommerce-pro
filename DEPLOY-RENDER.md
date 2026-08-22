# Render deployment

This build uses PostgreSQL instead of SQLite and includes a Render Blueprint.

1. Push the project to GitHub.
2. In Render, choose **New -> Blueprint** and select the repository.
3. Render reads `render.yaml`, creates the web service and Postgres database, and wires `DATABASE_URL` automatically.
4. Set `SEED_ADMIN_PASSWORD` in the Render dashboard when prompted.
5. After the first deploy, open the service URL.

The Blueprint uses Free instances for testing. Render currently states that Free Postgres databases expire after 30 days and have a 1 GB limit; upgrade the database before using it as a real production store.

## Database initialization

The app uses `prisma db push` for the initial schema because this project is being prototyped. For a production launch, switch to reviewed Prisma migrations (`prisma migrate deploy`) before changing the schema in a live database.

## Important storage note

The current media upload route writes files to the local filesystem. Render Free web services do not provide persistent local storage, so uploaded media should later be moved to object storage (S3/R2/etc.) before production.
