#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../jumpinchat-web"

npm install --legacy-peer-deps "$@"
