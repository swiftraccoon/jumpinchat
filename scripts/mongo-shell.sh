#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../jumpinchat-deploy"
compose_command=(podman-compose)
if [[ "${CONTAINER_ENGINE:-podman}" == docker ]]; then
  compose_command=(docker compose)
fi
"${compose_command[@]}" -f "${COMPOSE_FILE:-docker-compose.yml}" exec mongodb mongosh tc "$@"
