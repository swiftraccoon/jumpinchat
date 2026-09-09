#!/usr/bin/env bash
set -euo pipefail

# A MongoDB 8.3 process must never open the old 4.4 data directory by accident.
# --check validates without modifying data, for preflight and automated checks.
database_path="${JIC_MONGO_DB_PATH:-/data/db}"
marker="${database_path}/.jic-mongodb-series"
if [[ -f "$marker" ]]; then
  if [[ "$(cat "$marker")" != 8.3 ]]; then
    echo 'MongoDB data was prepared for another release. Follow RECOVERY.md before starting 8.3.' >&2
    exit 1
  fi
elif [[ -d "$database_path" ]] && [[ -n "$(find "$database_path" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo 'Existing MongoDB data has no 8.3 migration marker. Refusing to open it; follow RECOVERY.md.' >&2
  exit 1
fi

if [[ "${1:-}" == --check ]]; then
  exit 0
fi
mkdir -p "$database_path"
if [[ ! -f "$marker" ]]; then
  printf '%s\n' 8.3 > "$marker"
fi
exec /usr/local/bin/docker-entrypoint.sh "$@"
