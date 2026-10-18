FROM docker.io/library/haproxy:3.4.7@sha256:6479d4cead30c4cc996cbe3dd50022c5404db22d2e001d1aa8fa366f4ea171e3
USER root
RUN mkdir -p /run/haproxy/
COPY haproxy.cfg.tpl /usr/local/etc/haproxy/haproxy.cfg.tpl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
