# Feature Roadmap

_Seeded by /mvp · status advanced by /develop and /sync. Roadmap files live in `docs/mvp/` (ADRs are in `docs/adr/`)._

_This is the **next slice** on an existing app: theme = **complete the borrowing lifecycle**. Foundations (stack, design system, NextAuth, Drizzle/Neon schema, admin shell, email workflows, ratelimit, ImageKit, search/sort/pagination) are already built and enrolled below as `existing`._

## Overview

| #  | Feature | Priority | Needs ADR? | Status | Code area |
|----|---------|----------|-----------|--------|-----------|
| —  | Authentication (sign-in/up, JWT, bcrypt) | — | — | existing | `app/(auth)/`, `auth.ts`, `lib/actions/auth.ts` |
| —  | Book catalog & browsing (library + detail) | — | — | existing | `app/(root)/library`, `app/(root)/books/[id]`, `lib/actions/book.ts` |
| —  | Home page (latest books) | — | — | existing | `app/(root)/page.tsx` |
| —  | Borrow flow + email reminders | — | — | existing | `lib/actions/book.ts`, `app/api/workflow/borrow-book` |
| —  | User profile (my-profile) | — | — | existing | `app/(root)/my-profile` |
| —  | Search · Sort · Pagination (20/page) | — | — | existing | `components/{Search,Sort,Pagination}.tsx` |
| —  | Onboarding / engagement emails | — | — | existing | `lib/workflow.ts`, `app/api/workflow/onboarding` |
| —  | Rate limiting (Upstash) | — | — | existing | `lib/ratelimit.ts` |
| —  | ImageKit media uploads | — | — | existing | `components/FileUpload.tsx`, `app/api/auth/imagekit` |
| —  | Admin: books (list/new/edit/detail) | — | — | in-progress | `app/admin/books/*`, `lib/admin/actions/book.ts` |
| —  | Admin: users (list + role) | — | — | in-progress | `app/admin/users`, `lib/admin/actions/user.ts` |
| —  | Admin: account requests | — | — | existing | `app/admin/account-requests` |
| —  | Admin: borrow records | — | — | existing | `app/admin/borrow-records` |
| —  | Admin: dashboard | — | — | existing | `app/admin/page.tsx` |
| 1  | Self-return books | P0 | no | in-progress | `lib/actions/book.ts`, `components/ReturnBook.tsx`, `components/BookCard.tsx` |
| 2  | Late fines | P0 | yes | planned | — |
| 3  | Reservations / waitlist | P0 | yes | planned | — |
| 4  | Reviews & ratings | P1 | yes | planned | — |
| 5  | Wishlist / favorites | P1 | yes | planned | — |
| 6  | Password reset | P1 | yes | planned | — |
| 7  | Admin: book & user delete | P1 | yes | planned | — |
| 8  | Admin: user detail & edit page | P1 | yes | planned | — |
| 9  | SEO for public pages | P1 | no | planned | — |
| 10 | Accessibility audit (AA) | P1 | no | planned | — |

_Granular by design: self-return, fines, reservations, reviews and wishlist are separate features — each shippable on its own. Admin delete and admin user-detail are separate from the existing admin list pages they extend._

> **`existing`** features predate this workflow and have no build breakdown. **`in-progress`** admin features are functionally there but have known gaps (no delete, no user-detail) — those gaps are picked up as planned features #7 and #8 rather than rebuilding the page.

## Build order (UI-first, layered)

Foundations already exist, so this slice starts at the decision layer.

