# University Library

## Stack

- **Language / Runtime**: TypeScript, Node 22
- **Framework**: Next.js 15.1 (App Router, Turbopack in dev), React 19
- **Key dependencies**: Drizzle ORM + Neon serverless Postgres, NextAuth v5 beta (JWT sessions, credentials-only), Upstash Redis + Ratelimit + Workflow/QStash, ImageKit (media storage), Tailwind CSS + Radix UI + shadcn/ui, Zod + react-hook-form
- **Package manager**: npm 11

## Commands

```bash
# Install
npm install

# Dev server (Turbopack)
npm run dev

# Build
npm run build

# Lint
npm run lint

# Seed database
npm run seed

# Drizzle: generate migration
npm run db:generate

# Drizzle: run migrations
npm run db:migrate

# Drizzle: open studio
npm run db:studio
```

## ADRs

No `docs/adr/` directory exists yet.

## Rules

- All server actions live in `lib/actions/` (public) or `lib/admin/actions/` (admin-only); every file must start with `"use server"`.
- Environment variables are centralised in `lib/config.ts` — never import `process.env` directly outside that file.
- Rate-limiting via Upstash is applied in server actions (auth flows); exceeding the limit redirects to `/too-fast`.
- Auth is credential-only (email + bcrypt password). Sessions are JWT; the `id` and `name` are propagated into `session.user`.
- Admin gate is enforced in `app/admin/layout.tsx` by a live DB role check — `role === "ADMIN"` required; do not rely on the session token alone.
- Global types (`User`, `Book`, `BorrowRecord`, etc.) live in `types.d.ts` at the root — use them instead of duplicating interfaces.
- `next.config.ts` sets `ignoreBuildErrors: true` and `ignoreDuringBuilds: true` — do not rely on the build to catch type or lint errors; run them explicitly.
- Media (book covers, videos, university ID cards) is stored on ImageKit; use `imagekitio-next` components or the `imagekit` SDK for uploads.
- Post-action workflows (onboarding emails, borrow confirmations) are triggered via Upstash Workflow (`workflowClient.trigger`) pointing to `/api/workflow/*` routes.
- Pagination across all list views defaults to 20 items per page (`ITEMS_PER_PAGE = 20` in `lib/actions/book.ts`).

## Context files

- [database/AGENTS.md](database/AGENTS.md) — Drizzle schema, Neon Postgres connection, Redis client, and seed script
- [lib/AGENTS.md](lib/AGENTS.md) — server actions, ratelimit, workflow/email, config, and validations
- [app/admin/AGENTS.md](app/admin/AGENTS.md) — admin area routing, auth gate, and admin-specific conventions
