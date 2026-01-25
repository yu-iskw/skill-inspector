# skill-inspector

A sophisticated agentic tool built with [Mastra](https://mastra.ai/) to inspect AI Agent Skills for quality, security, and compatibility.

## Features

- **Automated Spec Validation**: Ensures skills adhere to the [agentskills.io](https://agentskills.io) specification.
- **Deep Security Auditing**: Two-phase agentic workflow to detect RCE, data exfiltration, and other vulnerabilities.
- **Provider Compatibility**: Analyzes skills for vendor-specific extensions to ensure portability across Claude, GPT-4, Gemini, and more.
- **Smart Discovery**: Automatically finds skills in local directories or remote GitHub repositories.
- **Actionable Reports**: Provides a clear 0-100 score with specific findings and proposed fixes.

## Getting Started

### Installation

You can run `skill-inspector` directly using `npx`:

```bash
npx skill-inspector inspect ./my-skill
```

Or install it globally:

```bash
# Using npm
npm install -g skill-inspector

# Using pnpm
pnpm add -g skill-inspector

# Using yarn
yarn global add skill-inspector
```

### For Contributors

If you want to run the project locally for development:

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run via pnpm dev
pnpm dev inspect ./my-skill
```

## Usage

```bash
# Basic inspection of a local directory
skill-inspector inspect ./my-skill

# Inspect a remote GitHub repository
skill-inspector inspect anthropics/skills

# List found skills without inspecting
skill-inspector inspect ./my-skill --list

# Inspect specific skills by name
skill-inspector inspect anthropics/skills -s "git-commit" "test-and-fix"

# Choose a specific LLM provider and model
skill-inspector inspect ./my-skill --provider anthropic --model claude-3-5-sonnet-latest

# Output results as JSON for automation
skill-inspector inspect ./my-skill --json

# Debug mode (see detailed agent thoughts and logs)
skill-inspector inspect ./my-skill --debug
```

## LLM Configuration

The inspector supports multiple providers. Set your API keys as environment variables:

| Provider             | CLI Value          | Default Model               | API Key Env Var                                   |
| :------------------- | :----------------- | :-------------------------- | :------------------------------------------------ |
| **OpenAI**           | `openai`           | `gpt-5-mini`                | `OPENAI_API_KEY`                                  |
| **Anthropic**        | `anthropic`        | `claude-4-5-haiku@20260315` | `ANTHROPIC_API_KEY`                               |
| **Google AI**        | `google`           | `gemini-2.5-flash`          | `GOOGLE_API_KEY`                                  |
| **Mistral**          | `mistral`          | `mistral-small-latest`      | `MISTRAL_API_KEY`                                 |
| **Groq**             | `groq`             | `llama-4-scout-17b`         | `GROQ_API_KEY`                                    |
| **Vertex AI**        | `google-vertex`    | `gemini-2.5-flash`          | `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` |
| **Anthropic Vertex** | `anthropic-vertex` | `claude-4-5-haiku@20260315` | `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` |

## Documentation

For technical details, architecture diagrams, and contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Apache-2.0
