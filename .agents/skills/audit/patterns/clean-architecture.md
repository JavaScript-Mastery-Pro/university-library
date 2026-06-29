# Clean Architecture

**MCQ label**: Clean Architecture
**MCQ description**: Strict layer separation — domain logic never touches frameworks or I/O. Scales well for complex business rules.

## Conventions

- Code is organized in four layers: `domain` (entities, value objects), `application` (use cases), `infrastructure` (DB, APIs, frameworks), `presentation` (UI, controllers).
- Dependency rule: outer layers depend on inner layers, never the reverse. Domain has zero external imports.
- Use cases are thin orchestrators — they call domain logic and infrastructure interfaces, never implement business rules themselves.
- Infrastructure implements interfaces defined in the domain or application layer (dependency inversion).
- No framework code (Express, Next.js, Prisma, etc.) appears inside `domain/` or `application/`.
- Entities contain business rules and enforce their own invariants. They are plain objects with no ORM decorators.
- All cross-boundary communication uses DTOs or plain objects — no domain entities leak into the presentation layer.
- Tests: domain and application layers are unit-tested with no mocks of infrastructure. Infrastructure is integration-tested against real systems.
