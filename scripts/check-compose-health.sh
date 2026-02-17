#!/usr/bin/env bash
set -euo pipefail

# Validate that each split compose file starts independently.
# Tests data, storage, and email tiers (app and media require builds).
#
# Usage: ./scripts/check-compose-health.sh

cd "$(dirname "$0")/../jumpinchat-deploy"

COMPOSE_FILES=(
  compose.data.yml
  compose.storage.yml
  compose.email.yml
)

PASS=0
FAIL=0
SKIP=0

for f in "${COMPOSE_FILES[@]}"; do
  echo "=== Testing ${f} ==="
  if [ ! -f "$f" ]; then
    echo "SKIP: $f not found"
    SKIP=$((SKIP + 1))
    continue
  fi

  podman-compose -f "$f" up -d 2>&1
  sleep 5

  # Check all containers in this file are running
  running=$(podman-compose -f "$f" ps --format '{{.State}}' 2>/dev/null | grep -c "running" || true)
  expected=$(podman-compose -f "$f" config --services 2>/dev/null | wc -l)

  if [ "$running" -ge "$expected" ]; then
    echo "PASS: ${f} — ${running}/${expected} running"
    PASS=$((PASS + 1))
  else
    echo "FAIL: ${f} — ${running}/${expected} running"
    FAIL=$((FAIL + 1))
  fi

  podman-compose -f "$f" down 2>&1
  echo ""
done

echo "=== Results: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped ==="
[ "$FAIL" -eq 0 ]
