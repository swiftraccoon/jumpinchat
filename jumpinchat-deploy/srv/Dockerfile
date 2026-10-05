FROM docker.io/library/node:24.21.0-trixie@sha256:be40f6a87b9b22215ddb20da0a2320a5c6d583fe3ee3b0024d9fa4f05b40c8fd AS builder

RUN npm install --global npm@12.2.0 --ignore-scripts

WORKDIR /build
COPY jumpinchat-web/package.json jumpinchat-web/package-lock.json jumpinchat-web/.npmrc ./
RUN npm ci
COPY jumpinchat-web/ ./
RUN npm run build && npm prune --omit=dev

ARG BUILD_REVISION=local-dev
RUN node -e "require('fs').writeFileSync('dist/version.js', 'window.BUILD_NUM=' + JSON.stringify(process.argv[1]) + ';\\n')" "$BUILD_REVISION"

# Match the build and runtime libc/Node versions for native npm dependencies.
FROM docker.io/library/node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe
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
