# JumpInChat

Self-hosted video chat rooms. WebRTC video/audio, text chat, room moderation.

Runs as 12 containers via Podman Compose (or Docker Compose).

## Requirements

- **Podman** (rootless) + **podman-compose** (`pip install podman-compose`), or Docker + Docker Compose
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
cp example.env .env
```

Edit `.env` and change the secrets. The defaults work for local testing, but
**change them for anything internet-facing**.

| Variable | What it does |
|---|---|
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

Edit `docker-compose.yml` and set `NAT_1_1_IP` to your machine's LAN IP
(or public IP on a VPS). This tells the WebRTC server what IP to advertise
for media connections. It appears twice (for `janus` and `janus2`):

```yaml
- NAT_1_1_IP=192.168.1.100
```

### 5. Prepare MongoDB directories

Rootless Podman needs UID-mapped dirs for MongoDB:

```bash
mkdir -p data/db data/db2
podman unshare chown 999:999 data/db data/db2
```

If using Docker (root), skip this step.

### 6. Build and start

```bash
podman-compose build
podman-compose up -d
```

First build takes a while (Janus compiles from source). Subsequent builds
use cache and are much faster.

### 7. Initialize MongoDB replica set

First launch only:

```bash
podman-compose exec mongodb mongo --eval "rs.initiate()"
podman-compose exec mongodb mongo --eval "rs.add('mongodbslave:27017')"
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
| **mongodb + mongodbslave** | MongoDB 4.4 replica set |
| **redis** | Session store and cache |
| **janus / janus2** | Janus WebRTC Gateway (video/audio media) |
| **email** | SMTP email service |

## Common Operations

Rebuild after code changes:

```bash
podman-compose build
podman-compose down && podman-compose up -d
```

View logs:

```bash
podman-compose logs -f web        # app server
podman-compose logs -f janus      # WebRTC media server
podman-compose logs -f nginx      # reverse proxy
```

Run tests:

```bash
cd ../jumpinchat-web && NODE_ENV=test npm test     # server tests (379 specs)
cd ../jumpinchat-homepage && NODE_ENV=test npm test # homepage tests
```

## Troubleshooting

**502 Bad Gateway after restart**: Wait 15-20 seconds. Nginx reloads
automatically after startup to pick up fresh container IPs.

**Camera shows gray square / DTLS alert**: Check that `NAT_1_1_IP` in
`docker-compose.yml` matches the IP your browser uses to reach the server.
The browser sends WebRTC media directly to this IP on UDP ports 20000-20200.

**MongoDB home containers crash on startup**: They sometimes start before
the replica set primary is elected. Just restart them:
`podman-compose restart home home2`.

**Can't bind to port 8080/8443**: Something else is using those ports, or
on a VPS you may need to adjust firewall rules. Rootless Podman can't bind
to ports below 1024.

**Email not sending**: Set the `SMTP_*` variables in `.env`. Any SMTP
provider works (Mailgun, SendGrid, Gmail app password, self-hosted).

## File Uploads

User-uploaded files (avatars, room images, emoji) are stored on the local
filesystem in a `uploads` Docker volume, served by nginx at `/uploads/`.
No cloud storage needed.

## TURN Server

For WebRTC to work across NATs (e.g., users behind carrier-grade NAT or
restrictive firewalls), you need a TURN server. Set `TURN_URIS` in
`docker-compose.yml` to your TURN server hostname. The app generates
HMAC-SHA1 credentials using `JANUS_TOKEN_SECRET`.

For local/LAN testing, TURN is not needed.
