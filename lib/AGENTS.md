# lib/

## Overview

Contains all server-side business logic: server actions (public and admin), environment config, rate limiting, Upstash Workflow/email helpers, and Zod validation schemas. Nothing in `lib/` renders UI.

## Key files

| File | Owns |
|---|---|
| `lib/config.ts` | Single source of truth for all `process.env` values — used everywhere; includes `fines` block for late-fine domain constants |
| `lib/validations.ts` | Zod schemas: `signUpSchema`, `signInSchema`, `bookSchema` |
| `lib/ratelimit.ts` | Upstash Ratelimit instance (fixed window, 50 req/min per IP) |
| `lib/workflow.ts` | `workflowClient` (Upstash Workflow), `qstashClient`, `sendEmail` helper |
| `lib/utils.ts` | General utilities (`cn` class merger, etc.) |
| `lib/fines.ts` | Pure late-fine helpers (ADR 0001): `computeFine`, `getLiveFine`, `getFineDisplay`, `formatFine`, `formatFineSpoken` |
| `lib/actions/auth.ts` | `signUp` and `signInWithCredentials` server actions |
| `lib/actions/book.ts` | `borrowBook` (with fine-gate check), `returnBook` (with fine finalization), `getBorrowedBooks`, `searchBooks` server actions |
| `lib/admin/actions/book.ts` | Admin server actions for book CRUD; includes `markFinePaid` and `waiveFine` for fine settlement |
| `lib/admin/actions/user.ts` | Admin server actions for user management |
| `lib/admin/actions/general.ts` | Admin server actions for dashboard stats and cross-entity queries |

## Conventions

- Every file in `lib/actions/` and `lib/admin/actions/` must have `"use server"` as its first line.
- Always import env values via `config` from `lib/config.ts`, never `process.env` directly.
- Late-fine domain constants (rate, grace period, max fine, currency) live in `config.fines` block in `lib/config.ts` — do NOT put them in `.env`.
- Rate-limit all user-facing auth actions: call `ratelimit.limit(ip)` at the top; redirect to `/too-fast` on failure.
- Server actions return `{ success: true, data }` or `{ success: false, error: string }` — never throw to the caller.
- Trigger post-action workflows (emails, notifications) via `workflowClient.trigger(...)` pointing to `/api/workflow/<name>`. The workflow endpoint must be publicly reachable (use `NEXT_PUBLIC_PROD_API_ENDPOINT` in production).
- `sendEmail` uses QStash + Resend under the hood — do not call Resend directly.
- Fine computation via `computeFine` is the single authoritative source for both finalized amounts (at return) and live accrual (display) — the formula and path must never diverge (ADR 0001).

## Gotchas

- `workflowClient` uses `QSTASH_URL` + `QSTASH_TOKEN`; the workflow API routes (`/api/workflow/*`) must be deployed publicly for QStash to call back — local triggers will fail unless you use a tunnel (ngrok, etc.).
- `NEXT_PUBLIC_PROD_API_ENDPOINT` differs from `NEXT_PUBLIC_API_ENDPOINT`; the former is always the deployed URL used for workflow callbacks, even in local dev.
