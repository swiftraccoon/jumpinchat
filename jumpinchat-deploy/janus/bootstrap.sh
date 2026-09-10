#!/usr/bin/env bash

set -euo pipefail
JANUS_DIR="${JANUS_DIR:-/opt/janus}"

if [ -z "${JANUS_TOKEN_SECRET:-}" ]; then
  echo "janus token secret is missing" >&2
  exit 1
fi

if [ -z "${SERVER_NAME:-}" ]; then
  echo "server name is missing" >&2
  exit 1
fi

# set colors from env var if it exists
# set this to 'no' for prod so logs
# don't get polluted by color codes
if [ -z "${DEBUG_COLORS:-}" ]; then
  DEBUG_COLORS=true
fi

if [ -z "${ENABLE_EVENTS:-}" ]; then
  ENABLE_EVENTS=true
fi

: "${NAT_1_1_IP:?Set NAT_1_1_IP to the media server address}"
KEEP_PRIVATE_HOST="${KEEP_PRIVATE_HOST:-false}"
RTP_PORT_MIN="${RTP_PORT_MIN:-20000}"
RTP_PORT_MAX="${RTP_PORT_MAX:-20100}"
if [[ ! "$KEEP_PRIVATE_HOST" =~ ^(true|false)$ ]] ||
   [[ ! "$RTP_PORT_MIN" =~ ^[0-9]{4,5}$ ]] || [[ ! "$RTP_PORT_MAX" =~ ^[0-9]{4,5}$ ]] ||
   (( 10#$RTP_PORT_MIN < 1024 || 10#$RTP_PORT_MAX > 65535 || 10#$RTP_PORT_MIN > 10#$RTP_PORT_MAX )); then
  echo 'Invalid private-host or RTP port-range configuration' >&2
  exit 1
fi
JANUS_EVENTS_URL="${JANUS_EVENTS_URL:-http://haproxy/api/janus/events}"
STUN_CONFIG=""
if [[ -n "${STUN_SERVER-stun1.l.google.com}" ]]; then
  STUN_CONFIG="stun_server = \"${STUN_SERVER-stun1.l.google.com}\"; stun_port = 19302;"
fi

echo "generating the config file"

# make the janus configuration
cat << EOF > ${JANUS_DIR}/etc/janus/janus.jcfg
general: {
  configs_folder = "${JANUS_DIR}/etc/janus"
  plugins_folder = "${JANUS_DIR}/lib/janus/plugins"
  debug_level = 4
  debug_timestamps = true
  debug_colors = ${DEBUG_COLORS}
  server_name = "${SERVER_NAME}"
  session_timeout = 60
  reclaim_session_timeout = 60

  token_auth = true
  token_auth_secret = "${JANUS_TOKEN_SECRET}"

}

nat: {
  ${STUN_CONFIG}
  server_name = "JumpInChat"
  full_trickle = true
  ice_enforce_list = "eth0"
  nat_1_1_mapping = "${NAT_1_1_IP}"
  keep_private_host = ${KEEP_PRIVATE_HOST}
}

certificates: {
  cert_pem = "${JANUS_DIR}/certs/fullchain.pem"
  cert_key = "${JANUS_DIR}/certs/privkey.pem"
}

media: {
  rtp_port_range = "${RTP_PORT_MIN}-${RTP_PORT_MAX}"
  no_media_timer = 5
}

plugins: {
  # Only VideoRoom is compiled into this image.
}

events: {
  broadcast = ${ENABLE_EVENTS}
  # Only the HTTP sample event handler is compiled.
  stats_period = 0
}

EOF

cat << EOF > ${JANUS_DIR}/etc/janus/janus.transport.http.jcfg
general: {
  base_path = "/janus"
  threads = "unlimited"
  http = true
  port = 8088
  https = true
  secure_port = 8889
}

admin: {
  admin_base_path = "/admin"
  admin_threads = "unlimited"
  admin_http = true
  admin_port = 7888
  admin_https = true
  admin_secure_port = 7889
}

certificates: {
  cert_pem = "${JANUS_DIR}/certs/fullchain.pem"
  cert_key = "${JANUS_DIR}/certs/privkey.pem"
}
EOF

cat << EOF > ${JANUS_DIR}/etc/janus/janus.transport.websockets.jcfg
general: {
  ws = true
  ws_port = 8188
  wss = true
  wss_port = 8989
}

certificates: {
  cert_pem = "${JANUS_DIR}/certs/fullchain.pem"
  cert_key = "${JANUS_DIR}/certs/privkey.pem"
}
EOF

cat << EOF > ${JANUS_DIR}/etc/janus/janus.eventhandler.sampleevh.jcfg
general: {
  enabled = ${ENABLE_EVENTS}
  events = "plugins"
  grouping = true
  backend = "${JANUS_EVENTS_URL}"
}
EOF

cat << EOF > ${JANUS_DIR}/etc/janus/janus.plugin.videoroom.jcfg
general: {
  string_ids = true
}
EOF
