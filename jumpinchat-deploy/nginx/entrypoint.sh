#!/usr/bin/env bash
set -euo pipefail
/tmp/scripts/site.conf.sh
exec nginx -g 'daemon off;'
