#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
npm --prefix "$repo_dir/jumpinchat-web" run lint -- "$@"
npm --prefix "$repo_dir/jumpinchat-homepage" run lint -- --quiet "$@"
npm --prefix "$repo_dir/jumpinchat-email" run lint -- "$@"
