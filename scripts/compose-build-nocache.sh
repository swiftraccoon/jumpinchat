#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../jumpinchat-deploy"

echo "Building all container images (no cache)..."
podman-compose build --no-cache "$@"
