FROM node:22-bullseye AS builder

ENV SERVER_PATH /var/www
ENV NODE_ENV "production"
ENV PORT 3000

RUN apt-get update > /dev/null && \
    apt-get install -y --no-install-recommends \
        build-essential \
        python3

WORKDIR /var/www/jic-homepage

# Copy local jumpinchat-homepage source
COPY jumpinchat-homepage/package.json jumpinchat-homepage/yarn.lock ./
# Install production deps
RUN npm install --legacy-peer-deps

# Copy the rest of the source
COPY jumpinchat-homepage/ ./

# Build JS bundles with esbuild and copy assets
RUN npm install --no-save esbuild && \
    mkdir -p public/styles public/js public/images && \
    echo '{}' > public/rev-manifest.json && \
    cp -r src/images/* public/images/ && \
    cp src/styles/site.css public/styles/site.css && \
    ./node_modules/.bin/esbuild src/js/app.js --bundle --outfile=public/js/bundle.js \
      --format=iife --target=es2015 --platform=browser && \
    ./node_modules/.bin/esbuild src/js/app.js --bundle --outfile=public/js/bundle.mjs \
      --format=esm --target=es2017 --platform=browser

FROM node:22-bullseye-slim
ENV NODE_ENV "production"
COPY --from=builder /var/www /var/www
COPY jumpinchat-deploy/home/entry.sh /tmp/scripts/entry.sh
RUN chmod +x /tmp/scripts/entry.sh
ENTRYPOINT ["/tmp/scripts/entry.sh"]
