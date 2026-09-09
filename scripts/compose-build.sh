#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../jumpinchat-deploy"

node ../scripts/preflight.mjs
echo "Building all container images..."
podman-compose build --build-arg "BUILD_REVISION=$(git rev-parse HEAD)" "$@"
