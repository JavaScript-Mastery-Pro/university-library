# 0002. Book reservations as a queue with held copies

**Date**: 2026-06-29
**Status**: Proposed

## Context

> ⚠️ Premise note: Three load-bearing risks to name upfront.
> (1) **Stranded inventory**: A `READY` reservation will NOT auto-flip to `EXPIRED` without the
> Upstash Workflow run completing. If the run is lost or fails, `availableCopies` stays 0
> indefinitely — a copy held for nobody. The borrow gate and the Reserve button must treat
> `READY AND expiresAt < now` as expired at read time (never trust the enum alone), and a
> reconciliation sweep is a mandatory follow-up.
> (2) **Held-copy accounting is the single load-bearing invariant**: an error here either
> strands copies (held forever at 0) or leaks them (two users borrow one held copy). Every
> branch — borrow, return, cancel, expire — must be guarded at the UPDATE level.
> (3) **`availableCopies = 0` is the sole signal** gating the Reserve button; any borrow/return
> drift silently breaks reservations. Compliance note: reservation records are FERPA-adjacent
> education records; ownership must be enforced server-side against the session on every
> mutation — never trust a client-supplied `userId`.

Students cannot currently join a waiting list when a book is fully borrowed out. The result is
a manual, ad-hoc process that is opaque, unauditable, and unfair. The library needs a
first-come-first-served queue that holds a copy exclusively for the next student when a borrow
is returned, notifies via email, and releases the hold if not acted on within a fixed window.

