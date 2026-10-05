FROM docker.io/library/haproxy:3.4.6@sha256:7f085b2dd4f3b2507af4c7633fa5ab621eaad36995cc0f7f7c6111bb8a2e8742
USER root
RUN mkdir -p /run/haproxy/
COPY haproxy.cfg.tpl /usr/local/etc/haproxy/haproxy.cfg.tpl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
