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

```bash
pnpm install
pnpm build
```

### Quick Start

Inspect a local skill directory:

```bash
pnpm dev inspect ./my-skill
```

Or a remote GitHub repository:

```bash
pnpm dev inspect anthropics/skills
```

## Usage

```bash
# Inspect specific skills by name in a repo
pnpm dev inspect anthropics/skills -s "git-commit" "test-and-fix"

# Output as JSON for automation
pnpm dev inspect ./my-skill --json

# Debug mode (see agent thoughts and logs)
pnpm dev inspect ./my-skill --debug
```

## LLM Configuration

The inspector supports multiple providers. Set your API keys as environment variables:

| Provider             | Default Model               | API Key Env Var                                   |
| :------------------- | :-------------------------- | :------------------------------------------------ |
| **OpenAI**           | `gpt-5.2`                   | `OPENAI_API_KEY`                                  |
| **Anthropic**        | `claude-4.5-haiku@20260315` | `ANTHROPIC_API_KEY`                               |
| **Google AI**        | `gemini-2.5-flash`          | `GOOGLE_API_KEY`                                  |
| **Mistral**          | `mistral-large-latest`      | `MISTRAL_API_KEY`                                 |
| **Groq**             | `llama-4-70b`               | `GROQ_API_KEY`                                    |
| **Vertex AI**        | `gemini-2.5-flash`          | `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` |
| **Anthropic Vertex** | `claude-4.5-haiku@20260315` | `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` |

## Documentation

For technical details, architecture diagrams, and contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Apache-2.0
