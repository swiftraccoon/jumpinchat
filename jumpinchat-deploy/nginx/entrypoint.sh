#!/bin/bash
set -e

# Generate nginx config at container start (not build time)
# so upstream DNS resolves to current container IPs
/tmp/scripts/site.conf.sh

# Start nginx in the background
nginx -g 'daemon off;' &
NGINX_PID=$!

# Give backends time to fully start, then reload to refresh
# upstream DNS that may have resolved before backends were ready
sleep 15
nginx -s reload 2>/dev/null || true

# Forward signals so 'podman stop' shuts down cleanly
trap "kill $NGINX_PID 2>/dev/null; exit 0" SIGTERM SIGINT
wait $NGINX_PID
