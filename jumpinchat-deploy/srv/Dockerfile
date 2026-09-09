FROM docker.io/library/node:24-trixie@sha256:f7d34e58713740f9eef9092c0bd6ff10369d132f7238399a4b270f16d47fa608 AS builder

WORKDIR /build
COPY jumpinchat-web/package.json jumpinchat-web/package-lock.json ./
RUN npm ci
COPY jumpinchat-web/ ./
RUN npm run build && npm prune --omit=dev

ARG BUILD_REVISION=local-dev
RUN node -e "require('fs').writeFileSync('dist/version.js', 'window.BUILD_NUM=' + JSON.stringify(process.argv[1]) + ';\\n')" "$BUILD_REVISION"

# Match the build and runtime libc/Node versions for native npm dependencies.
FROM docker.io/library/node:24-trixie-slim@sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0
ENV NODE_ENV=production PORT=8080
WORKDIR /var/www/jic-web
RUN apt-get update && apt-get install -y --no-install-recommends nginx curl ca-certificates && \
    rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default

COPY --from=builder /build/dist ./dist
COPY --from=builder /build/srv ./srv
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json
COPY jumpinchat-deploy/srv/conf/site.conf /etc/nginx/conf.d/site.conf
COPY --chmod=755 jumpinchat-deploy/srv/entry.sh /tmp/scripts/entry.sh
ENTRYPOINT ["/tmp/scripts/entry.sh"]
