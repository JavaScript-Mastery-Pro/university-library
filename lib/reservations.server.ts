import dayjs from "dayjs";
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/database/drizzle";
import { books, reservations } from "@/database/schema";
import { workflowClient } from "./workflow";
import config from "./config";

// Server-only reservation mutation helpers (ADR 0002). NOT a "use server" module
// and NOT client-safe — it imports `db` and `workflowClient`. Kept separate from
// `lib/reservations.ts` (pure display helpers, imported by client components) so
// the DB/workflow code never leaks into a client bundle.

/**
 * A copy has just been freed for `bookId` (a return, a cancelled READY hold, or
 * an expired hold). Hand it to the front of the queue, or release it to the
 * pool if the queue is empty (ADR 0002 RECOMMEND D + invariant #10).
 *
 * Concurrency-safe (RECOMMEND G): the QUEUED → READY transition is a guarded
 * UPDATE, so two callers freeing two copies at once can never promote the same
 * row — the loser re-reads and promotes the next in line. Only when no QUEUED
 * row remains is `availableCopies` incremented. Exactly one of {promote, release}
 * happens per freed copy, so held-copy accounting never drifts.
 */
export async function promoteNextOrReleaseCopy(bookId: string) {
  // Loop to absorb lost races: if our guarded promotion affects zero rows,
  // another caller already took that QUEUED row — try the next oldest.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [next] = await db
      .select({ id: reservations.id, userId: reservations.userId })
      .from(reservations)
      .where(
        and(
          eq(reservations.bookId, bookId),
          eq(reservations.status, "QUEUED")
        )
      )
      .orderBy(asc(reservations.createdAt))
      .limit(1);

    // Queue empty — release the freed copy back to the pool.
    if (!next) {
      await db
        .update(books)
        .set({ availableCopies: sql`${books.availableCopies} + 1` })
        .where(eq(books.id, bookId));

      return { promoted: null as null };
    }

    const expiresAt = dayjs()
      .add(config.reservations.holdWindowHours, "hour")
      .toDate();

    const [promoted] = await db
      .update(reservations)
      .set({ status: "READY", expiresAt })
      // Guard on the prior status: only one concurrent caller wins this row.
      .where(
        and(
          eq(reservations.id, next.id),
          eq(reservations.status, "QUEUED")
        )
      )
      .returning();

    // Lost the race for this row — re-read and try the next in line.
    if (!promoted) continue;

    // Held copy: `availableCopies` is intentionally left untouched (the copy is
    // reserved for this user, not back in the pool). Kick off the hold-expiry
    // workflow (READY email → reminder → expire). The route is built in the
    // reservations workflow sub-task; the trigger is part of this on-vacate hook.
    await workflowClient.trigger({
      url: `${config.env.prodApiEndpoint}/api/workflow/reservation-hold`,
      body: {
        reservationId: promoted.id,
        userId: promoted.userId,
        bookId,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return { promoted };
  }
}
