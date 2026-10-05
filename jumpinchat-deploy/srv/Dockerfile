FROM docker.io/library/node:26.10.0-trixie@sha256:a723b54c35a76e947095a20a67d39585bb09c862e6b1adeb8a9f518f95e34fb0 AS builder

RUN npm install --global npm@12.2.0 --ignore-scripts

WORKDIR /build
COPY jumpinchat-web/package.json jumpinchat-web/package-lock.json jumpinchat-web/.npmrc ./
RUN npm ci
COPY jumpinchat-web/ ./
RUN npm run build && npm prune --omit=dev

ARG BUILD_REVISION=local-dev
RUN node -e "require('fs').writeFileSync('dist/version.js', 'window.BUILD_NUM=' + JSON.stringify(process.argv[1]) + ';\\n')" "$BUILD_REVISION"

# Match the build and runtime libc/Node versions for native npm dependencies.
FROM docker.io/library/node:26.10.0-trixie-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1
RUN npm install --global npm@12.2.0 --ignore-scripts
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
