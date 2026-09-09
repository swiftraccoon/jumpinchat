#!/usr/bin/env bash
set -euo pipefail
/tmp/scripts/bootstrap.sh
exec /opt/janus/bin/janus