Constraints: stay within the existing stack (Drizzle + Neon + Upstash Workflow + server
actions); minimize new infrastructure; enforce strict auth and ownership; block students with
outstanding obligations from joining the queue (reusing ADR 0001's borrow-gate predicate).

## Options considered

### Option 1: Dedicated `reservations` table + Upstash Workflow per hold (chosen)

A new `reservations` table with a `reservation_status` pgEnum (QUEUED, READY, FULFILLED,
EXPIRED, CANCELLED) tracks the full lifecycle. On return, `returnBook` promotes the next
QUEUED row to READY (held copy, `availableCopies` stays 0) and triggers a per-reservation
Upstash Workflow run that sends a READY email, sleeps to the reminder point, sends an
expiry-soon email, sleeps to window end, then atomically expires the reservation and promotes
the next in queue if not yet FULFILLED.

**Pros**:
- Full lifecycle auditability; state is explicit and queryable
- Upstash Workflow mirrors the existing `/api/workflow/borrow-book` pattern exactly — no new infra
- Held-copy invariant is enforced in DB updates with status guards

**Cons**:
- Stranded-inventory risk if a workflow run is lost (mitigated by read-time expiry check, but a reconciliation cron remains an open follow-up)
- `borrowBook` and `returnBook` gain reservation-aware branches, increasing their complexity

### Option 2: Notify-only, first-come (no held copy)

Email the next user in queue when a copy is returned, but do not hold the copy — first student
to borrow wins. No `expiresAt`, no held-copy bookkeeping.

**Pros**:
- Simpler `availableCopies` accounting; no stranded-inventory risk
**Cons**:
- Race condition: multiple notified students compete; queue position is meaningless — not a fair queue

### Option 3: Overload `borrowRecords` with a RESERVED status

Add `RESERVED` to `borrow_status_enum` and store reservations as borrow records with a future
`borrowDate`.

**Pros**:
- No new table; one migration
**Cons**:
- Semantic pollution of a table designed for actual borrows; makes every borrow-gate query more complex; queue position and `expiresAt` are conceptually foreign to a borrow record

## Decision

**Chosen option**: Option 1 — Dedicated `reservations` table with Upstash Workflow per hold

A separate table with an explicit status enum, application-level promotion inside `returnBook`, and per-reservation Upstash Workflow runs enforces a fair, auditable, held-copy queue without new infrastructure.

## Rationale

Option 2 fails the fairness requirement (queue position is meaningless without a held copy).
Option 3 pollutes the borrow schema and makes the gate query unreadable. Option 1 is the only
design that delivers a correct queue, stays within the existing stack, and is fully auditable.

**A — Queue position (derived, not stored)**: Rank is computed at read time via ordered query
on `(book_id, status, created_at)` — consistent with ADR 0001's "compute-at-read" principle
and avoids reorder races on every cancel/expire. Runner-up: stored `position` integer (rejected
— requires atomic reordering across multiple rows on every cancel/expire, creating a race
window and extra writes).

**B — Hold-expiry mechanism (per-reservation Upstash Workflow)**: A `/api/workflow/reservation-hold`
route mirrors `/api/workflow/borrow-book` exactly: `context.run` steps with `context.sleep`
between staged emails (READY email → sleep to reminder point → expiry-soon email → sleep to
window end → atomic expire + promote). No cron infra exists; the Workflow approach is the
boring-tech-consistent choice. Caveat: the enum can lie if the run is lost — the borrow gate
MUST treat `READY AND expiresAt < now` as expired (lazy fallback, same as ADR 0001's OVERDUE
caveat). Runner-up: cron job (rejected — no scheduled-job infrastructure exists; adds new infra
complexity).

**C — Promotion trigger (application-level in `returnBook`)**: The project has no Postgres DB
triggers; all post-action side effects use `workflowClient.trigger` from within server actions.
Promotion logic lives inside `returnBook` as an application-level step immediately after the
return UPDATE commits. Runner-up: Postgres DB trigger (rejected — inconsistent with project
convention, not observable in application code, and requires direct DDL outside Drizzle).

**D — Held-copy accounting (canonical)**:
- **Return with active queue**: do NOT increment `availableCopies`; promote next QUEUED → READY
  with `expiresAt = now + 48h`; trigger `/api/workflow/reservation-hold`.
- **READY user borrows**: `borrowBook` ALLOWS borrow despite `availableCopies = 0` for the
  front-of-queue READY user only (verified by a `reservations` query); mark reservation
  FULFILLED; do NOT decrement `availableCopies` (held copy becomes the borrowed copy).
- **READY hold EXPIRES or CANCELLED**: promote next QUEUED → READY (copy stays held at 0); if
  queue is now empty, release: `availableCopies += 1`.
- **Return with empty queue**: increment `availableCopies` as today.
Runner-up: always increment on return and decrement on borrow (rejected — creates a window
where `availableCopies > 0` and two students can both borrow what should be a held copy).

**E — Uniqueness (partial unique index)**: Enforce no duplicate active reservation via a
partial unique index on `(user_id, book_id)` WHERE `status IN ('QUEUED', 'READY')`. Drizzle
syntax: `uniqueIndex('reservations_active_unique').on(table.userId, table.bookId).where(sql\`status IN ('QUEUED','READY')\`)`. Runner-up: application-level check (rejected — subject to TOCTOU race).

**F — Config block**: Add `config.reservations` to `lib/config.ts` (not `.env`):
`holdWindowHours: 48`, `maxActiveReservations: 5`, `reminderBeforeHours: 24`. The reminder
fires at the 24h-remaining mark — halfway through the window, giving ample warning without
spamming. Runner-up: module-level constants in a separate file (rejected — adds a second import
convention for domain constants alongside `config`).

**G — Concurrency guards**: All promotion and borrow-from-READY updates use guarded UPDATEs:
- Promotion: `UPDATE reservations SET status='READY', expiresAt=... WHERE id=<next> AND status='QUEUED'`
- Borrow from hold: `UPDATE reservations SET status='FULFILLED' WHERE id=<id> AND userId=<session> AND status='READY'`
- Expire: `UPDATE reservations SET status='EXPIRED' WHERE id=<id> AND status='READY'`
Only one concurrent caller can win each guarded UPDATE; zero-rows-affected means another caller
won, and the action returns an appropriate error. Mirrors `returnBook`'s existing
`WHERE status != 'RETURNED'` pattern.

## Feature design

**Data model sketch**:

New pgEnum in `database/schema.ts`:
```
RESERVATION_STATUS_ENUM = pgEnum("reservation_status", ["QUEUED","READY","FULFILLED","EXPIRED","CANCELLED"])
```

New `reservations` table:
```
id            uuid pk default random()
userId        uuid FK users  not null
bookId        uuid FK books  not null
status        reservation_status_enum not null default 'QUEUED'
createdAt     timestamptz not null default now()
expiresAt     timestamptz null  -- set only when status transitions to READY
```

Indexes:
- Partial unique index on `(user_id, book_id)` WHERE `status IN ('QUEUED','READY')` — dedup (RECOMMEND E)
- Composite index on `(book_id, status, created_at)` — queue ordering and position derivation

**State transitions**:

```
QUEUED  → READY      : returnBook promotes next in queue (app-level); expiresAt = now + 48h; workflow triggered
READY   → FULFILLED  : borrowBook by the READY user (guarded UPDATE); availableCopies unchanged
READY   → EXPIRED    : workflow run reaches window end without FULFILLED; promote next or release copy
READY   → CANCELLED  : user cancels READY hold; promote next or release copy
QUEUED  → CANCELLED  : user cancels while waiting; no copy accounting change
EXPIRED / FULFILLED / CANCELLED : terminal — no further transitions
```

**API surface**:

| Action / Route | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|
| `reserveBook({bookId})` | bookId | reservation record | session (server-side userId) | book has copies (must borrow directly); already reserved; currently holds book; obligation gate (unpaid fine / overdue); max 5 active; account not APPROVED |
| `cancelReservation({reservationId})` | reservationId | updated record | session + ownership check | not found; not owner; status not QUEUED or READY |
| `getUserReservations(userId)` | userId | reservations with derived queue position | session (own) or ADMIN | — |
| `returnBook` (modified) | recordId | updated borrow record | session + ownership | promotes next QUEUED → READY; triggers workflow; releases copy only if queue empty |
| `borrowBook` (modified) | bookId | new borrow record | session | allows READY user when availableCopies=0; marks reservation FULFILLED; does not decrement copies |
| `POST /api/workflow/reservation-hold` | reservationId, userId, bookId, expiresAt | — (workflow steps) | Upstash Workflow token | READY email → sleep 24h → expiry-soon email → sleep 24h → expire + promote |

**Key invariants**:

1. `availableCopies` never goes negative and never exceeds `totalCopies`
2. At most one READY reservation per book at any time (enforced by promotion logic: only one is promoted per return)
3. A READY reservation past `expiresAt` is treated as EXPIRED everywhere (borrow gate, Reserve button visibility, queue position queries) — never trust the enum alone
4. Only the front-of-queue READY user may borrow a held copy (`availableCopies = 0`) — verified by guarded UPDATE on their specific reservation row
5. A student cannot reserve a book they currently hold (`borrowRecords` WHERE `userId AND bookId AND status != 'RETURNED'` must return zero rows)
6. A student cannot reserve a book with `availableCopies > 0` — they must borrow directly
7. No duplicate active reservation for the same (userId, bookId) — enforced by partial unique index
8. Max 5 active (QUEUED + READY) reservations per user — enforced in `reserveBook` before insert
9. Obligation gate blocks reservation: any `fineStatus = 'UNPAID'` OR any `status != 'RETURNED' AND dueDate < today` for the user (reuses ADR 0001 predicate exactly)
10. When a READY hold EXPIRES or is CANCELLED: if the queue is empty, `availableCopies += 1`; otherwise the next QUEUED is promoted (copy stays held at 0)
11. All reservation lifecycle transitions that touch held inventory must be logged (audit requirement — FERPA-adjacent records)

**Security model**:

- All mutations (`reserveBook`, `cancelReservation`, `borrowBook` READY branch, `returnBook` promotion) derive `userId` exclusively from `session.user.id` — never from request body or query params
- `cancelReservation` verifies ownership: `WHERE id = reservationId AND userId = session.user.id`
- Account must be `status = 'APPROVED'` before placing a reservation (checked in `reserveBook`)
- `getUserReservations` for another user requires `role = 'ADMIN'` (admin gate)
- Reservation records are FERPA-adjacent education records; lifecycle state changes (QUEUED → READY, READY → FULFILLED/EXPIRED/CANCELLED) must be auditable — log transitions in application code before the workflow fires
- `/api/workflow/reservation-hold` is called only by Upstash QStash; validate the `Upstash-Signature` header via the `serve` wrapper (same as `/api/workflow/borrow-book`)

**Configuration required**:

Add a `reservations` block to `lib/config.ts` (not `.env` — these are domain constants, not secrets):
```ts
reservations: {
  holdWindowHours: 48,
  maxActiveReservations: 5,
  reminderBeforeHours: 24,
}
```
No new environment variables are needed; the feature reuses existing Upstash, QStash, and Resend credentials from `config.env`.

**Acceptance criteria**:

- Reserve button is shown only when `availableCopies = 0` AND the user has no active reservation for the book AND the user does not currently hold the book
- `reserveBook` is blocked when user has an unpaid fine or an overdue unreturned book
- `reserveBook` is blocked when user already has 5 active (QUEUED + READY) reservations
- `reserveBook` is blocked when `availableCopies > 0` (error: "book is available — please borrow directly")
- On return, the next QUEUED user's reservation flips to READY; `availableCopies` stays 0; READY email is sent
- READY user receives expiry-soon email at the 24h-remaining mark
- READY user who borrows: borrow succeeds despite `availableCopies = 0`; reservation status = FULFILLED; `availableCopies` unchanged
- READY reservation not acted on in 48h: status flips to EXPIRED; next QUEUED promoted (or copy released if queue empty)
- User cancels a READY reservation: next QUEUED promoted (or copy released if queue empty)
- Profile page lists user's reservations with status and derived queue position

**Critical test scenarios**:

- Happy path: student reserves → receives QUEUED status; another book returned → status READY; student borrows within 48h → FULFILLED, copy not double-counted
- Full queue: 3 students in queue; first READY cancels → second promotes to READY; `availableCopies` stays 0
- Empty queue on READY expiry: only one queued student; hold expires → `availableCopies += 1`; book appears available
- Obligation gate: student with unpaid fine calls `reserveBook` → rejected; fine cleared → `reserveBook` succeeds
- Concurrency: two concurrent `returnBook` calls for the same book with one QUEUED student → one wins the guarded QUEUED→READY UPDATE; second finds zero rows and skips promotion
- Concurrency: READY user and workflow expire run race → only one wins the guarded READY→FULFILLED vs READY→EXPIRED UPDATE
- Stranded-inventory guard: `READY` reservation with `expiresAt < now` exists in DB; `borrowBook` by another user → treated as no active READY reservation; copy available for hold to next QUEUED or release
- Auth/permission: `cancelReservation` called with another user's reservationId → ownership check rejects; unapproved account calls `reserveBook` → rejected

## Consequences

**Positive**:
- Fair, auditable, first-come-first-served queue with exclusive copy hold — students can trust their position
- No new infrastructure; Upstash Workflow pattern is directly reused from the borrow-book workflow
- ADR 0001 obligation gate is reused without modification — consistent enforcement

**Negative / tradeoffs**:
- Stranded-inventory risk if a Workflow run is lost: `availableCopies` stays 0 indefinitely; mitigated by read-time expiry check but not eliminated without a reconciliation cron (follow-up)
- `borrowBook` and `returnBook` gain reservation-aware branches — more complex, more test surface
- The `READY` enum value can lie (past `expiresAt` but not yet flipped) — every read path that uses reservation status must apply the expiry check
- `db:generate` + `db:migrate` required; new `reservations` table and `reservation_status` pgEnum must be deployed before any code goes live

**Neutral**:
- `types.d.ts` additions: `Reservation` interface, `ReservationStatus` type, `ReserveBookParams`, `CancelReservationParams`
- New server action file: `lib/actions/reservation.ts`
- New workflow route: `app/api/workflow/reservation-hold/route.ts`

## Follow-up

- [ ] Reconciliation job/cron to sweep stale `READY` reservations past `expiresAt` and release or promote — defense-in-depth for lost Workflow runs (addresses the stranded-inventory risk named in the Premise note)
- [ ] Composite index on `(book_id, status, created_at)` in `reservations` for efficient queue ordering — add at migration time
- [ ] Admin view: list all active queues per book with queue depth and per-user position
- [ ] Notify users of position changes when someone ahead of them cancels (optional UX improvement)
- [ ] Consider displaying "N students waiting" on the book detail page to set expectations
- [ ] When the borrow window is extended (e.g. renewals added), ensure `expiresAt` on READY reservations is not affected by the upstream borrow's due-date change
