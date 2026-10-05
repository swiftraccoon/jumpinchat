FROM docker.io/library/nginx:1.31.0@sha256:800e7c98538c6bf725f5177e841aa720ae0ed1c378bbea368b6330bfe18a36b3

RUN apt-get update > /dev/null && \
    apt-get install -y -qq \
      curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set up SSL
RUN mkdir -p /etc/nginx/ssl
RUN mkdir -p /var/www/site
RUN mkdir -p /var/log/nginx && \
      touch /var/log/nginx/access.log && \
      touch /var/log/nginx/error.log

# TLS certs are mounted at runtime into /etc/nginx/ssl (see compose files),
# so renewal is a file swap + `nginx -s reload` instead of an image rebuild.

COPY ./site /var/www/site/

RUN rm -f /etc/nginx/conf.d/default.conf

COPY conf/site.conf.sh /tmp/scripts/
RUN chmod +x /tmp/scripts/site.conf.sh
COPY conf/nginx.conf /etc/nginx/
COPY conf/ssl.conf /etc/nginx/
COPY conf/root-ssl.conf /etc/nginx/
COPY conf/log-ssl.conf /etc/nginx/
COPY conf/root-certs.conf /etc/nginx/
COPY conf/log-certs.conf /etc/nginx/

# Config is generated at container start (not build time)
# so DNS resolves to current container IPs
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
