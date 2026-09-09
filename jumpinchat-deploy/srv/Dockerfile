FROM docker.io/library/node:22-bullseye@sha256:959fa6e5c12f4b08f58808f953c7a6a05f1f72629b57ef3a648b8809362fdad9 AS builder

ENV SERVER_PATH /var/www

WORKDIR /build

# Install the committed dependency tree before copying frequently changed source.
COPY jumpinchat-web/package.json jumpinchat-web/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY jumpinchat-web/ ./

# Build with gulp (use local binary, not npx)
RUN ./node_modules/.bin/gulp build
RUN npm prune --omit=dev --legacy-peer-deps

# Supply a revision from CI or the build wrapper, since .git is excluded.
ARG BUILD_REVISION=local-dev
RUN node -e "require('fs').writeFileSync('dist/version.js', 'window.BUILD_NUM=' + JSON.stringify(process.argv[1]) + ';\n')" "$BUILD_REVISION"

# Production image
FROM docker.io/library/nginx:stable@sha256:d5792f71a9496b833bc08ea834a758c46e2b6a6306c10f4be926f38a656cdc1c

ENV SERVER_PATH /var/www
ENV NODE_ENV "production"
ENV PORT 8080
ENV REDIS_URI "redis://redis:6379"
ENV MONGODB_URI "mongodb://mongodb/tc"
ENV JANUS_HTTP_URI_INTERNAL "http://janus:8088/janus"
ENV JANUS_WS_URI_INTERNAL "ws://janus:8188"
ENV JANUS_BITRATE 128000
ENV JANUS_ROOM_SIZE 12
ENV TURN_URIS "turn.jumpin.chat"

RUN apt-get update > /dev/null && \
    apt-get install -yqq --no-install-recommends \
        curl \
        sudo

# Install Node.js 22 in the nginx image for the server runtime
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs

# Copy built assets and server code
RUN mkdir -p /var/www/jic-web
COPY --from=builder /build/dist /var/www/jic-web/dist
COPY --from=builder /build/srv /var/www/jic-web/srv
COPY --from=builder /build/node_modules /var/www/jic-web/node_modules
COPY --from=builder /build/package.json /var/www/jic-web/package.json

RUN rm -f /etc/nginx/conf.d/default.conf
COPY jumpinchat-deploy/srv/conf/site.conf /etc/nginx/conf.d/

COPY jumpinchat-deploy/srv/entry.sh /tmp/scripts/entry.sh
RUN chmod +x /tmp/scripts/entry.sh

ENTRYPOINT ["/tmp/scripts/entry.sh"]
