# JumpInChat deployment

The default lite profile runs one web server, homepage, Janus media server,
MongoDB replica-set member, Redis and email service behind nginx. The full profile
adds second web/home/media/database instances and HAProxy. See the
[root README](../README.md) for application setup and TLS preparation.

## Existing installations

The data image is MongoDB 8.3. **Do not start it on a MongoDB 4.4 data directory.**
The included entrypoint refuses an existing directory unless an operator has
recorded the completed migration. Follow the staged migration in
[RECOVERY.md](../RECOVERY.md#upgrade-an-existing-mongodb-44-deployment) first.
Database and upload directories are never removed by these scripts.

The archived MinIO community service and its Compose profile have been retired.
Existing objects must be copied to a maintained external S3 service or the local
upload volume before switching the application; see the storage section below.

## Fresh single-server deployment

Run these commands from this directory after configuring secrets, `JANUS_NAT_IP`
and TLS files. Empty database directories receive the 8.3 marker automatically.

```bash
node ../scripts/init-env.mjs
node ../scripts/preflight.mjs --profile lite
podman-compose -f compose.lite.yml build
podman-compose -f compose.lite.yml up -d
../scripts/init-mongo-lite.sh
```

For the full profile use `compose.yml` and `../scripts/init-mongo.sh -f compose.yml`.
`docker-compose.yml` is the generated standalone equivalent for Compose versions
without `include` support. Docker users can substitute `docker compose` and set
`CONTAINER_ENGINE=docker` for the initialization scripts. Pass `-p PROJECT` to
`init-mongo.sh` when the full deployment has a custom project name.

Both initialization scripts accept an already-matching topology and refuse a
different one. They do not force-remove replica-set members. Topology changes
need a separate migration with the current majority available; changing Compose
profiles does not perform that migration.

For rootless Podman boot startup, run `../scripts/enable-boot-start.sh` once per
host and check `systemctl --user status podman-restart.service`.

## Runtime versions and builds

| Component | Maintained release |
|---|---|
| Application and asset build | Node 24 LTS, matching Debian Trixie build/runtime |
| Homepage | Node 24 LTS |
| Email | Node 24 LTS |
| Database | MongoDB 8.3 with `mongosh` and bundled Database Tools |
| Cache/session bus | Redis 8.10.1 |
| Media server | Janus 1.4.1 on Ubuntu 26.04 LTS |
| Optional TURN relay | Upstream coturn 4.18 |
| Reverse proxy / load balancer | Current stable nginx / HAProxy 3.4 |

Upstream images are pinned by digest in Dockerfiles/Compose and recorded in
`images.lock.json`. Janus source is pinned by release and SHA-256. Its build uses
Ubuntu's maintained OpenSSL, SRTP, libnice and WebSocket packages, compiling only
VideoRoom, HTTP/WebSocket transports and HTTP event handling. Package repository
updates are intentionally consumed when rebuilding. Builds are not claimed to be
byte-for-byte reproducible; schedule rebuilds and runtime smoke checks when pins
or distro packages change.

Application installs use the committed npm lockfiles with `npm ci`; incompatible
peer dependencies fail the build. The web runtime copies from the matching Node
base instead of running a remote NodeSource installer. The old MongoDB 3.6,
Python 2, Bower, and native crypto-library installation scripts are removed.

## Service groups

| Compose file | Services |
|---|---|
| `compose.lite.yml` | web, home, janus, mongodb, redis, nginx, email |
| `compose.yml` | Includes app, media, data and email groups |
| `compose.app.yml` | web, web2, home, home2, haproxy, nginx |
| `compose.media.yml` | janus, janus2 |
| `compose.data.yml` | mongodb, mongodbslave, redis |
| `compose.email.yml` | email |
| `compose.turn.yml` | Optional TURN relay, with its own public address |
| `docker-compose.yml` | Generated full deployment |

For multiple hosts, combine app/data/email on one host and media on another, or
run each group separately. Configure `MONGODB_URI`, `REDIS_URI`, `EMAIL_URL` and
nginx's `JANUS_*_HOST` values for those hosts. Set `JANUS_EVENTS_URL` on the media
host to its reachable app endpoint ending in `/api/janus/events`; lite defaults
to `http://web/api/janus/events`, full defaults to HAProxy. Per-group templates
are in `env/`. Multiple app hosts using local storage need the same shared upload
filesystem; external S3 avoids that shared filesystem requirement.

## Local and external S3 storage

`STORAGE_BACKEND=local` uses the existing upload volume. Public images live below
`public/`; private verification files live below `private/`. Automated backups
cover both and MongoDB together.

For AWS S3 or a maintained compatible service, configure:

```dotenv
STORAGE_BACKEND=s3
S3_ENDPOINT=
S3_ACCESS_KEY=your-application-access-key
S3_SECRET_KEY=your-application-secret
S3_BUCKET=uploads
S3_REGION=us-east-1
S3_PUBLIC_BASE_URL=https://assets.example.com/public/
```

An empty API endpoint selects AWS's regional endpoint. A compatible provider may
require its own HTTPS `S3_ENDPOINT`. The nginx-only `S3_PUBLIC_BASE_URL` must end
in `/public/`, optionally below a bucket path: for example,
`https://s3.example.com/uploads/public/`. It must serve public image GETs without
an application cookie or Authorization header. Use a provider origin/CDN with a
valid TLS certificate and make **only** the `public/` namespace readable. Do not
make the whole bucket public. nginx keeps the application's `/uploads/...` URLs,
verifies origin TLS and only proxies supported image filenames into that public
prefix. The API endpoint and public origin can be different.

Private images are fetched by the API using its storage credentials only after
validating the existing expiring signed file token. They are streamed through
`/api/internal/file/...` with private, no-store headers and never use the public
origin. The application accepts both `private/...` keys and historical absolute
paths below the configured private upload directory. Keeping the upload base
path and object layout unchanged preserves database references when moving
between local and S3 storage.

To leave MinIO, stop application writers and copy the complete `public/` and
`private/` namespaces plus content-type metadata to the new provider or local
volume. Reconcile object counts and checksums, including private objects; retain
the source until restore and application checks succeed. Configure the new
backend, verify an old image URL, upload/delete an image, and verify authorized
private-file access before resuming users. The retired MinIO volume is not
removed automatically. Do not attach it as another product's data directory.

S3 backup/restore remains provider-specific. Complete the coordinated procedure
in [RECOVERY.md](../RECOVERY.md#s3-and-split-server-deployments) before relying on it.

## TURN and TLS

Set `TURN_URIS` on the app and the same random `TURN_SHARED_SECRET` on the app and
relay. The optional `compose.turn.yml` additionally requires `TURN_REALM` and
`TURN_EXTERNAL_IP`; see [TURN deployment](../jumpinchat-turn/README.md).

TLS certificates are mounted at runtime into nginx and Janus, so renewal does
not require rebuilding an image. Replace the files, reload nginx and restart
Janus during a media maintenance window. Preserve file ownership/read access in
the container user namespace. Active calls are interrupted by Janus restarts.

## Verification

Edit service groups and regenerate with `python3 ../scripts/generate-compose.py`.
`--check` detects drift; lite remains a separate topology. Run preflight, Compose
configuration checks, clean builds and service readiness checks after changes.
`/health/live` reports process liveness and `/health/ready` checks dependencies.
HAProxy uses readiness; stop timeouts exceed the app's shutdown deadline.

Operational regression checks:

```bash
python3 ../scripts/test_backup.py
python3 ../scripts/test_mongo_guard.py
python3 nginx/test_config.py
```

The Janus image can report its version without network access using
`podman run --rm --network=none --entrypoint /opt/janus/bin/janus IMAGE --version`.
Also test real publication/subscription, reconnects and TURN relay media with two
browsers after deployment. Check both login/session persistence and stored data
against the new database. Local image tags do not push anything to a registry.
