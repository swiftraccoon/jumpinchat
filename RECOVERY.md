# Backup and recovery

The backup utility supports the full and lite single-host deployments with local
uploads. It requires Python 3.11+, the selected container engine, and its Compose
CLI. It does not configure a schedule, retention policy, or off-site storage.

## Before relying on backups

Choose a maximum acceptable backup age (data loss) and a maximum recovery time.
Record these with the deployment owner. Keep backups on encrypted storage with
access restricted to operators. Copies contain account data and private uploads.
Keep an off-host copy and a separately protected copy of the environment file,
TLS material, application revision, and Compose configuration. Do not commit
these to Git. Checksum verification detects accidental corruption; it does not
authenticate a backup supplied by an untrusted party.

The two MongoDB containers are not a replacement for a backup. Monitor the backup
job's exit status and last successful backup age. Do not silently ignore a failed
job. Retention deletion should be configured only after a restore has succeeded.

## Create a local-storage backup

For an installation created by `scripts/local.py`, the launcher supplies its
project and Compose configuration:

```bash
python3 scripts/local.py backup
```

The command briefly stops application services and saves the two archives and
manifest under `jumpinchat-deploy/.local/backups/`. It prints the resulting path.
Use `--destination /secure/backups/new-directory` to select another new directory;
its parent must exist. Keep the local state directory, including its secrets and
TLS files, separately protected. Backups on the same machine do not cover loss of
that machine.

For manually configured deployments, use the underlying utility:

Use the actual Compose project name shown by your deployment. The destination's
parent directory must exist; the destination itself must not exist.

```bash
python3 scripts/backup.py create /secure/backups/jic-2026-09-08 \
  --project jumpinchat-deploy --maintenance
python3 scripts/backup.py verify /secure/backups/jic-2026-09-08
```

For Docker, add `--engine docker`. For lite, add
`--compose-file jumpinchat-deploy/compose.lite.yml`.

The command stops currently running web/home instances, dumps the `tc` database,
archives public and private uploads from the same volume, and restarts only the
instances that were running before it started. It uses the existing web image to
read the upload volume without networking. All application writers must use this
deployment; stop external writers separately before starting. Requests and calls
can be interrupted during maintenance.

Container discovery uses both project and service labels. Before dumping, the
utility verifies that every selected writer actually stopped. Recovery starts
the recorded containers individually and runs their configured health probes
with bounded retries; a stale container health label cannot make a failed
restart appear successful. Recovery failures return a nonzero exit status even
when the archives were written successfully.

A successful directory contains two archives and a checksummed version-2 manifest.
The manifest records the source MongoDB version, FCV and Database Tools version.
Checksum verification also accepts older version-1 manifests, but those lack the
version metadata: recover the recorded original server/tool versions separately.
Restore archives to a compatible server release; do not assume an old dump can
be imported directly into 8.3.

If a command fails, preserve the output for diagnosis; an incomplete directory must
not be treated as a backup. Check application health after the command, including
when it exits nonzero. A machine crash or forced process termination can prevent
automatic service restart.

## Restore into an isolated deployment

Restore verification is an operator-run procedure. Do not run it against the
source project, database URI, upload volume, or S3 bucket.

1. On a separate host/VM, check out the recorded application revision. Prepare
   fresh configuration and TLS material using the recorded compatible database
   release and tools (8.3 for current backups). Keep outbound email/payments disabled
   and restrict ingress. Copy the backup to this host and run `backup.py verify`.
2. Use a new Compose project, for example `jic-restore`, **and a separate checkout
   with empty `jumpinchat-deploy/data/` directories**. A project name alone does
   not isolate the MongoDB bind mounts. Confirm that database URLs resolve to the
   new database containers and upload volumes are new. Start only the data tier.
3. Initialize the fresh replica set with `scripts/init-mongo.sh` and the same
   project name. Confirm the destination database has no user collections. Stop
   if it contains existing data; investigate instead of dropping collections.
