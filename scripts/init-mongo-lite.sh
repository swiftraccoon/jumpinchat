#!/usr/bin/env bash
set -euo pipefail

# Set up the single-member replica set for the lite profile.
# Run once after `podman-compose -f compose.lite.yml up -d`.
#
# Handles both cases:
#  - fresh data dir: initiates rs0 with the single mongodb member
#  - migrating from the full profile: force-removes the old
#    mongodbslave member (a lone member of a 2-member set has no
#    majority and would stay SECONDARY forever)

cd "$(dirname "$0")/../jumpinchat-deploy"

podman-compose -f compose.lite.yml exec mongodb mongo --quiet --eval '
var status = null;
try { status = rs.status(); } catch (e) { status = { code: e.code }; }
if (status.code === 94 /* NotYetInitialized */) {
  printjson(rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongodb:27017" }] }));
} else {
  var cfg = rs.conf();
  var single = cfg.members.filter(function (m) { return m.host === "mongodb:27017"; });
  if (cfg.members.length > 1 && single.length === 1) {
    cfg.members = single;
    cfg.version += 1;
    printjson(rs.reconfig(cfg, { force: true }));
  } else {
    print("replica set already configured: " + cfg.members.map(function (m) { return m.host; }).join(", "));
  }
}'
