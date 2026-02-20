# AGENTS.md

## Project Goal

`skill-inspector` is a CLI tool designed to inspect Agent Skills (specifically `.claude/skills` and similar formats) for malicious behaviors, security vulnerabilities, and adherence to project standards.

## Tech Stack

- **Runtime:** Node.js (>=22.13.0)
- **Package Manager:** pnpm (v10.x)
- **Language:** TypeScript
- **Testing:** Vitest
- **Linting/Formatting:** Trunk (manages hermetic tools)
- **Core Libraries:** Mastra, AI SDK (Anthropic, Google, OpenAI, etc.), Commander, simple-git.

## Key Architectural Rules

- **Dependency Strictness:** Only use dependencies explicitly declared in `package.json`.
- **Unit Test Manners:** Strict decoupling from external I/O. Tests must be fast and reliable without mocks.
- **Skill Structure:** Skills are defined in `.claude/skills/` with `SKILL.md` and associated assets.

## Memory

- **Initial Setup:** Project bootstrapped from a TypeScript template.
- **Agent Context:** `CLAUDE.md` and `AGENTS.md` created to provide persistent guidance for AI agents.
- **Environment Management:** Trunk is used for managed tool chains to ensure consistency across environments.
