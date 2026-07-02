#!/usr/bin/env bash
set -euo pipefail

# Rootless podman has no daemon, so containers with restart=always are
# NOT restored after a reboot unless:
#  1. the user's systemd instance starts at boot (lingering), and
#  2. the per-user podman-restart.service runs to restart them.

loginctl enable-linger "$USER"
systemctl --user enable --now podman-restart.service

echo "Boot persistence enabled for user $USER."
echo "Verify with: systemctl --user status podman-restart.service"