**Phase 1 — Decisions (ADRs)**: fines (#2) → reservations (#3) → reviews (#4) → wishlist (#5) → password reset (#6) → admin delete (#7) → admin user-detail (#8). Self-return (#1) needs none.
**Phase 2 — All UI (placeholder data)**: self-return button → fines display → reserve button + my-reservations → review form + list → wishlist toggle + page → reset-password pages → admin delete dialogs → admin user-detail page. Every new screen browsable against mock data first.
**Phase 3 — Data model (Drizzle migrations)**: fine columns on `borrowRecords`; new tables `reservations`, `reviews`, `wishlist`, `passwordResetTokens`. One `npm run db:generate` + `db:migrate` per ADR.
**Phase 4 — Backend + wire-up (feature by feature)**: self-return action → fine calc/finalize → reservation hold/queue + email → review CRUD + rating aggregate → wishlist toggle → reset-token issue/consume → admin delete actions → admin user-detail queries. Swap each page's placeholder for real data here.
**Phase 5 — SEO & accessibility**: SEO on home/library/book-detail (#9) → AA audit sweep on new + existing UI (#10) → `/harden` on password reset (auth-touching).
_Deferred (not this slice): in-app notification center, automated test suite, product analytics, payments for fines._

## Build breakdown

### 1. Self-return books  ·  Needs ADR: no  ·  Status: in-progress
Extends existing `borrowRecords` (already has `returnDate`/`status`) and the borrow action — no new decision.
- [x] UI (placeholder data) — `/develop self-return UI — add "Return book" button + confirm dialog to the borrowed-books list in app/(root)/my-profile, with returning/returned/error states using placeholder data`
- [x] Backend & API — `/develop self-return action — returnBook server action in lib/actions/book.ts: set status=RETURNED + returnDate=now, increment books.availableCopies, guard caller owns the record and it is not already returned`
- [x] Data integration — `/develop self-return wire-up — swap placeholder for real returnBook in my-profile, revalidate path, loading/error/empty states`
- [ ] Validation & edge cases — `/develop self-return edge cases — double-return, returning another user's record, availableCopies not exceeding totalCopies, OVERDUE record finalizing its fine (after #2)`
- [x] Accessibility — `/develop self-return a11y — dialog focus trap, button labelling, status announced via aria-live`
> ADR: — · Code area: `lib/actions/book.ts` (returnBook + `revalidatePath`), `components/ReturnBook.tsx`, `components/BookCard.tsx`

### 2. Late fines  ·  Needs ADR: yes  ·  Status: planned
- [x] Decision (ADR) — `/architect late fines — data model (fine columns on borrowRecords vs separate fines table), per-day rate + config location, when fine is computed (on return vs scheduled), payment tracking (admin mark-paid, no payment provider this slice)`
- [ ] UI (placeholder data) — `/develop late fines UI — show owed amount + paid badge on my-profile borrowed list and admin borrow-records, with placeholder amounts`
- [ ] Data model — `/develop late fines data model — add fine fields per ADR (e.g. fineAmount, finePaid, finePaidAt) via npm run db:generate + db:migrate`
- [ ] Backend & API — `/develop late fines API — fine calculation helper (days overdue × rate), finalize on return, admin markFinePaid action in lib/admin/actions/book.ts`
- [ ] Data integration — `/develop late fines wire-up — replace placeholder amounts with computed/stored values, revalidate`
- [ ] Validation & edge cases — `/develop late fines edge cases — cap on max fine, returned-before-due (no fine), timezone in dueDate diff, rounding`
- [ ] Accessibility — `/develop late fines a11y — currency/amount readable by screen readers, paid badge has text label`
> ADR: [0001](../adr/0001-late-fines-on-borrow-records.md) · Code area: —

### 3. Reservations / waitlist  ·  Needs ADR: yes  ·  Status: planned
- [ ] Decision (ADR) — `/architect reservations — new reservations table (userId, bookId, status QUEUED/READY/EXPIRED/FULFILLED, createdAt, expiresAt), queue position, trigger to notify next user on return, hold expiry window, eligibility (can't reserve a book you hold)`
- [ ] UI (placeholder data) — `/develop reservations UI — "Reserve" button on book detail when availableCopies=0, plus a "My reservations" section in my-profile, placeholder queue data + states`
- [ ] Data model — `/develop reservations data model — create reservations table per ADR via npm run db:generate + db:migrate`
- [ ] Backend & API — `/develop reservations API — reserveBook / cancelReservation actions, queue-position query, on-return hook to promote next reservation to READY`
- [ ] External integration — `/develop reservations workflow — Upstash Workflow route to email the READY user and expire the hold after the window, hooking lib/workflow.ts`
- [ ] Data integration — `/develop reservations wire-up — swap placeholder for real reservation data on book detail + my-profile`
- [ ] Validation & edge cases — `/develop reservations edge cases — duplicate reservation, reserving an available book, race on the freed copy, expired hold returns copy to pool`
- [ ] Accessibility — `/develop reservations a11y — reserve button states, queue position announced`
> ADR: — · Code area: —

### 4. Reviews & ratings  ·  Needs ADR: yes  ·  Status: planned
- [ ] Decision (ADR) — `/architect reviews — reviews table (userId, bookId, rating 1-5, body, createdAt), one-review-per-user-per-book, whether borrowing is required to review, how books.rating aggregate is recomputed, edit/delete + moderation`
- [ ] UI (placeholder data) — `/develop reviews UI — star input + review form and a reviews list with aggregate rating on app/(root)/books/[id], placeholder reviews + empty/loading states`
- [ ] Data model — `/develop reviews data model — create reviews table per ADR via npm run db:generate + db:migrate`
- [ ] Backend & API — `/develop reviews API — createReview / editReview / deleteReview actions, recompute + store aggregate rating on books`
- [ ] Data integration — `/develop reviews wire-up — replace placeholder reviews with real data + aggregate on book detail`
- [ ] Auth & permissions — `/develop reviews permissions — only authenticated (and per ADR, only borrowers) can post; users edit/delete own; admins can remove any`
- [ ] Validation & edge cases — `/develop reviews edge cases — duplicate review, rating bounds, XSS in body, deleted-book reviews`
- [ ] Accessibility — `/develop reviews a11y — accessible star rating (radio group), form errors linked to inputs`
> ADR: — · Code area: —

### 5. Wishlist / favorites  ·  Needs ADR: yes  ·  Status: planned
- [ ] Decision (ADR) — `/architect wishlist — wishlist table (userId, bookId, createdAt, unique pair), toggle semantics, where it surfaces (book card + detail + my-profile)`
- [ ] UI (placeholder data) — `/develop wishlist UI — heart/save toggle on BookCard + book detail and a "Saved books" section in my-profile, optimistic placeholder state`
- [ ] Data model — `/develop wishlist data model — create wishlist table per ADR via npm run db:generate + db:migrate`
- [ ] Backend & API — `/develop wishlist API — toggleWishlist action + getWishlist query in lib/actions/book.ts`
- [ ] Data integration — `/develop wishlist wire-up — real saved state across book card/detail/my-profile, empty state`
- [ ] Validation & edge cases — `/develop wishlist edge cases — toggle race, saving same book twice, unauthenticated save prompt`
- [ ] Accessibility — `/develop wishlist a11y — toggle button pressed state (aria-pressed), label reflects saved/unsaved`
> ADR: — · Code area: —

### 6. Password reset  ·  Needs ADR: yes  ·  Status: planned
- [ ] Decision (ADR) — `/architect password reset — token storage (passwordResetTokens table vs Redis), token hashing + expiry, email delivery via Resend/Upstash Workflow, ratelimit, route design under app/(auth)`
- [ ] UI (placeholder data) — `/develop password reset UI — "Forgot password" link + request-reset page and a reset-with-token page under app/(auth), reusing AuthForm patterns, with sent/success/expired states`
- [ ] Data model — `/develop password reset data model — create token store per ADR via npm run db:generate + db:migrate (if table-based)`
- [ ] Backend & API — `/develop password reset API — requestPasswordReset (issue + email token) and resetPassword (verify token, bcrypt new password) actions in lib/actions/auth.ts`
- [ ] External integration — `/develop password reset email — send reset link via the existing email setup in lib/workflow.ts`
- [ ] Validation & edge cases — `/develop password reset edge cases — expired/used/invalid token, unknown email (no enumeration), ratelimit to /too-fast, password policy`
- [ ] Accessibility — `/develop password reset a11y — form labels, error association, success focus management`
- [ ] Harden — `/harden password reset`
> ADR: — · Code area: —

### 7. Admin: book & user delete  ·  Needs ADR: yes  ·  Status: planned
Wires up the non-functional trash icons in `app/admin/books` and `app/admin/users`.
- [ ] Decision (ADR) — `/architect admin delete — soft vs hard delete for books and users, how to handle borrowRecords FK (block delete with active borrows vs cascade vs anonymize), confirmation UX`
- [ ] UI (placeholder data) — `/develop admin delete UI — wire trash icons to ConfirmationDialog on admin books + users tables, placeholder confirm/loading states`
- [ ] Data model — `/develop admin delete data model — add soft-delete column / adjust FK constraints per ADR via npm run db:generate + db:migrate (if needed)`
- [ ] Backend & API — `/develop admin delete API — deleteBook in lib/admin/actions/book.ts and deleteUser in lib/admin/actions/user.ts with the FK rules from the ADR`
- [ ] Data integration — `/develop admin delete wire-up — real delete actions + revalidate the admin lists`
- [ ] Auth & permissions — `/develop admin delete permissions — admin-only, block self-delete, block deleting users/books with active borrows per ADR`
- [ ] Validation & edge cases — `/develop admin delete edge cases — delete with active borrows/reservations, last admin deletion guard, idempotent re-delete`
> ADR: — · Code area: —

### 8. Admin: user detail & edit page  ·  Needs ADR: yes  ·  Status: planned
- [ ] Decision (ADR) — `/architect admin user detail — page composition (profile + ID card + borrow history + fines + reservations), which fields are admin-editable, route app/admin/users/[id]`
- [ ] UI (placeholder data) — `/develop admin user detail UI — build app/admin/users/[id] to the admin design with placeholder user, borrow history, fines and ID-card sections`
- [ ] Backend & API — `/develop admin user detail API — getUser(id) with borrow/fine/reservation aggregates and updateUser action in lib/admin/actions/user.ts`
- [ ] Data integration — `/develop admin user detail wire-up — link rows from admin users list, swap placeholder for real data, loading/empty states`
- [ ] Auth & permissions — `/develop admin user detail permissions — admin-only, editable-field whitelist`
- [ ] Validation & edge cases — `/develop admin user detail edge cases — non-existent user id, editing self/role, invalid field values`
- [ ] Accessibility — `/develop admin user detail a11y — table + form semantics, headings hierarchy`
> ADR: — · Code area: —

### 9. SEO for public pages  ·  Needs ADR: no  ·  Status: planned
Existing pages already render; this adds metadata only.
- [ ] Book detail SEO — `/develop book detail SEO — generateMetadata for app/(root)/books/[id]: title/description/OG image (cover) + Book JSON-LD with rating`
- [ ] Home + library SEO — `/develop home and library SEO — static metadata, Organization JSON-LD on home, canonical + OG defaults in app/layout.tsx`
- [ ] Sitemap & robots — `/develop sitemap — app/sitemap.ts listing books + static routes, and robots.ts`
> ADR: — · Code area: —

### 10. Accessibility audit (AA)  ·  Needs ADR: no  ·  Status: planned
- [ ] New-feature UI sweep — `/develop a11y sweep — verify AA on all features built in this slice (forms, dialogs, toggles, tables): focus order, labels, contrast, keyboard nav`
- [ ] Existing UI sweep — `/develop a11y sweep existing — audit Header, BookOverview, BorrowBook, admin tables/forms for labels, contrast, keyboard operability; fix gaps`
- [ ] Verify — `/verify accessibility — keyboard-only + screen-reader pass over key flows (browse → reserve → borrow → return)`
> ADR: — · Code area: —

## Legend
- **Status**: `planned` → `in-progress` → `done` (pipeline: /mvp seeds → /develop builds → /sync reconciles). Plus **`existing`** — a pre-existing feature enrolled for context (no breakdown). Plus **`dropped`** — a de-scoped feature kept for history.
- **Sub-task checkbox**: `todo` `[ ]` → `done` `[x]` — `/develop` ticks its own sub-tasks; `/sync` sweeps the rest from repo evidence.
- **Needs ADR?**: `yes` → run `/architect` before building · `no` → `/develop` directly.
- **Priority**: P0 (lifecycle-critical) · P1 (this slice) · P2 (deferred).
