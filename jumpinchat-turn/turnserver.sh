#!/bin/sh
set -eu
: "${TURN_SHARED_SECRET:?Set TURN_SHARED_SECRET to match the application}"
: "${TURN_REALM:?Set TURN_REALM to the TURN server hostname}"
: "${EXTERNAL_IP:?Set EXTERNAL_IP to the TURN server public address}"

# Values become config directives, so reject embedded lines and syntax.
case "$TURN_SHARED_SECRET" in *[!A-Za-z0-9_-]*) echo 'TURN_SHARED_SECRET must contain only letters, digits, dash or underscore' >&2; exit 1;; esac
case "$TURN_REALM" in *[!A-Za-z0-9.-]*) echo 'Invalid TURN_REALM' >&2; exit 1;; esac
case "$EXTERNAL_IP" in *[!0-9a-fA-F:./]*) echo 'EXTERNAL_IP must contain IP addresses' >&2; exit 1;; esac

umask 077
turn_config=$(mktemp /tmp/jic-turn.XXXXXX)
cat > "$turn_config" <<CONFIG
listening-port=3478
tls-listening-port=5349
min-port=49160
max-port=49200
external-ip=$EXTERNAL_IP
realm=$TURN_REALM
fingerprint
use-auth-secret
static-auth-secret=$TURN_SHARED_SECRET
stale-nonce=600
log-file=stdout
simple-log
CONFIG

if [ "${TURN_TLS:-true}" = true ]; then
  if [ ! -r /etc/certs/fullchain.pem ] || [ ! -r /etc/certs/privkey.pem ]; then
    echo 'Mount readable TLS files at /etc/certs/fullchain.pem and /etc/certs/privkey.pem' >&2
    exit 1
  fi
  printf '%s\n' 'cert=/etc/certs/fullchain.pem' 'pkey=/etc/certs/privkey.pem' >> "$turn_config"
else
  printf '%s\n' no-tls >> "$turn_config"
fi
exec turnserver -c "$turn_config" "$@"
