# war-api

## Testing
Always include `// Arrange`, `// Act`, and `// Assert` comments in test methods to delineate the three phases.

When prompted to generate tests, present the tests for approval before writing any production code or test infrastructure.

## Design principles
Always apply the SOLID principles (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion).

## Code quality
When changing a function, check its cyclomatic complexity. If it exceeds 5, report the function name and complexity value to the user.

## Development
Always use Test Driven Development. Prefer BDD-style acceptance tests over unit tests. Never write production code without first having a failing acceptance test or failing unit test.

Red-Green-Refactor cycle:
1. Write a single failing test (acceptance test preferred; unit test where acceptance is not practical)
2. Write only enough production code to make the test pass
3. Refactor
4. Repeat until there are no more tests to write

## Build and test

All commands run from the repository root. No `cd`.

- install: `npm ci`
- lint: `npm run lint`
- typecheck: `npx tsc --noEmit`
- migrate (test DB): `npm run migrate`
- test (unit + integration + acceptance): `npm test`
- test (scoped): `npm test -- -t "<name>"`

These mirror the reusable pipeline in `war-infra/.github/workflows/api.yml` (§8.1 of
`war-infra-spec.md`) exactly, so local runs match CI. Integration/acceptance tests
connect via `DATABASE_URL` when set (as CI's `postgres:16-alpine` service provides) and
fall back to a local Testcontainers Postgres when it is unset.