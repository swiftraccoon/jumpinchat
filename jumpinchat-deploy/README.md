# JumpInChat Deployment

Container configs and compose file for running JumpInChat.

See the [root README](../README.md) for setup instructions.

## Services

| Directory | Builds |
|---|---|
| `srv/` | web / web2 (Node.js app + nginx) |
| `home/` | home / home2 (Express 5 homepage) |
| `janus/` | janus / janus2 (WebRTC media server) |
| `nginx/` | nginx (reverse proxy) |
| `haproxy/` | haproxy (load balancer) |

MongoDB, Redis, and email use upstream images and don't have build directories.

## Key Files

- `docker-compose.yml` -- all service definitions
- `example.env` -- environment variable template (copy to `.env`)
- `fullchain.pem` / `privkey.pem` -- TLS certs (mounted into Janus containers)
- `nginx/fullchain.pem` / `nginx/privkey.pem` / `nginx/dhparam.pem` -- TLS certs (copied into nginx image at build time)
- `data/db` / `data/db2` -- MongoDB data directories (persisted across restarts)

## Image Registry

The compose file references `echo.research.clinic/*` as image names. These
are local image tags -- they don't need an actual registry. Podman/Docker
builds and tags them locally. Change the image names if you want to push
to your own registry.
