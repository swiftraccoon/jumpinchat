FROM docker.io/library/node:26-trixie@sha256:e961046fec20896e8904f2b4a8b4c7e5ca91826d84d8d33d83dbaa61f942069e AS builder

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

FROM docker.io/library/node:26-trixie-slim@sha256:14bf3eac4bf209d906d3c41256597d3ab1f926b2e93a79e9bdfe1efd32454239

ENV NODE_ENV="production"
ENV PORT=3000

WORKDIR /var/www/jic-homepage
COPY --from=builder /var/www/jic-homepage ./

CMD ["node", "app.js"]
