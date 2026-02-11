#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../jumpinchat-web"

./node_modules/.bin/gulp compile:js compile:js:esNext "$@"
