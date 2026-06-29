# database/

## Overview

Owns the Drizzle ORM schema, the Neon serverless Postgres client, the Upstash Redis client, and the seed script. Every table definition and every DB/cache connection for the app starts here.

## Key files

| File | Owns |
|---|---|
| `database/schema.ts` | All Drizzle table definitions and pg enums (`users`, `books`, `borrowRecords`) |
| `database/drizzle.ts` | Neon HTTP client + `db` export used by all server actions |
| `database/redis.ts` | Upstash Redis client export used by ratelimit and auth adapter |
| `database/seed.ts` | One-shot script to populate books; run via `npm run seed` |
| `drizzle.config.ts` | Drizzle Kit config (points to `migrations/` dir) |
| `migrations/` | Auto-generated SQL migration files — do not edit by hand |

## Commands

```bash
# Generate a new migration after schema changes
npm run db:generate

# Apply pending migrations
npm run db:migrate

# Open Drizzle Studio (browser UI over the DB)
npm run db:studio

# Seed books data
npm run seed
```

## Conventions

- All table columns use `uuid` primary keys with `defaultRandom()` — never insert your own ID.
- `borrowRecords.dueDate` is a `date` string (not timestamp); `borrowDate`/`createdAt` are `timestamp with timezone`.
- `borrowRecords.fineAmount` is `numeric(10,2)` (null until finalized at return); `fineStatus` is `fine_status_enum` (never null, default 'NONE'); `fineSettledAt` is `timestamp with timezone` (set only when admin marks PAID or WAIVED) — see ADR 0001.
- Enums are defined in `schema.ts` as `pgEnum` and referenced as column types — add new enum values there, then generate a migration.
- `db` is imported from `@/database/drizzle`; never instantiate a second Drizzle client.
- `redis` is imported from `@/database/redis`; never instantiate a second Redis client.

## Gotchas

- The Neon client uses the HTTP (serverless) driver, not the WebSocket driver — do not use `drizzle-orm/neon-serverless` here.
- Migrations are cumulative SQL files in `migrations/`. After editing `schema.ts`, always run `db:generate` before `db:migrate` — do not write migration SQL manually.
- `seed.ts` uses `dotenv` to load `.env` directly (not `.env.local`) — make sure `DATABASE_URL` is set in `.env` when seeding.
