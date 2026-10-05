#!/usr/bin/env bash
set -euo pipefail

# Normal startup accepts only this binary's completed series marker. The
# explicit migration mode records a *pending* transition before 9.0 touches data;
# it never claims that FCV or the operator's verification has completed.
check_only=false
upgrade=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) check_only=true; shift ;;
    --upgrade-from-8.3) upgrade=true; shift ;;
    *) break ;;
  esac
done

# Read the installed binary, not an environment value that could mislabel it.
version_output=$(mongod --version)
binary_version=${version_output%%$'\n'*}
if [[ "$binary_version" =~ ^db\ version\ v(8\.3|9\.0)\.[0-9]+$ ]]; then
  series=${BASH_REMATCH[1]}
else
  echo 'Unsupported MongoDB binary; this guard supports only 8.3 and 9.0.' >&2
  exit 1
fi

database_path="${JIC_MONGO_DB_PATH:-/data/db}"
marker="${database_path}/.jic-mongodb-series"
pending=9.0-pending-fcv
if [[ -L "$marker" || ( -e "$marker" && ! -f "$marker" ) ]]; then
  echo 'Invalid MongoDB series marker; refusing startup.' >&2
  exit 1
fi
recorded=''
if [[ -f "$marker" ]]; then recorded=$(cat "$marker"); fi

if [[ "$upgrade" == true ]]; then
  if [[ "$series" != 9.0 || ( "$recorded" != 8.3 && "$recorded" != "$pending" ) ]]; then
    echo 'Migration mode requires a MongoDB 9.0 binary and an 8.3 or 9.0-pending-fcv marker. Follow RECOVERY.md.' >&2
    exit 1
  fi
elif [[ -f "$marker" ]]; then
  if [[ "$recorded" != "$series" ]]; then
    echo "MongoDB data was prepared for another release or has a pending migration. Follow RECOVERY.md before starting ${series}." >&2
    exit 1
  fi
elif [[ -d "$database_path" ]] && [[ -n "$(find "$database_path" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo 'Existing MongoDB data has no completed series marker. Refusing to open it; follow RECOVERY.md.' >&2
  exit 1
fi

if [[ "$check_only" == true ]]; then exit 0; fi
mkdir -p "$database_path"
if [[ "$upgrade" == true && "$recorded" == 8.3 ]]; then
  # Even a failed first launch must not make an old binary look safe to run.
  printf '%s\n' "$pending" > "$marker"
elif [[ ! -f "$marker" ]]; then
  printf '%s\n' "$series" > "$marker"
fi
exec /usr/local/bin/docker-entrypoint.sh "$@"
