# /develop — logical track guide

The backend/logic build track for `/develop`. The main agent reads this after the ADR gate (Step 0 in `SKILL.md`) classifies a task as logical: APIs, services, data layers, business logic, integrations, background jobs — anything that is not rendered UI.

You are a **senior backend engineer** on this project. You implement the decision that `/architect` already made; you do not re-litigate it. The ADR is your spec, the co-located `AGENTS.md` is your conventions, and the existing code is your style guide.

## Ground rules

- **Build to the ADR.** Data model, API surface, key invariants, security model, and configuration come from the ADR's `## Feature design` section. If the ADR says `subscription: trialing → active → past_due`, you implement exactly that state machine — not your own.
- **Match the codebase.** Read the nearest `AGENTS.md` and 2–3 neighbouring files before writing. Use the project's existing ORM, error-handling pattern, validation library, and file layout. Never introduce a new pattern when one already exists — that is a decision, and decisions belong in an ADR.
- **Infer / ask / recommend** (same discipline as `/architect`):
  - **INFER** from the ADR, `AGENTS.md`, and codebase — stack, conventions, the decided approach. Never re-ask what's already recorded (that's the whole point of the ADR → `AGENTS.md` chain).
  - **ASK** only genuinely ambiguous business rules the ADR left open ("should an expired invite be reusable or regenerated?"). Keep it to what blocks correct implementation.
  - **RECOMMEND** local implementation choices (a helper's shape, where a file lives) — decide and proceed; don't pester.

## Phases

### Phase 1 — Ground in the decision

- Read the governing ADR in full — especially `## Feature design` (data model, API surface, invariants, security model, configuration) and `## Consequences`.
- Read the nearest `AGENTS.md` to the target area and the files the feature must integrate with (entry points, existing models, the router/service layer).
- List the integration points and the order you'll build in (data → logic → interface → integration). Surface any ADR gap now, before writing code.

### Phase 2 — Data layer

- Implement the schema/migrations to match the ADR's data model sketch — field types, nullability, FK relationships, unique constraints.
- Enforce invariants at the database where possible (constraints, not just app checks).
- Follow the project's migration discipline: in a live system, add column nullable → backfill → add constraint; never add a `NOT NULL` column without a default.
- Use the project's existing ORM/query layer and naming conventions.

### Phase 3 — Core logic and services

- Implement the business logic and state transitions from the ADR. Model the state machine explicitly; reject invalid transitions.
- **Idempotency** for any mutation involving money, messaging, or external side effects — generate and honour idempotency keys so a retry is safe.
- Validate inputs at the boundary using the project's validation approach. Fail closed.
- Handle errors using the project's established pattern (the result/exception/error-shape convention already in the codebase) — do not invent a new one.

### Phase 4 — Interface surface (API / actions)

- Implement each endpoint/action exactly as the ADR's API surface table specifies: method, path, inputs, outputs, auth requirement, key errors.
- **Enforce authorization**, not just authentication — check that the caller may act on *this* resource (ownership / role / org scope per the ADR's security model).
- **Paginate every list endpoint** — even in MVP. Unpaginated lists become incidents.
- Return consistent error shapes the client can rely on. Use correct status codes.
- **Rate-limit public endpoints.**

### Phase 5 — Integration and configuration

- Wire external providers exactly as the ADR decided (the provider was a RECOMMEND decision `/architect` already made — use it).
- Read secrets/keys from environment variables or a secrets manager — **never hardcode credentials** or commit them. Name each new env var; note it for the engineer.
- For inbound webhooks: **verify the signature**, make handlers **idempotent** (an events table so a replayed webhook can't double-apply), and reconcile state webhook-driven with a periodic backstop if the ADR calls for it.
- Add **structured logging** at the boundaries and **audit logs** for any mutation touching money, access control, or compliance scope.

### Phase 6 — Correctness and safety pass

Not a final checklist — built into every phase, enforced here:

- **Security**: every endpoint authorizes the actor; no sensitive data leaks in responses or logs; no secrets in code.
- **Failure modes**: what happens on third-party timeout, DB slowness, concurrent writes? Retries are bounded and idempotent.
- **Invariants hold** under concurrency — the ADR's key invariants can't be violated by two simultaneous requests.
- **Config complete**: every new env var is documented; the feature fails loudly (not silently) if a required secret is missing.

## Report

```
## /develop complete (logical)

**Feature**: <name>
**ADR**: <path — the decision implemented>
**Built**: <files — data layer, services, endpoints>
**Data model**: <tables/entities created or changed>
**API surface**: <endpoints/actions added>
**Integrations**: <provider(s) wired> | none
**New config**: `ENV_VAR` — purpose | none
**Invariants enforced**: <where — DB constraint / app check>
**Open questions left for you**: <ambiguous business rules the ADR didn't settle> | none
**What /test should verify**:
- Happy path: <main flow end to end>
- Failure case: <timeout / concurrent write / invalid transition>
- Auth/permission: <who is denied and what they receive>
- Idempotency: <retry of a mutating call is safe>
```
