# JumpInChat Deployment

Container configs and compose files for running JumpInChat.

See the [root README](../README.md) for setup instructions.

## Quick Start (Single Server)

```bash
cp example.env .env
# Edit .env with your secrets
podman-compose -f compose.yml build
podman-compose -f compose.yml up -d
```

Or use the legacy all-in-one file: `podman-compose -f docker-compose.yml up -d`

## Services

| Directory | Builds |
|---|---|
| `srv/` | web / web2 (Node.js app + nginx) |
| `home/` | home / home2 (Express 5 homepage) |
| `janus/` | janus / janus2 (WebRTC media server) |
| `nginx/` | nginx (reverse proxy) |
| `haproxy/` | haproxy (load balancer) |

MongoDB, Redis, MinIO, and email use upstream images and don't have build directories.

## Compose Files

| File | Services | Use Case |
|------|----------|----------|
| `compose.yml` | All except MinIO (includes app, media, data, email) | Single-server deployment |
| `compose.app.yml` | web, web2, home, home2, haproxy, nginx | App tier |
| `compose.media.yml` | janus, janus2 | Media tier |
| `compose.data.yml` | mongodb, mongodbslave, redis | Data tier |
| `compose.storage.yml` | minio | Object storage tier |
| `compose.email.yml` | email | Email tier |
| `docker-compose.yml` | All (monolithic) | Legacy single-server |

## Multi-Server Deployment

Split services across servers for resource isolation. Each compose file runs independently.

### Two-Server Example (App + Media)

**Server A** (app + data + email):
```bash
podman-compose -f compose.app.yml -f compose.data.yml -f compose.email.yml up -d
```

**Server B** (media):
```bash
# Set JANUS_NAT_IP to Server B's public IP in .env
podman-compose -f compose.media.yml up -d
```

On Server A, set in `.env`:
```env
JANUS_WS_HOST=server-b-ip
JANUS2_WS_HOST=server-b-ip
JANUS_HTTP_HOST=server-b-ip
```

### Three-Server Example

```
Server A: compose.app.yml + compose.email.yml
Server B: compose.data.yml
Server C: compose.media.yml
```

On Server A, set `MONGODB_URI`, `REDIS_URI` to Server B, and `JANUS_*_HOST` to Server C.

### Environment Templates

Per-group env templates are in `env/`:
- `.env.all.example` -- Single-server (all variables)
- `.env.app.example` -- App server
- `.env.data.example` -- Data server
- `.env.media.example` -- Media server
- `.env.storage.example` -- Storage server (MinIO)

### MinIO Setup (S3 Storage Backend)

To use MinIO instead of local filesystem for uploads:

1. Set MinIO credentials in `.env` (required -- compose.storage.yml will refuse to start without them):
   ```env
   MINIO_ACCESS_KEY=your-minio-access-key
   MINIO_SECRET_KEY=your-minio-secret-key
   ```
2. Start MinIO: `podman-compose -f compose.storage.yml up -d` (or add `-f compose.storage.yml` to your main compose command)
3. Set in `.env`:
   ```env
   STORAGE_BACKEND=s3
   S3_ENDPOINT=http://minio:9000   # or http://storage-server:9000
   S3_ACCESS_KEY=your-minio-access-key
   S3_SECRET_KEY=your-minio-secret-key
   S3_BUCKET=uploads
   ```
4. Migrate existing uploads: `./scripts/migrate-uploads-to-minio.sh`

## Key Files

- `compose.yml` -- all-in-one (includes group files)
- `docker-compose.yml` -- legacy monolithic compose
- `example.env` -- environment variable template (copy to `.env`)
- `env/` -- per-group env templates for multi-server
- `fullchain.pem` / `privkey.pem` -- TLS certs (mounted into Janus containers)
- `nginx/fullchain.pem` / `nginx/privkey.pem` / `nginx/dhparam.pem` -- TLS certs (copied into nginx image at build time)
- `data/db` / `data/db2` -- MongoDB data directories (persisted across restarts)

## Image Registry

The compose files use local image tags (e.g., `jumpinchat/web`). These
don't need an actual registry -- Podman/Docker builds and tags them
locally. Change the image names if you want to push to your own registry.
