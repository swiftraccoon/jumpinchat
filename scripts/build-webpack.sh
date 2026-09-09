#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../jumpinchat-web"

node build.js "$@"
