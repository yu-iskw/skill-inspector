#!/usr/bin/env bash
# List skills found in a source path without running full inspection.
set -euo pipefail
exec npx skill-inspector inspect "$@" --list
