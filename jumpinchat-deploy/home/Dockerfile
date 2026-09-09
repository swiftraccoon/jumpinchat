FROM docker.io/library/node:24-trixie@sha256:f7d34e58713740f9eef9092c0bd6ff10369d132f7238399a4b270f16d47fa608 AS builder

WORKDIR /var/www/jic-homepage

# Copy package files first for layer caching
COPY jumpinchat-homepage/package.json jumpinchat-homepage/package-lock.json ./
# Install ALL deps (devDeps needed for esbuild + sass build)
RUN npm ci

# Copy source
COPY jumpinchat-homepage/ ./

# Build frontend assets using build.js
RUN node build.js
RUN npm prune --omit=dev

FROM docker.io/library/node:24-trixie-slim@sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0

ENV NODE_ENV="production"
ENV PORT=3000

WORKDIR /var/www/jic-homepage
COPY --from=builder /var/www/jic-homepage ./

CMD ["node", "app.js"]
