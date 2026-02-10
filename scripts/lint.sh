#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../jumpinchat-web"

npx eslint srv/ react-client/ "$@"
