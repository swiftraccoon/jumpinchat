FROM docker.io/library/node:22-bullseye AS builder

WORKDIR /var/www/jic-homepage

# Copy package files first for layer caching
COPY jumpinchat-homepage/package.json ./
# Install ALL deps (devDeps needed for esbuild + sass build)
RUN npm install --legacy-peer-deps

# Copy source
COPY jumpinchat-homepage/ ./

# Build frontend assets using build.js
RUN node build.js

FROM docker.io/library/node:22-bullseye-slim

ENV NODE_ENV="production"
ENV PORT=3000

WORKDIR /var/www/jic-homepage
COPY --from=builder /var/www/jic-homepage ./

CMD ["node", "app.js"]
