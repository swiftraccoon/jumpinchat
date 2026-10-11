FROM docker.io/library/haproxy:3.4.6@sha256:e273915691a8eab3f105bf3e39fd4c29a4ecf334e33421903b5589d25e14db26
USER root
RUN mkdir -p /run/haproxy/
COPY haproxy.cfg.tpl /usr/local/etc/haproxy/haproxy.cfg.tpl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