4. Import the database archive into the isolated MongoDB container:

   ```bash
   cd jumpinchat-deploy
   podman-compose -p jic-restore -f docker-compose.yml exec -T mongodb \
     mongorestore --archive --gzip < /secure/backups/jic-2026-09-08/database.archive.gz
   ```

   The archive retains its database name. Do not add `--drop`, point this command
   at production, or reuse a production `MONGODB_URI`.
5. Create the new web container/volume without starting application writers.
   With the fresh web container ID and its built image, restore uploads:

   ```bash
   podman run --rm --network=none --volumes-from FRESH_WEB_CONTAINER \
     --entrypoint tar WEB_IMAGE -C /data/uploads -xzf - \
     < /secure/backups/jic-2026-09-08/uploads.tar.gz
   ```

   Replace both placeholders after inspecting the isolated deployment. Extract
   only trusted archives produced by your backup job. Confirm file ownership and
   that both `public/` and `private/` were restored.
6. Start the remaining isolated services. Check `/health/ready` on both web and
   homepage instances. Verify account login, a saved room's settings, a public
   image, authorized private-file access, and a two-browser chat/media session.
7. Record backup age, restore duration, application revision, results, and any
   manual steps. Compare them with the recovery targets. Keep production running
   separately; switching users to the restored deployment is a separate decision.

## Local container rehearsal

The September 2026 localhost check exercised the real backup utility's
maintenance stop/start sequence, then restored its archives into fresh MongoDB
and upload volumes in containers with no network access. Three account documents,
three saved room documents, index definitions for all 26 collections and four public
image files matched the source snapshot taken after application writers stopped.
The source web/home containers resumed with the same identities. Temporary
restore resources were removed, and the source installation remained running.
The `local.py backup` command also completed successfully.

This verifies fresh local data and container backup orchestration. It did not
boot another application stack against the restored volumes, migrate existing
MongoDB 4.4 data, restore S3 objects or validate provider accounts. The complete
isolated-deployment procedure above remains necessary for a production cutover.

## S3 and split-server deployments

The utility refuses S3 storage rather than creating a misleading database-only
backup. For S3, stop all application writers across all app hosts, then capture
the MongoDB dump and the complete object namespace (`public/` and `private/`) in
the same maintenance window. Use the storage provider's backup/export mechanism
to preserve object content and needed metadata; record the bucket, snapshot or
object-version identifiers, and checksums alongside the database backup. Resume
writers only after both parts are complete.

Restore into a new bucket and new database on an isolated deployment. Configure
the app and nginx to use that bucket and repeat the verification above. Bucket
versioning or replication alone is not a demonstrated restore procedure. A
provider-specific restore exercise remains required before enabling scheduled
S3 backups.

## Upgrade an existing MongoDB 4.4 deployment

This checkout targets MongoDB 8.3. Its startup wrapper checks
`data/db/.jic-mongodb-series` (and `data/db2` for the second full-profile member).
It creates the marker only for an empty directory. An existing unmarked directory
is refused before `mongod` can open it. Never remove database files to bypass this
check, and never mark a 4.4 directory as 8.3.

1. Inventory the running server version, featureCompatibilityVersion (FCV),
   replica-set membership, application revision and data paths. Keep the recorded
   old revision and image digests available. Use that revision's matching tools
   to take a coordinated backup of the database and public/private uploads. The
   new backup tool expects a completed 8.3 migration. Verify a restore into an
   isolated copy using the original database release before upgrading anything.
2. Rehearse on copies on a separate host/VM with enough free disk space. A new
   Compose project name alone does not isolate the `data/db` bind mount. Do not
   expose test app writers, mail or payments to production services. Keep the
   original data and backup untouched for recovery.
