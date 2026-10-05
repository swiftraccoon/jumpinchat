FROM docker.io/library/node:24.21.0-trixie@sha256:be40f6a87b9b22215ddb20da0a2320a5c6d583fe3ee3b0024d9fa4f05b40c8fd AS builder

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

FROM docker.io/library/node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe

RUN npm install --global npm@12.2.0 --ignore-scripts

ENV NODE_ENV="production"
ENV PORT=3000

WORKDIR /var/www/jic-homepage
COPY --from=builder /var/www/jic-homepage ./

CMD ["node", "app.js"]
