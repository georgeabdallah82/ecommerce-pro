FROM node:22.23.2-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

FROM node:22.23.2-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NETLIFY=
RUN node scripts/build-compat-fix.mjs && \
    node scripts/finalization-fix.mjs && \
    node scripts/focal-finalization-fix.mjs && \
    node scripts/finalization-assert.mjs && \
    node scripts/final-ts-fix.mjs && \
    node scripts/backend-audit.mjs && \
    node scripts/prepare-mongodb-schema.mjs && \
    npx prisma generate --schema=prisma/mongodb-schema && \
    npm run typecheck && \
    npx next build

FROM node:22.23.2-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app ./
EXPOSE 10000
CMD ["sh", "-c", "node scripts/verify-production-database.mjs && npx next start -H 0.0.0.0 -p ${PORT:-10000}"]
