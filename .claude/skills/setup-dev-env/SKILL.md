---
name: setup-dev-env
description: Set up the development environment for the project. Use when starting work on the project, when dependencies are out of sync, or to fix environment setup failures.
---

# Setup Development Environment

This skill automates the process of setting up the development environment to ensure all tools and dependencies are correctly installed and configured.

## Workflow Checklist

- [ ] **Step 1: Environment Validation**
  - [ ] Check Node.js version against `.node-version`
  - [ ] Check for `pnpm` installation
- [ ] **Step 2: Dependency Installation**
  - [ ] Run `pnpm install` (this also installs the `trunk` launcher)
- [ ] **Step 3: Tooling Setup**
  - [ ] Run `pnpm trunk install` to fetch managed linters and formatters

## Detailed Instructions

### 1. Environment Validation

#### Node.js Version

Read the `.node-version` file in the workspace root. Ensure the current Node.js environment matches this version. If there's a mismatch, inform the user to switch Node versions (e.g., using `nvm` or `fnm`).

#### Trunk CLI

Trunk is managed via `pnpm` in this project using `@trunkio/launcher`. This ensures it works in cloud environments like Claude Code Cloud without manual installation.

The `trunk` launcher is installed automatically during `pnpm install`. You can then run Trunk commands using `pnpm trunk`.

For local macOS users who prefer a global installation:

```bash
brew install trunk-io
```

For other platforms, refer to the [Trunk installation documentation](https://docs.trunk.io/references/cli/getting-started/install).

### 2. Dependency Installation

Run the following command at the workspace root to install all project dependencies, including the Trunk launcher. Refer to [../common-references/pnpm-commands.md](../common-references/pnpm-commands.md) for more pnpm commands.

```bash
pnpm install
```

### 3. Tooling Setup

Trunk manages linters and formatters hermetically. Run the following command to ensure all required tools are downloaded and ready.

```bash
pnpm trunk install
```

Refer to [../common-references/trunk-commands.md](../common-references/trunk-commands.md) for more Trunk commands.

## Success Criteria

- All `pnpm` dependencies are installed successfully.
- `trunk` is installed and all managed tools are initialized.
- The Node.js version matches the requirement in `.node-version`.

## Post-Setup Verification

To ensure the environment is fully operational:

1. **Invoke Verifier**: Run the `verifier` subagent ([../../agents/verifier.md](../../agents/verifier.md)). This confirms that the freshly installed dependencies allow for a successful build, pass lint checks, and satisfy all unit tests.
2. **Handle Failure**: If the `verifier` fails, follow its reporting to resolve environment-specific issues.
