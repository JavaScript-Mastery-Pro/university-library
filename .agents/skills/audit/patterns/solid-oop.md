# SOLID OOP

**MCQ label**: SOLID + OOP
**MCQ description**: Classic object-oriented design with SOLID principles. Dependency injection, interfaces, and single-responsibility classes.

## Conventions

- **Single Responsibility**: each class has one reason to change. Split classes that do more than one job.
- **Open/Closed**: classes are open for extension, closed for modification. Add behaviour via new classes or composition, not by editing existing ones.
- **Liskov Substitution**: subclasses must be substitutable for their base class without changing program correctness. Prefer composition over deep inheritance.
- **Interface Segregation**: prefer small, focused interfaces over large ones. Callers depend only on methods they use.
- **Dependency Inversion**: high-level modules depend on abstractions, not concretions. Wire dependencies at the composition root via constructor injection.
- No service locator or global registry — dependencies are explicit in constructors.
- Classes are small (aim for under 200 lines). If a class grows beyond that, look for a responsibility to extract.
- Favour composition over inheritance beyond one level deep.
- Name classes after what they do, not what they extend (`UserRepository`, not `AbstractBaseUserImpl`).
- Tests inject fakes or stubs via constructor — no patching of globals or module internals.
