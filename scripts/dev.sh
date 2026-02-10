#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../jumpinchat-web"

NODE_OPTIONS=--openssl-legacy-provider ./node_modules/.bin/gulp --gulpfile gulpfile.cjs watchify "$@"
