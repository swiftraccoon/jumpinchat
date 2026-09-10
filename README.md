# JumpInChat

Self-hosted video chat rooms. WebRTC video/audio, text chat, room moderation.

Runs as 12 containers via Podman Compose (or Docker Compose), with an optional
separate coturn service.

## Requirements

- **Podman** (rootless) + **podman-compose** (`pip install podman-compose`), or Docker + Docker Compose
- Node 24 LTS for local development and the configuration scripts (`nvm use` in each app)
- A machine with a LAN IP (or a VPS with a public IP)
- Ports: 8080 (HTTP), 8443 (HTTPS), 20000-20200/udp (WebRTC media)

## Quick Start

Everything runs from the `jumpinchat-deploy/` directory.

```bash
cd jumpinchat-deploy
```

### 1. Generate TLS certificates

For local/dev use, create self-signed certs:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout privkey.pem -out fullchain.pem \
  -subj "/CN=local.jumpin.chat"

# Copy to nginx build context
cp fullchain.pem privkey.pem nginx/

# Generate DH params (only needed once, takes a minute)
openssl dhparam -out nginx/dhparam.pem 2048
```

For production, use Let's Encrypt or your own CA-signed certs instead.

### 2. Set up DNS

Add a hosts entry pointing to your machine's LAN IP (not 127.0.0.1):

```bash
# Find your LAN IP
ip -4 addr show | grep 'inet ' | grep -v '127.0.0.1'

# Add to /etc/hosts (replace with your actual IP)
echo "192.168.1.100 local.jumpin.chat" | sudo tee -a /etc/hosts
```

For a VPS, point a real domain at it instead.

### 3. Configure environment

```bash
node ../scripts/init-env.mjs
```

The command creates `.env` with unique secrets and restricted file permissions;
it refuses to overwrite an existing file. Production-mode containers reject
placeholder secrets even for local use. Edit `.env` to configure your deployment.

| Variable | What it does |
|---|---|
| `PUBLIC_BASE_URL` | Public HTTPS origin for account emails and page links; defaults to `https://jumpin.chat` |
| `JWT_SECRET` | Signs auth tokens |
| `COOKIE_SECRET` | Signs session cookies |
| `SHARED_SECRET` | Auth between web and email services |
| `JANUS_TOKEN_SECRET` | Auth for WebRTC media servers |
| `FILE_TOKEN_SECRET` | Signs private file access URLs |

