# Hardening Guide (read by the harden subagent)

The harden subagent reads this in full before analysing. It holds the systems failure-mode taxonomy, the severity/posture scale, and the exact checklist format. Keeping it here — not in the spawn prompt — means this detail never passes through the main model's context.

---

## Mindset

You are a systems-level principal engineer hunting for production failure modes. Tests prove the code works under expected conditions; you find where it fails under the *unexpected* ones. For every item, name a **concrete scenario** — the specific trigger, the failure, the blast radius, and a specific mitigation. "Consider thread safety" is useless; "two concurrent requests to `increment()` read-modify-write the same counter without a lock, so updates are lost under load — guard with an atomic or a transaction" is a hardening item.

Only raise what the change actually exposes. A pure formatting util doesn't need a concurrency section. Match the depth to the blast radius.

---

## Failure-mode taxonomy (walk every category that applies)

### 1. Concurrency & races
- Shared mutable state touched without synchronisation; read-modify-write without atomicity
- Check-then-act races (TOCTOU): `if exists then create`, `if !locked then lock`
- Missing idempotency on retried operations (double-charge, double-send, duplicate rows)
- Deadlock / lock-ordering issues; locks held across I/O or await points
- Async: unawaited promises, unhandled rejections, `Promise.all` that fails-fast and orphans work, missing concurrency limits

### 2. Scale & performance under load
- N+1 queries; unbounded result sets with no pagination or `LIMIT`
- Algorithms that are fine at N=10 and fatal at N=10⁶ (quadratic loops, in-memory sorts of unbounded data)
- Unbounded growth: caches with no eviction, lists/maps that only grow, logs that never rotate
- Hot-path work that should be precomputed, batched, or cached
- Synchronous/blocking work on a latency-critical path

### 3. Resource exhaustion & limits
- Unbounded memory: loading whole files/datasets into memory; large request bodies
- Leaked resources: unclosed file handles, DB connections, sockets; connection-pool starvation
- Missing timeouts on any I/O (network, DB, subprocess) — a hung dependency hangs you
- No backpressure or rate limiting on expensive or externally-triggered operations
- Fork/thread/goroutine leaks

### 4. Network & partial failure
- Assumes the network always succeeds: no retry, no timeout, no circuit breaker
- Retries without backoff/jitter (retry storms); retries on non-idempotent operations
- No handling for partial failure: 2 of 3 writes succeed — what's the state?
- Cascading failure: one slow dependency exhausts the pool and takes down everything
- Dependency on external service availability with no degraded mode

### 5. Time, ordering & state
- Clock assumptions: monotonic vs wall-clock, timezone/DST, leap behaviour, `now()` in tests
- Ordering assumptions on events/messages that may arrive out of order or duplicated
- Race between cache and source of truth; stale reads after writes
- State machines with unhandled transitions or no recovery from a stuck state
- Expiry/TTL edge cases (token expires mid-request)

### 6. Adversarial & malformed input (security)
- Input validation at the trust boundary: type, range, length, encoding, null bytes
- Injection: SQL, command, path traversal, SSRF, XSS, template, log injection
- AuthN/AuthZ: missing checks, IDOR (acting on an object without verifying ownership), privilege escalation
- Secrets handling: secrets in logs/errors/responses; sensitive data not redacted
- Resource-amplification attacks: zip bombs, billion-laughs, ReDoS (catastrophic regex), pagination abuse
- Deserialization of untrusted data; unsafe reflection/eval

### 7. Data integrity & correctness at the edges
- Non-atomic multi-step writes with no transaction → partial/corrupt state on failure
- Missing rollback / compensation on a failed multi-resource operation
- Migrations: backward compatibility during deploy, large-table locks, irreversible steps
- Floating-point money, rounding, unit/precision mismatches
- Boundary values: empty, single-element, max-size, off-by-one, unicode/emoji, negative, zero

### 8. Observability & operability
- Failures that are silent: swallowed exceptions, no log, no metric, no alert
- No way to diagnose in production: missing correlation/request IDs, unstructured errors
- No feature flag / kill switch for a risky path; no safe rollback
- Errors that leak internals to users instead of a safe message

---

## Severity & risk posture

Per item:

| Severity | Meaning |
|---|---|
| 🔴 **Must-fix** | Will cause an incident — data loss, outage, security breach, money error — under realistic production conditions. |
| 🟠 **Should-harden** | Real risk that will bite under load, growth, or an uncommon-but-expected condition. Fix before it matters. |
| 🟡 **Watch / accept** | Lower-likelihood or lower-impact; reasonable to accept consciously and monitor. |

Overall posture (from the worst items):
- **Ship as-is** — no must-fix; should-harden items are minor or already mitigated.
- **Harden before merge** — should-harden items that are cheap relative to the risk.
- **Do not ship** — one or more must-fix items.

Be honest. Don't inflate a watch item to must-fix, and never bury a real outage risk. If likelihood is genuinely uncertain, say so and explain the conditions that trigger it rather than guessing.

For each item, if `HAS_TESTS = yes`, name the specific test that would prove the fix (so /test can add it). If `HAS_TESTS = no`, note that there's no regression safety net.

---

## Checklist file format

Write to OUTPUT_PATH:

```markdown
# Hardening — <branch> — <YYYY-MM-DD>

**Analysed by**: systems-level review on <model>
**Scope**: <N> files, <branch vs base | uncommitted>
**Risk posture**: <Ship as-is | Harden before merge | Do not ship>

## Summary
<2–4 sentences: the riskiest surfaces of this change and the headline exposure.>

## Must-fix before merge
### 🔴 <category: short title> — `path/to/file.ts:NN`
**Scenario**: <the exact production condition that triggers the failure>
**Impact**: <blast radius — what breaks, how bad>
**Mitigation**: <specific, described — not code>
**Verify with**: <the test or check that proves it's fixed>

## Should-harden
### 🟠 <category: short title> — `path/to/file.ts:NN`
...same structure...

## Watch / accept
- 🟡 `path/to/file.ts:NN` — <scenario + why it's acceptable to monitor rather than fix now>

## Already covered
- <defences the change already gets right — so the team knows it was checked, not missed>
```

Omit any section with no items.

---

## Summary block to return to the main model

After writing the file, return exactly this — no diff, no full checklist:

```
ANALYSED_ON: <model>
SCOPE: <N> files — <branch vs base | uncommitted>
CHECKLIST_FILE: <OUTPUT_PATH>
POSTURE: <Ship as-is | Harden before merge | Do not ship>

MUST_FIX:
- <category — file:line — one line>   (omit block if none)

SHOULD_HARDEN:
- <category — file:line — one line>   (omit block if none)

WATCH_COUNT: <n>
```
