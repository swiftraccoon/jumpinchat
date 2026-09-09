#!/usr/bin/env bash
set -euo pipefail

# Initialize only a fresh full-profile replica set. Never force-reconfigure an
# existing set; lite migrations use the separately documented lite procedure.
cd "$(dirname "$0")/../jumpinchat-deploy"
compose_command=(podman-compose)
if [[ "${CONTAINER_ENGINE:-podman}" == docker ]]; then
  compose_command=(docker compose)
fi
"${compose_command[@]}" "$@" exec -T mongodb mongo --quiet --eval '
try {
  var current = rs.conf();
  if (current._id !== "rs0" || current.members.length !== 2 ||
      current.members[0].host !== "mongodb:27017" ||
      current.members[1].host !== "mongodbslave:27017") {
    print("Existing replica-set topology differs; no changes made.");
    quit(1);
  }
  print("Replica set already initialized.");
} catch (err) {
  if (err.code !== 94) throw err;
  var result = rs.initiate({ _id: "rs0", members: [
    { _id: 0, host: "mongodb:27017" },
    { _id: 1, host: "mongodbslave:27017" }
  ] });
  if (!result.ok) { printjson(result); quit(1); }
  print("Replica set initialized; allow time for primary election.");
}'