3. Upgrade the copied database through the latest patch of **4.4 → 5.0 → 6.0 →
   7.0 → 8.0 → 8.3**. Follow MongoDB's release-specific replica-set upgrade guide
   at each step, including platform/CPU requirements, removed configuration,
   indexes and FCV prerequisites. Use a separate migration Compose definition
   with the matching upstream image and its upstream entrypoint. The application
   Compose guard is intentionally not used until migration is complete. Upgrade
   all members and verify their health before raising FCV for that step. Keep a
   majority available; a two-member set cannot lose either member without losing
   a majority. Do not use the lite init script to force a topology change.
4. At each step, use the shell and Database Tools supported by that release.
   MongoDB 6+ uses `mongosh`; the old `mongo` shell is removed. Confirm both the
   binary version and FCV before proceeding. The supported direct path from
   8.0 to 8.3 requires a completed 8.0/FCV 8.0 deployment. A BSON dump/restore
   across all those releases is not a substitute for checking format and tool
   compatibility.
5. Validate collections, indexes, document counts and representative queries on
   the 8.3 copy. Set and verify FCV 8.3 on all members. Test the upgraded app's
   account/session flows, room data, uploads and payments with isolated test
   services. Capture a fresh coordinated backup and rehearse its restore on 8.3.
6. Plan the production maintenance window from the measured rehearsal. Stop all
   writers, take the final coordinated backup, and perform the rehearsed steps.
   Only after verifying **server 8.3 and FCV 8.3**, stop database containers cleanly
   and write the line `8.3` to `.jic-mongodb-series` in each migrated data directory,
   preserving directory ownership. This marker records completed operator
   verification; writing it does not perform or validate a migration itself.
7. Start the guarded 8.3 services from this checkout and confirm replica health,
   then start app writers and check readiness, login and persisted data. Retain
   the original backup and recorded old software. Rollback after writes or FCV
   changes is a restore/cutover decision; never point an old binary at the
   upgraded data directory.

Release procedures: [5.0](https://www.mongodb.com/docs/v5.0/release-notes/5.0-upgrade-replica-set/),
[6.0](https://www.mongodb.com/docs/v6.0/release-notes/6.0-upgrade-replica-set/),
[7.0](https://www.mongodb.com/docs/v7.0/release-notes/7.0-upgrade-replica-set/),
[8.0](https://www.mongodb.com/docs/v8.0/release-notes/8.0-upgrade-replica-set/), and
[8.0 to 8.3](https://www.mongodb.com/docs/manual/release-notes/8.3-upgrade-from-8.0-replica-set/).

## Synthetic runtime and restore rehearsal

After installing application dependencies and building the web/homepage assets,
run this optional integration check from the repository root with Node 24 LTS,
MongoDB 8.3, Redis 8.10.1 and Database Tools 100.18.0 binaries for the host:

```bash
node scripts/test-runtime.mjs \
  --mongod /path/to/mongod \
  --redis /path/to/redis-server \
  --mongodump /path/to/mongodump \
  --mongorestore /path/to/mongorestore
```

The script allocates random loopback ports and fresh temporary directories. It
never accepts an existing database URI or Compose volume. It checks two web
processes and the homepage against disposable data, including login, guest
sessions, cross-process chat, Redis limits and Mongo-backed sessions. Payment
grant/retry and cancellation-ordering checks use a separate temporary MongoDB
database with Stripe responses doubled. For the restore rehearsal, the script
stops its application writers, dumps the synthetic database, archives public
and private upload fixtures, verifies the backup manifest, and restores into
another fresh MongoDB process and upload directory. It compares account/room/
session records, indexes including session TTL, password hashes and upload
bytes. Its processes and data directories are removed when it finishes.

Without the two Database Tools arguments, only runtime checks run. The optional
`--browser-check` prints local browser URLs and a temporary completion-marker
path; creating that marker ends the browser window, which lasts at most five
minutes. Janus media and external email/payment services are disabled in this
fixture. This test does not exercise Compose stop/start orchestration in
`backup.py`, real operator backups, existing 4.4 data upgrades or live media.
Review the current [versioning policy](https://www.mongodb.com/docs/manual/reference/versioning/)
and compatibility changes before each migration. No script in this checkout runs
that migration or deletes the prior data.
