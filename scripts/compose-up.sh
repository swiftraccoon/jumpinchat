#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../jumpinchat-deploy"

podman-compose up -d "$@"

echo ""
echo "Waiting for containers to start..."
sleep 5

echo "Restarting nginx and haproxy to pick up fresh DNS..."
podman-compose restart nginx haproxy

echo ""
echo "Services available at:"
echo "  HTTP:  http://localhost:8080"
echo "  HTTPS: https://localhost:8443"
