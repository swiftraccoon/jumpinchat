FROM nginx:stable

RUN apt-get update > /dev/null && \
    apt-get install -y -qq \
      curl \
    && rm -rf /var/lib/apt/lists/*

# Set up SSL
RUN mkdir -p /etc/nginx/ssl
RUN mkdir -p /var/www/site
RUN mkdir -p /var/log/nginx && \
      touch /var/log/nginx/access.log && \
      touch /var/log/nginx/error.log

# Copy the already-generated certificates into the image
COPY fullchain.pem /etc/nginx/ssl/fullchain.pem
COPY privkey.pem /etc/nginx/ssl/privkey.pem
COPY dhparam.pem /etc/nginx/ssl/dhparam.pem

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
