FROM docker.io/library/node:22-bullseye@sha256:959fa6e5c12f4b08f58808f953c7a6a05f1f72629b57ef3a648b8809362fdad9 AS builder

WORKDIR /var/www/jic-homepage

# Copy package files first for layer caching
COPY jumpinchat-homepage/package.json jumpinchat-homepage/package-lock.json ./
# Install ALL deps (devDeps needed for esbuild + sass build)
RUN npm ci --legacy-peer-deps

# Copy source
COPY jumpinchat-homepage/ ./

# Build frontend assets using build.js
RUN node build.js
RUN npm prune --omit=dev --legacy-peer-deps

FROM docker.io/library/node:22-bullseye-slim@sha256:5736e7ef1f3f2109be7ef8aea0cbdf931804aee9a18c6760507b8ded078b25a9

ENV NODE_ENV="production"
ENV PORT=3000

WORKDIR /var/www/jic-homepage
COPY --from=builder /var/www/jic-homepage ./

CMD ["node", "app.js"]
