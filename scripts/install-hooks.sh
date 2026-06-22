#!/usr/bin/env bash
# Install the project's gitleaks git hooks — Task 1.12 (Phase 0.6).
#
# Points `core.hooksPath` at the committed `.githooks/` directory so the
# pre-commit + pre-push gitleaks scans run automatically. Re-run after a fresh
# clone or any time `.githooks/` changes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="$ROOT/.githooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "ERROR: $HOOKS_DIR not found" >&2
  exit 1
fi

git config core.hooksPath ".githooks"

# Ensure the hooks are executable (in case they lost their bit on a filesystem
# that doesn't preserve it).
chmod +x "$HOOKS_DIR"/*

echo "✓ gitleaks git hooks installed (core.hooksPath = .githooks)."
echo "  pre-commit : scans staged changes"
echo "  pre-push   : scans full history"
echo ""
echo "Verify gitleaks is installed:  gitleaks version"
echo "Bypass (DANGEROUS):            git <cmd> --no-verify"
