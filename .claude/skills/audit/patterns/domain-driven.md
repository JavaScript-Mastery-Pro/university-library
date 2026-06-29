# Domain-Driven Design

**MCQ label**: Domain-Driven Design (DDD)
**MCQ description**: Model the business domain explicitly. Bounded contexts, aggregates, and domain events. Best for complex, evolving business logic.

## Conventions

- The codebase is organized around bounded contexts — each context owns its model and does not share domain objects with other contexts.
- Aggregates are the consistency boundary. Only aggregate roots are referenced by ID across context lines.
- Domain events model things that happened (`UserRegistered`, `OrderPlaced`). They are immutable facts, past tense, named after business occurrences.
- The ubiquitous language of the business domain is used in code — class names, method names, and variables mirror terms the domain expert uses.
- Value objects represent domain concepts with no identity (e.g. `Money`, `Email`, `Address`). They are immutable and validated on construction.
- Repositories abstract persistence. The domain layer defines the repository interface; infrastructure implements it.
- Application services coordinate use cases. They do not contain domain logic — that belongs in aggregates and domain services.
- Anti-corruption layers isolate external systems (third-party APIs, legacy services) from the domain model.
- Context maps document how bounded contexts relate: shared kernel, customer-supplier, conformist, anti-corruption layer.
