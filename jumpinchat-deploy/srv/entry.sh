#!/bin/sh
set -eu
nginx
# Node receives container termination signals directly.
exec node /var/www/jic-web/srv/index.js
