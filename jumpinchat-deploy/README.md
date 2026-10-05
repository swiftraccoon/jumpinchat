# JumpInChat deployment

The default lite profile runs one web server, homepage, Janus media server,
MongoDB replica-set member, Redis and email service behind nginx. The full profile
adds second web/home/media/database instances and HAProxy. See the
[root README](../README.md) for application setup and TLS preparation.

## Local development installation

From the repository root, `python3 scripts/local.py up` prepares and starts a
persistent localhost installation. It derives the application services from
`compose.lite.yml`, adds local Mailpit and TURN services, creates private TLS and
environment files, and initializes its own MongoDB replica set. Use
`python3 scripts/local.py status` for the selected URLs and service state.
`python3 scripts/local.py open` launches Chrome/Chromium with a separate profile
and trust scoped to this installation's certificate; other browsers can use the
certificate path printed by `status`. `up --build` rebuilds the local images after
source changes. `backup` creates a coordinated database-and-upload backup; see
[recovery instructions](../RECOVERY.md).

This profile has separate named volumes and stores its configuration under
`.local/`. `python3 scripts/local.py down` removes its containers and network
while preserving those volumes and configuration for the next `up`. Published
ports bind to loopback; the mail inbox captures messages locally. Use the
deployment instructions below when configuring a LAN or public server.

## Existing installations

The default data image is MongoDB 9.0.2. **An image update does not migrate an
existing database.** Normal startup requires a completed marker matching the
actual installed binary's series (8.3 or 9.0). An existing 8.3 installation must
follow the [8.3 to 9.0 procedure](../RECOVERY.md#upgrade-mongodb-83-to-90) first;
the lite-only `compose.mongo-8.3.yml` override retains the pinned 8.3.11 binary
during preparation. Older 4.4 data needs the earlier staged procedure in
[RECOVERY.md](../RECOVERY.md#upgrade-an-existing-mongodb-44-deployment).
Database and upload directories are never removed by these scripts.

The archived MinIO community service and its Compose profile have been retired.
Existing objects must be copied to a maintained external S3 service or the local
upload volume before switching the application; see the storage section below.

## Fresh single-server deployment

Run these commands from this directory after configuring secrets, `JANUS_NAT_IP`
and TLS files. Empty database directories receive the 9.0 marker automatically.
Do not use these fresh-install commands on existing 8.3 volumes.

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

Set `PUBLIC_BASE_URL` to the public HTTPS origin, including a nonstandard port if
used, on both web and homepage services. Account emails, canonical/social links,
sitemaps and room structured data use this value; the default is
`https://jumpin.chat`. Paths, credentials, queries and fragments are rejected.
For a custom hostname, set `NGINX_PUBLIC_HOSTNAME` in the nginx service environment
and provide a matching TLS certificate. This value is a hostname without a scheme
or port; `PUBLIC_BASE_URL` still includes `https://` and any nonstandard port.
The proxy also accepts `localhost` and `127.0.0.1` for local
HTTPS installations. When Stripe is absent, support pages explain availability
and gift links do not offer an unusable checkout.

The nginx service accepts `NGINX_REQUEST_RATE` to tune its shared per-client-IP
request limit; the default is `2r/s`. For several browsers sharing one public IP,
use a value such as `10r/s` to allow asset loading and media setup together.
Values must be a positive integer up to 999999 followed by `r/s` or `r/m`.

## Runtime versions and builds

| Component | Maintained release |
|---|---|
| Application and asset build | Node 24.21.0 LTS / npm 12.2.0, matching Debian Trixie build/runtime |
| Homepage | Node 24.21.0 LTS / npm 12.2.0 |
| Email | Node 24.21.0 LTS / npm 12.2.0 |
| Database | MongoDB 9.0.2 with `mongosh` and bundled Database Tools; 8.3.11 migration override |
| Cache/session bus | Redis 8.10.2 |
| Media server | Janus 1.4.2 on Ubuntu 26.04 LTS |
| Optional TURN relay | Upstream coturn 4.18 |
| Local mail inbox | Mailpit 1.31.4 |
| Reverse proxy / load balancer | nginx 1.30.5 stable / HAProxy 3.4.6 LTS |

Core deployment images are pinned by digest in Dockerfiles/Compose and recorded
in `images.lock.json`, including the local Mailpit image and intermediate MongoDB
8.3.11 image. Mailpit's Dockerfile is also included in the weekly dependency-update
configuration. Janus source is pinned
by release and SHA-256. Its build uses
Ubuntu's maintained OpenSSL, SRTP, libnice and WebSocket packages, compiling only
VideoRoom, HTTP/WebSocket transports and HTTP event handling. Package repository
updates are intentionally consumed when rebuilding. Builds are not claimed to be
byte-for-byte reproducible; schedule rebuilds and runtime smoke checks when pins
or distro packages change.

Application images explicitly install npm 12.2.0 with its own lifecycle scripts
disabled, then use committed lockfiles with `npm ci`. Each application's `.npmrc`
is copied before installation: `strict-allow-scripts=true` enforces its reviewed,
version-pinned `allowScripts` policy. Unreviewed install scripts and incompatible
peer dependencies fail the build; do not bypass either check. The web runtime copies from the matching Node
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
| `compose.mongo-8.3.yml` | Lite-only pre-migration MongoDB 8.3.11 override |
| `compose.mongo-upgrade.yml` | Lite-only explicit 8.3 → 9.0 pending-migration entrypoint |
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

For ACME HTTP validation, mount the certificate client's webroot into nginx at
`/var/www/acme`. Requests to `/.well-known/acme-challenge/` on port 80 serve files
from that webroot; other HTTP paths redirect to HTTPS. A renewal hook must copy
the renewed certificate and key to the mounted TLS files and reload the services.

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

The optional [runtime and restore rehearsal](../RECOVERY.md#synthetic-runtime-and-restore-rehearsal)
checks real MongoDB/Redis clients, session persistence, rendering, cross-process
chat and a synthetic dump/restore on fresh host processes. It is useful when the
container engine is unavailable and does not access existing deployment data.

The Janus image can report its version without network access using
`podman run --rm --network=none --entrypoint /opt/janus/bin/janus IMAGE --version`.
Also test real publication/subscription, reconnects and TURN relay media with two
browsers after deployment. Check both login/session persistence and stored data
against the new database. Local image tags do not push anything to a registry.
