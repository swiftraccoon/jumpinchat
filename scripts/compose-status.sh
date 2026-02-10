#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../jumpinchat-deploy"

podman-compose ps "$@"
