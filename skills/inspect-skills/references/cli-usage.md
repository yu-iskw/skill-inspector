# skill-inspector CLI Usage

Reference for the `npx skill-inspector inspect` command used by the inspect-skills skill.

## Command

```bash
npx skill-inspector inspect [source]
```

- **source** (optional): Local path or `owner/repo` GitHub shorthand. Default: `.`

## Options

| Option               | Short | Description                                  |
| -------------------- | ----- | -------------------------------------------- |
| `--list`             | `-l`  | List found skills without running inspection |
| `--skill <names...>` | `-s`  | Only inspect specific skills by name         |
| `--provider <name>`  | `-p`  | LLM provider (see table below)               |
| `--model <id>`       | `-m`  | Specific model ID to use                     |
| `--json`             |       | Output results in JSON format                |
| `--debug`            |       | Show detailed agent logs and thoughts        |
| `--stack-trace`      |       | Show stack trace on error                    |

## LLM Providers and Environment Variables

At least one of the following API keys must be set for full inspection (listing does not require them):

| Provider         | CLI `--provider` value | Default model             | Required env vars                                 |
| ---------------- | ---------------------- | ------------------------- | ------------------------------------------------- |
| OpenAI           | `openai`               | gpt-5-mini                | `OPENAI_API_KEY`                                  |
| Anthropic        | `anthropic`            | claude-4-5-haiku@20260315 | `ANTHROPIC_API_KEY`                               |
| Google AI        | `google`               | gemini-2.5-flash          | `GOOGLE_API_KEY`                                  |
| Mistral          | `mistral`              | mistral-small-latest      | `MISTRAL_API_KEY`                                 |
| Groq             | `groq`                 | llama-4-scout-17b         | `GROQ_API_KEY`                                    |
| Vertex AI        | `google-vertex`        | gemini-2.5-flash          | `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` |
| Anthropic Vertex | `anthropic-vertex`     | claude-4-5-haiku@20260315 | `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` |

## Output Interpretation

- **Overall score**: 0–100. Green > 80, yellow > 50, red otherwise. "INCOMPLETE" if the workflow did not finish (e.g. API failure).
- **Findings**: Each finding has severity (`critical`, `high`, `medium`, `low`), message, optional fix, and agent name.
- **--json**: Use for automation; report structure is logged as JSON.
