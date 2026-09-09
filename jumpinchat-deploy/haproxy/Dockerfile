FROM docker.io/library/haproxy:3.4@sha256:0e81cf4a7fac4f689289ae2afd29e1153e9e6d69ae3fb0c1f0345f998643c258
USER root
RUN mkdir -p /run/haproxy/
COPY haproxy.cfg.tpl /usr/local/etc/haproxy/haproxy.cfg.tpl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
