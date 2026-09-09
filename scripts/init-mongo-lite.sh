#!/usr/bin/env bash
set -euo pipefail

# Initialize a fresh single-member replica set; changing an existing topology
# is an explicit operator migration, never an automatic force-reconfiguration.
cd "$(dirname "$0")/../jumpinchat-deploy"
compose_command=(podman-compose)
if [[ "${CONTAINER_ENGINE:-podman}" == docker ]]; then
  compose_command=(docker compose)
fi
"${compose_command[@]}" -f compose.lite.yml exec -T mongodb mongosh --quiet --eval '
try {
  const current = rs.conf();
  if (current._id !== "rs0" || current.members.length !== 1 ||
      current.members[0].host !== "mongodb:27017") {
    print("Existing replica-set topology differs; no changes made. See RECOVERY.md.");
    quit(1);
  }
  print("Replica set already initialized.");
} catch (err) {
  if (err.code !== 94) throw err;
  const result = rs.initiate({ _id: "rs0", members: [
    { _id: 0, host: "mongodb:27017" }
  ] });
  if (!result.ok) { printjson(result); quit(1); }
  print("Replica set initialized; allow time for primary election.");
}'
