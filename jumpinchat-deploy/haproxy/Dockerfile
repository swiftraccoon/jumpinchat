FROM docker.io/library/haproxy:2.8@sha256:8baa7d29a27a7aa2c24c33819ad93a40d90b36a338b9f5c5806c537c79cfb105
USER root
RUN mkdir -p /run/haproxy/
COPY haproxy.cfg.tpl /usr/local/etc/haproxy/haproxy.cfg.tpl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