Optional (features won't work without them, but the app still runs):

| Variable | What it does |
|---|---|
| `SMTP_HOST/PORT/USER/PASS/FROM` | Email (registration verification, password reset) |
| `STRIPE_SK/WH_KEY/KEY_PUBLIC` | Payments |
| `YT_API_KEY` | YouTube video embedding in rooms |
| `GCM_API_KEY` | Browser push notifications |

### 4. Configure WebRTC NAT

Set `JANUS_NAT_IP` in `.env` to your machine's LAN IP (or public IP on a VPS).
Both Janus instances advertise this address for media connections:

```dotenv
JANUS_NAT_IP=192.168.1.100
TURN_URIS=
```

TURN can be empty for LAN-only use. For clients behind restrictive NATs, configure
your own TURN server hostnames as a comma-separated list.

### 5. Prepare MongoDB directories

These instructions initialize a fresh MongoDB 8.3 deployment. For existing 4.4
data, follow the staged migration in [RECOVERY.md](RECOVERY.md) first. The startup
guard refuses to open existing data without a completed migration marker.

Rootless Podman needs UID-mapped dirs for MongoDB:

```bash
mkdir -p data/db data/db2
podman unshare chown 999:999 data/db data/db2
```

If using Docker (root), skip this step.

### 6. Build and start

```bash
node ../scripts/preflight.mjs
podman-compose -f docker-compose.yml build
podman-compose -f docker-compose.yml up -d
```

For multi-server deployments, see `jumpinchat-deploy/README.md`.

First build takes a while (Janus compiles from source). Subsequent builds
use cache and are much faster.

### 7. Initialize MongoDB replica set

First launch only:

```bash
../scripts/init-mongo.sh -f docker-compose.yml
```

### 8. Open it

Go to `https://local.jumpin.chat:8443`. Your browser will warn about the
self-signed cert -- accept the exception.

Create a room by visiting `https://local.jumpin.chat:8443/yourroom`.

## Containers

| Container | What it does |
|---|---|
| **nginx** | Reverse proxy, TLS termination |
| **haproxy** | Load balances between web and web2 |
| **web / web2** | Node.js app (chat rooms, Socket.io, API) |
| **home / home2** | Express 5 homepage (registration, login, settings, room directory) |
| **mongodb + mongodbslave** | MongoDB 8.3 replica set |
| **redis** | Session store and cache |
| **janus / janus2** | Janus WebRTC Gateway (video/audio media) |
| **email** | SMTP email service |

## Common Operations

Rebuild after code changes:

```bash
podman-compose -f docker-compose.yml build
podman-compose -f docker-compose.yml down && podman-compose -f docker-compose.yml up -d
```

View logs:

```bash
podman-compose -f docker-compose.yml logs -f web        # app server
podman-compose -f docker-compose.yml logs -f janus      # WebRTC media server
podman-compose -f docker-compose.yml logs -f nginx      # reverse proxy
```

Run tests:

```bash
cd ..
./scripts/test.sh  # API, React, media callbacks, homepage, and email
./scripts/lint.sh
```

## Troubleshooting

**502 Bad Gateway after restart**: Wait 15-20 seconds. Nginx reloads
automatically after startup to pick up fresh container IPs.

**Camera shows gray square / DTLS alert**: Check that `JANUS_NAT_IP` in
`.env` matches the IP your browser uses to reach the server.
The browser sends WebRTC media directly to this IP on UDP ports 20000-20200.

**Application remains unready**: Initialize the replica set on first launch,
then inspect MongoDB and Redis logs. Applications wait up to 60 seconds for
MongoDB and the web server also waits for Redis. Failed startup exits for the
container restart policy to retry. `/health/ready` checks dependencies;
`/health/live` only checks the running HTTP process.

**Can't bind to port 8080/8443**: Something else is using those ports, or
on a VPS you may need to adjust firewall rules. Rootless Podman can't bind
to ports below 1024.

**Email not sending**: Set the `SMTP_*` variables in `.env`. Any SMTP
provider works (Mailgun, SendGrid, Gmail app password, self-hosted).

## File Uploads

User-uploaded files (avatars, room images, emoji) are stored on the local
filesystem in an `uploads` Docker volume, served by nginx at `/uploads/`.

For external S3-compatible storage, set `STORAGE_BACKEND=s3`, the S3 credentials,
bucket and region, and `S3_PUBLIC_BASE_URL` to an HTTPS URL ending in `/public/`.
`S3_ENDPOINT` is optional for AWS. The application keeps public `/uploads/` URLs;
signed private downloads stream through the API with server credentials. The
archived MinIO service has been retired. See
[jumpinchat-deploy/README.md](jumpinchat-deploy/README.md) for configuration and
copy/verification steps that preserve both public and private objects.

## TURN Server

For WebRTC to work across NATs (e.g., users behind carrier-grade NAT or
restrictive firewalls), you need a TURN server. Set `TURN_URIS` in
`.env` to comma-separated TURN hostnames or explicit `turn:`/`turns:` URIs.
Hostnames expand to UDP and TCP on port 3478; specify
`turns:relay.example.com:5349?transport=tcp` for a TLS listener. The app generates
HMAC-SHA1 credentials using `TURN_SHARED_SECRET`, which must match coturn.
See [jumpinchat-turn/README.md](jumpinchat-turn/README.md) for the upstream image,
TLS and relay port configuration.

For local/LAN testing, TURN is not needed.

## Development and recovery

See [TESTING.md](TESTING.md) for the test commands and remaining coverage gaps,
and [RECOVERY.md](RECOVERY.md) for maintenance-window backups and an isolated
restore procedure. A passing unit suite does not replace a two-browser media
check or a restore exercise.

The split Compose service files are canonical. After editing them, run
`python3 scripts/generate-compose.py` to refresh `docker-compose.yml`; CI checks
for drift. The lite profile remains a separate topology. npm package locks are
authoritative for installation; image builds use `npm ci` and prune build tools.

Redis is pinned by digest. Set `REDIS_IMAGE` to your deployment's existing image
when preserving its current version; validate a version change before rollout.


## Dependency maintenance

Node 24 LTS is the deployment target; Node 26 is also accepted for development.
The Node 24 build and runtime images use matching Debian releases for native npm
modules. Janus uses supported Ubuntu 26.04 libraries for OpenSSL, ICE, SRTP and
WebSockets, with its source archive and container bases pinned by checksum.

The React 19 client uses Zustand subscriptions, Floating UI, native scroll/range
controls and Emoji Mart 5. Homepage image cropping uses Cropper 2; date-fns replaces
Moment. Pino emits structured JSON logs (`LOG_LEVEL` controls verbosity).
The Node build script writes hashed bundles, styles, source maps, local fonts,
media and the service worker; authenticated pages and APIs stay on the network.

FingerprintJS 5 sends its algorithm version with the identifier. Existing web
sessions and authenticated accounts keep up to five trusted versioned identifiers.
A returning guest without a surviving session or account cannot be linked to the
old algorithm. Fingerprints remain advisory metadata: existing IP/account/session
ban matching is unchanged. Client-supplied historical aliases are not accepted.

Weekly Dependabot configuration groups related npm updates and tracks container
bases and GitHub Actions. It creates reviewable updates after reaching the default
branch; this checkout does not enable automatic merging. Review major API changes,
refresh `jumpinchat-deploy/images.lock.json` with image changes, and regenerate
Compose from its canonical files. Janus source-version/checksum updates and distro
library changes require native rebuild and media checks. Run all tests, builds,
`npm ls --all` and `npm audit` in each app before accepting updates. Historical
cleanup warnings remain visible in a full ESLint run; correctness errors block CI.
