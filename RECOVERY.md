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

A successful directory contains two archives and a checksummed manifest. If a
command fails, preserve the output for diagnosis; an incomplete directory must
not be treated as a backup. Check application health after the command, including
when it exits nonzero. A machine crash or forced process termination can prevent
automatic service restart.

## Restore into an isolated deployment

Restore verification is an operator-run procedure. Do not run it against the
source project, database URI, upload volume, or S3 bucket.

1. On a separate host/VM, check out the recorded application revision. Prepare
   fresh configuration and TLS material. Keep outbound email/payments disabled
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
