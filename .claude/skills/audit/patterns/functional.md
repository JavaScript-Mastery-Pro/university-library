# Functional & Immutable

**MCQ label**: Functional / Immutable
**MCQ description**: Pure functions, no shared mutable state. Predictable, easy to test, composable.

## Conventions

- Functions are pure by default: same input always produces same output, no side effects.
- Data is immutable — use `const`, `Object.freeze`, `readonly`, or immutable data structures. Never mutate in place.
- Side effects (I/O, network, state changes) are pushed to the edges of the system and kept explicit.
- Prefer function composition over inheritance. Avoid classes where a plain function works.
- No shared mutable state. Module-level variables are constants only.
- Transformations use `map`, `filter`, `reduce` over imperative loops where it improves readability.
- Avoid `null` — use `Option`/`Maybe` types or explicit `undefined` with union types.
- Error handling uses `Result`/`Either` types or explicit error returns rather than exceptions for expected failures.
- Tests are trivial: pure functions need no mocks, just input/output assertions.
