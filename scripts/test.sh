#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
npm --prefix "$repo_dir/jumpinchat-web" test -- "$@"
npm --prefix "$repo_dir/jumpinchat-web" run test:client
npm --prefix "$repo_dir/jumpinchat-homepage" test
