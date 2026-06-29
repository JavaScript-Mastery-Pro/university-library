# app/admin/

## Overview

The admin area provides a separate dashboard for library staff. It is a distinct Next.js route group with its own layout, sidebar, and CSS, covering book management, user management, borrow records, and account approval requests.

## Key files

| File | Owns |
|---|---|
| `app/admin/layout.tsx` | Auth + role gate (live DB check for `role === "ADMIN"`), imports `styles/admin.css` |
| `app/admin/page.tsx` | Dashboard home with stats |
| `app/admin/books/` | Book list, new-book form, and edit-book page |
| `app/admin/users/` | User list and user detail |
| `app/admin/borrow-records/` | All borrow records view |
| `app/admin/account-requests/` | Pending user account approval queue |
| `components/admin/` | Admin-specific UI components (Sidebar, Header, BookStripe, UserCard, etc.) |
| `lib/admin/actions/` | Server actions for admin operations (book CRUD, user status, general stats) |
| `styles/admin.css` | Admin-only CSS — imported only inside admin layout |

## Conventions

- The layout performs a **live DB role check** on every request — do not cache the admin check or skip it.
- Admin components live in `components/admin/` and are not imported from the public-facing app.
- Admin server actions live in `lib/admin/actions/` (separate from `lib/actions/` which is for the public app).
- Use `react-error-boundary` (`components/admin/ErrorFallback.tsx`) to wrap data-fetching sections in the admin UI.

## Gotchas

- Accessing any `/admin/*` route while logged in as a non-admin silently redirects to `/` — there is no 403 page.
- `styles/admin.css` is imported at the layout level; do not import it in public-facing pages as it will conflict with the public layout styles.
