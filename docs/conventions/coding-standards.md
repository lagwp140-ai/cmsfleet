# Coding Standards

## General

- Use TypeScript for all Node.js and frontend code.
- Keep strict compiler settings enabled.
- Prefer small, named modules over large utility files.
- Default to ASCII source unless domain data requires Unicode.
- Add comments only when the code intent is not obvious from structure and naming.

## Backend and Worker Standards

- Use feature-first folders under `src/modules`.
- Keep route handlers thin; business logic belongs in services.
- Validate inbound HTTP payloads and env config at the boundary.
- Use structured logging and avoid ad hoc `console.log` debugging in committed code.
- Make database access explicit through repositories or query modules.
- Treat authentication as a boundary concern: hash passwords, never log secrets, and emit audit events for auth mutations.

## Frontend Standards

- Organize by feature or route boundary once the app grows beyond a single screen.
- Keep network access in dedicated API client modules, not inside presentation components.
- Avoid premature memoization; optimize only after measuring.
- Prefer clear loading, empty, and error states for operator workflows.

## Testing Standards

- Unit tests should live close to the code they validate.
- Cross-service, contract, and end-to-end tests should live in [`tests`](/c:/Projects/cmsfleet/tests).
- New modules should ship with at least basic happy-path and failure-path coverage.

## Naming

- Use `kebab-case` for folders.
- Use `PascalCase` for React components and Java classes.
- Use `camelCase` for TypeScript functions and variables.
- Prefix environment variables by service where confusion is likely.
