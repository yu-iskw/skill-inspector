# CLAUDE.md

## Project Commands

### Build & Run

- **Build:** `pnpm build`
- **Run (dev):** `pnpm dev`
- **Run (dist):** `pnpm start`

### Code Quality

- **Lint:** `pnpm lint`
- **Format:** `pnpm format`
- **Test:** `pnpm test`
- **Setup Dev Env:** `pnpm install && pnpm trunk install`

### Package Management

- **Install:** `pnpm install`
- **Add Dependency:** `pnpm add <pkg>`
- **Add Dev Dependency:** `pnpm add -D <pkg>`

## Coding Standards

### TypeScript

- **Naming:** `UpperCamelCase` for classes/interfaces/types, `lowerCamelCase` for variables/functions.
- **Exports:** Prefer named exports over default exports.
- **Variables:** Use `const` by default, `let` only when necessary. Never use `var`.
- **Types:** Avoid `any`; use `unknown` for ambiguous data. Explicitly type API boundaries.
- **Formatting:** 2 spaces, semicolons required, 1TBS brace style.

### Testing Philosophy

- **Decoupling:** Design functions to be "pure" (deterministic inputs/outputs).
- **External Dependencies:** Avoid mocks/patches for network, DB, or file system operations.
- **Infrastructure:** Use "Nullables" or state-tracking for infrastructure testing when necessary.

### Project Structure

- Organize by feature/domain.
- Use relative paths for internal imports.
- File naming: `camelCase` for utilities, `PascalCase` for components/classes.
