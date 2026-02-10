FROM node:18-bullseye AS builder

ENV SERVER_PATH /var/www

WORKDIR /build

# Copy local jumpinchat-web source
COPY jumpinchat-web/ ./

# Install ALL dependencies (including devDependencies needed for build)
RUN npm install --legacy-peer-deps

# Build with gulp (use local binary, not npx)
# Node 18 uses OpenSSL 3.0 which drops MD4; webpack 4 needs legacy provider
ENV NODE_OPTIONS="--openssl-legacy-provider"
RUN ./node_modules/.bin/gulp --gulpfile gulpfile.cjs build

# Generate version.js (normally done by publish-artifact.sh)
RUN echo "window.BUILD_NUM='$(git rev-parse HEAD 2>/dev/null || echo local-dev)';" > dist/version.js

# Production image
FROM nginx:stable

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

# Install Node.js 18 in the nginx image for the server runtime
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
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
