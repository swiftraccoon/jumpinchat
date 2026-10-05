FROM docker.io/library/ubuntu:26.04@sha256:f144425ff09be612d6d9ad965196e9cdc23dae1f42110a8a11a3e9a8198759f7 AS builder

ARG JANUS_VERSION=1.4.2
ARG JANUS_SHA256=2b7e5ea81e27760c396bcd911277cb59bffb5d981915e383283e6080e411b47b

# Use maintained distribution OpenSSL, ICE, SRTP and WebSocket libraries.
# Build only the VideoRoom plugin, HTTP/WebSocket transports and HTTP events.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl build-essential autoconf automake libtool pkg-config \
      gengetopt libjansson-dev libnice-dev libglib2.0-dev libssl-dev \
      libsrtp2-dev libmicrohttpd-dev libwebsockets-dev libcurl4-openssl-dev \
      libconfig-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN curl -fsSL "https://codeload.github.com/meetecho/janus-gateway/tar.gz/refs/tags/v${JANUS_VERSION}" -o janus.tar.gz && \
    echo "${JANUS_SHA256}  janus.tar.gz" | sha256sum -c - && \
    tar -xzf janus.tar.gz --strip-components=1 && \
    sh autogen.sh && \
    ./configure --prefix=/opt/janus \
      --disable-docs --disable-data-channels --disable-all-loggers \
      --disable-all-plugins --enable-plugin-videoroom \
      --disable-all-transports --enable-rest --enable-websockets \
      --disable-all-handlers --enable-sample-event-handler && \
    make -j2 && make install && make configs

FROM docker.io/library/ubuntu:26.04@sha256:f144425ff09be612d6d9ad965196e9cdc23dae1f42110a8a11a3e9a8198759f7
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl libjansson4 libnice10 libglib2.0-0t64 libssl3t64 \
      libsrtp2-1 libmicrohttpd12t64 libwebsockets19t64 libcurl4t64 libconfig11 && \
    rm -rf /var/lib/apt/lists/*
COPY --from=builder /opt/janus /opt/janus
COPY --chmod=755 start.sh bootstrap.sh /tmp/scripts/
RUN mkdir -p /opt/janus/certs
ENTRYPOINT ["/tmp/scripts/start.sh"]
