FROM docker.io/coturn/coturn:4.18.0-r0@sha256:bbefd3e1fdfdc0d58770fe01b581fd8b00d9f3a5580d00acb77cf719a6bc78e3
COPY --chmod=755 turnserver.sh /usr/local/bin/jic-turnserver.sh
ENTRYPOINT ["/usr/local/bin/jic-turnserver.sh"]
