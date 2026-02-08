# JumpInChat

A self-hosted video chat platform with text chat rooms, WebRTC video/audio broadcasting, and a public-facing homepage. Originally built as a multi-repo project, now consolidated into a single monorepo.

## Architecture

The application runs as 12 containers orchestrated via Docker Compose (or Podman Compose):

```
┌─────────────────────────────────────────────────────────┐
│  nginx (reverse proxy)                                  │
│  :8080 (HTTP) / :8443 (HTTPS)                           │
│                                                         │
│  ┌──────────────┐   ┌────────────────────────────────┐  │
│  │  home/home2   │   │  haproxy (load balancer)       │  │
│  │  (homepage)   │   │  ┌─────────┐  ┌─────────┐     │  │
│  │  :3000        │   │  │  web    │  │  web2   │     │  │
│  └──────────────┘   │  │  :80    │  │  :80    │     │  │
│                      │  └─────────┘  └─────────┘     │  │
│                      └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐
│ mongodb  │ │ mongodb  │ │  redis   │ │  janus   │ │  email  │
│ (primary)│ │ (slave)  │ │          │ │  janus2  │ │  :3001  │
│ :27017   │ │          │ │  :6379   │ │ (WebRTC) │ │         │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────┘
     └── replica set rs0 ──┘
```

| Container | Role |
|---|---|
| **nginx** | Reverse proxy, TLS termination, routes `/` to homepage, everything else to haproxy |
| **haproxy** | Load balances between web and web2 (sticky sessions via cookie) |
| **web / web2** | Node.js app — chat rooms, Socket.io, Janus signaling, REST API |
| **home / home2** | Keystone.js homepage — landing pages, blog, static content |
| **mongodb + mongodbslave** | MongoDB 4.4 replica set (`rs0`) for data persistence |
| **redis** | Session store and cache |
| **janus / janus2** | Janus WebRTC Gateway — video/audio media servers |
| **email** | Email service (AWS SES) |

## Repository Structure

```
jic/
├── jumpinchat-deploy/     # Docker/compose configs, Dockerfiles, proxy configs
│   ├── docker-compose.yml # Main compose file (run from here)
│   ├── example.env        # Environment variable template
│   ├── nginx/             # Nginx reverse proxy config
│   ├── haproxy/           # HAProxy load balancer config
│   ├── janus/             # Janus WebRTC gateway build
│   ├── srv/               # Dockerfile for web containers
│   ├── home/              # Dockerfile for homepage containers
│   └── initMongoRepl.sh   # MongoDB replica set init script
├── jumpinchat-web/        # Main Node.js application (chat rooms, API, Socket.io)
├── jumpinchat-homepage/   # Keystone.js homepage/landing site
├── jumpinchat-email/      # Email microservice (AWS SES)
├── jumpinchat-turn/       # TURN server config (for NAT traversal)
└── README.md
```

## Prerequisites

- **Podman** (rootless) and **podman-compose** (`pip install podman-compose`), or Docker with Docker Compose
- TLS certificates (`fullchain.pem`, `privkey.pem`) in `jumpinchat-deploy/`
- SELinux note: volume mounts use `:Z` labels for rootless Podman compatibility

## Getting Started

### 1. Configure Environment

```bash
cd jumpinchat-deploy
cp example.env .env
```

Edit `.env` and set your secrets:

| Variable | Description |
|---|---|
| `JWT_SECRET` | Secret for signing JWTs |
| `COOKIE_SECRET` | Secret for signing cookies |
| `SHARED_SECRET` | Shared secret between web and email services |
| `JANUS_TOKEN_SECRET` | HMAC secret for Janus token auth |
| `YT_API_KEY` | YouTube API key (for video embeds) |
| `AWS_SES_ACCESS_KEY` / `AWS_SES_SECRET` | AWS SES credentials (email) |
| `AWS_S3_UPLOADS_ACCESS_KEY` / `AWS_S3_UPLOADS_SECRET` | AWS S3 credentials (file uploads) |
| `GCM_API_KEY` | Google Cloud Messaging key (push notifications) |
| `STRIPE_SK` / `STRIPE_WH_KEY` / `STRIPE_KEY_PUBLIC` | Stripe payment keys |

### 2. Prepare MongoDB Data Directories

For rootless Podman, MongoDB needs UID-mapped directories:

```bash
mkdir -p jumpinchat-deploy/data/db jumpinchat-deploy/data/db2
podman unshare chown 999:999 jumpinchat-deploy/data/db jumpinchat-deploy/data/db2
```

### 3. Build and Start

```bash
cd jumpinchat-deploy
podman-compose build
podman-compose up -d
```

### 4. Initialize MongoDB Replica Set

On first launch only:

```bash
podman-compose exec mongodb mongo --eval "rs.initiate()"
podman-compose exec mongodb mongo --eval "rs.add('mongodbslave:27017')"
```

### 5. Verify

The application should be accessible at:

- **Homepage**: `https://localhost:8443`
- **Chat rooms**: `https://localhost:8443/<room-name>`

Check container status:

```bash
podman-compose ps
```

## Operational Notes

- **DNS caching**: After `podman-compose down` + `up`, nginx and haproxy cache DNS from startup. If web containers get new IPs, restart nginx/haproxy or run `podman-compose exec nginx nginx -s reload`.
- **Build order**: Build web and home images first (`podman-compose build web home`), since web2/home2 reuse the same images.
- **MongoDB persistence**: Data survives container restarts. Home containers may crash if they start before the primary election completes — just restart them.
- **Privileged ports**: Rootless Podman can't bind to ports below 1024, so nginx is mapped to 8080/8443 instead of 80/443.

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: React (webpack/gulp build)
- **Homepage**: Keystone.js (Express-based CMS)
- **Database**: MongoDB 4.4 (replica set)
- **Cache/Sessions**: Redis
- **WebRTC**: Janus Gateway v1.0.0
- **Load Balancer**: HAProxy 1.9
- **Reverse Proxy**: Nginx
- **Email**: AWS SES via dedicated microservice
- **Containerization**: Docker Compose / Podman Compose