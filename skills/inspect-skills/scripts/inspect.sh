#!/usr/bin/env bash
# Wrapper for 'npx skill-inspector inspect'. Ensures at least one LLM API key is set.
set -euo pipefail

if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${GOOGLE_API_KEY:-}" ] && [ -z "${MISTRAL_API_KEY:-}" ] && [ -z "${GROQ_API_KEY:-}" ]; then
  echo "Error: At least one LLM API key is required. Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, MISTRAL_API_KEY, GROQ_API_KEY" >&2
  exit 1
fi

exec npx skill-inspector inspect "$@"
