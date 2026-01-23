# skill-inspector

A sophisticated agentic tool to inspect AI Agent Skills for quality, security, and compatibility.

## Features

- **Multi-Agent Inspection**: Uses LangGraph to orchestrate specialized agents (Spec, Security, Compatibility).
- **Tool-Augmented Agents**: Agents can explore the skill's filesystem and lookup specifications.
- **Multi-Provider Support**: Supports OpenAI, Claude (Native/Vertex), Gemini (Native/Vertex), and local models (Ollama).
- **Parity with `add-skill`**: Mimics the discovery and CLI options of the popular `add-skill` tool.

## Installation

```bash
pnpm install
pnpm build
```

## Usage

```bash
# Basic inspection
pnpm dev inspect ./my-skill

# List skills in a repo
pnpm dev inspect vercel-labs/agent-skills --list

# Use JSON output
pnpm dev inspect ./my-skill --json

# Debug mode (see agent thoughts)
pnpm dev inspect ./my-skill --debug
```

## LLM Configuration

The inspector uses environment variables to configure the LLM provider:

### OpenAI (Default)

```bash
export OPENAI_API_KEY=your_key
```

### Claude (Anthropic)

```bash
export LLM_PROVIDER=anthropic
export LLM_MODEL=claude-3-5-sonnet-20240620
export ANTHROPIC_API_KEY=your_key
```

### Gemini (Google AI)

```bash
export LLM_PROVIDER=google-genai
export LLM_MODEL=gemini-1.5-pro
export GOOGLE_API_KEY=your_key
```

### Vertex AI (Google Cloud)

```bash
export LLM_PROVIDER=google-vertex
export LLM_MODEL=gemini-1.5-pro
export GOOGLE_VERTEX_PROJECT=your-project-id
export GOOGLE_VERTEX_LOCATION=us-central1
```

### Ollama / Local

```bash
export LLM_PROVIDER=ollama
export LLM_MODEL=llama3
export LOCAL_LLM_BASE_URL=http://localhost:11434/v1
```

## Development

- `pnpm test`: Run unit tests.
- `pnpm lint`: Run linting and formatting.

## License

Apache-2.0
