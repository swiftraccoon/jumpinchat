#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../jumpinchat-web"

NODE_ENV=test npx mocha --exit --recursive 'srv/**/*.spec.js' --timeout 10000 "$@"
