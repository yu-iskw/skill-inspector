---
name: inspect-skills
description: Inspect Agent Skills for quality, security, and compatibility using npx skill-inspector. Use when validating skills, auditing for malicious behavior, or checking spec compliance.
---

# Inspect Agent Skills

## Purpose

Run the **skill-inspector** CLI to analyze one or more Agent Skills for spec compliance, security (e.g. RCE, data exfiltration), and provider compatibility. Use this skill when you need to validate, audit, or harden Agent Skills.

## When to Use

- The user asks to "inspect skills", "validate skills", "audit skills for security", or "check skill compliance".
- You need to verify a skill directory or repo before adopting or recommending it.
- You want a 0–100 score and actionable findings for a skill or skill set.

## How to Use

1. **List skills only** (no LLM required): From the repo or directory that contains skills, run:

   ```bash
   ./scripts/list-skills.sh [source]
   ```

   Example: `./scripts/list-skills.sh .` or `./scripts/list-skills.sh owner/repo`.

2. **Full inspection** (requires at least one LLM API key): Run:

   ```bash
   ./scripts/inspect.sh [source] [options]
   ```

   The script checks for `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY`, or `GROQ_API_KEY` and exits with a clear error if none are set.

   Examples:
   - `./scripts/inspect.sh .` — inspect all skills in current directory
   - `./scripts/inspect.sh ./my-skill --provider anthropic`
   - `./scripts/inspect.sh owner/repo -s "skill-name" --json`

3. **Interpret results**: See [references/cli-usage.md](references/cli-usage.md) for score ranges, severity levels, and `--json` output.

## Resources

- [CLI usage and options](references/cli-usage.md): Flags, providers, and environment variables.
