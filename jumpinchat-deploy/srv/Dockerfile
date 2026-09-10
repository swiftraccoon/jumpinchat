FROM docker.io/library/node:26-trixie@sha256:e961046fec20896e8904f2b4a8b4c7e5ca91826d84d8d33d83dbaa61f942069e AS builder

WORKDIR /build
COPY jumpinchat-web/package.json jumpinchat-web/package-lock.json ./
RUN npm ci
COPY jumpinchat-web/ ./
RUN npm run build && npm prune --omit=dev

ARG BUILD_REVISION=local-dev
RUN node -e "require('fs').writeFileSync('dist/version.js', 'window.BUILD_NUM=' + JSON.stringify(process.argv[1]) + ';\\n')" "$BUILD_REVISION"

# Match the build and runtime libc/Node versions for native npm dependencies.
FROM docker.io/library/node:26-trixie-slim@sha256:14bf3eac4bf209d906d3c41256597d3ab1f926b2e93a79e9bdfe1efd32454239
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
