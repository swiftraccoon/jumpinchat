FROM docker.io/library/node:26.10.0-trixie@sha256:a723b54c35a76e947095a20a67d39585bb09c862e6b1adeb8a9f518f95e34fb0 AS builder

RUN npm install --global npm@12.2.0 --ignore-scripts

WORKDIR /var/www/jic-homepage

# Copy package files first for layer caching
COPY jumpinchat-homepage/package.json jumpinchat-homepage/package-lock.json jumpinchat-homepage/.npmrc ./
# Install ALL deps (devDeps needed for esbuild + sass build)
RUN npm ci

# Copy source
COPY jumpinchat-homepage/ ./

# Build frontend assets using build.js
RUN node build.js
RUN npm prune --omit=dev

FROM docker.io/library/node:26.10.0-trixie-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1

RUN npm install --global npm@12.2.0 --ignore-scripts

ENV NODE_ENV="production"
ENV PORT=3000

WORKDIR /var/www/jic-homepage
COPY --from=builder /var/www/jic-homepage ./

CMD ["node", "app.js"]
