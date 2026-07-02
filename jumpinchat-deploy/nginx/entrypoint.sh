#!/bin/bash
set -e

# Generate nginx config at container start (not build time)
# so upstream DNS resolves to current container IPs
/tmp/scripts/site.conf.sh

# Start nginx in the background. Upstream DNS re-resolves at runtime
# (resolver + 'resolve' in site.conf), so no startup reload is needed.
nginx -g 'daemon off;' &
NGINX_PID=$!

# Forward signals so 'podman stop' shuts down cleanly
trap "kill $NGINX_PID 2>/dev/null; exit 0" SIGTERM SIGINT
wait $NGINX_PID
