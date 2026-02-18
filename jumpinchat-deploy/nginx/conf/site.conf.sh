#!/usr/bin/env bash

EXTERNAL_IP=$(curl -s --connect-timeout 5 icanhazip.com || echo "")

# Upstream host/port defaults (Docker DNS names for single-server)
WEB_HOST="${WEB_HOST:-web}"
WEB_PORT="${WEB_PORT:-80}"
WEB2_HOST="${WEB2_HOST:-web2}"
WEB2_PORT="${WEB2_PORT:-80}"
HOME_HOST="${HOME_HOST:-home}"
HOME_PORT="${HOME_PORT:-3000}"
HOME2_HOST="${HOME2_HOST:-home2}"
HOME2_PORT="${HOME2_PORT:-3000}"
HAPROXY_HOST="${HAPROXY_HOST:-haproxy}"
HAPROXY_PORT="${HAPROXY_PORT:-80}"
JANUS_WS_HOST="${JANUS_WS_HOST:-janus}"
JANUS2_WS_HOST="${JANUS2_WS_HOST:-janus2}"
JANUS_WS_PORT="${JANUS_WS_PORT:-8989}"
JANUS_HTTP_HOST="${JANUS_HTTP_HOST:-janus}"
JANUS_HTTP_PORT="${JANUS_HTTP_PORT:-8088}"
JANUS_ADMIN_PORT="${JANUS_ADMIN_PORT:-8188}"

# Storage backend: "local" serves from shared volume, "s3" proxies to MinIO
STORAGE_BACKEND="${STORAGE_BACKEND:-local}"
MINIO_HOST="${MINIO_HOST:-minio}"
MINIO_PORT="${MINIO_PORT:-9000}"

# Build /uploads/ location based on storage backend
if [[ "$STORAGE_BACKEND" == "s3" ]]; then
UPLOADS_LOCATION=$(cat <<'UPLOADSEOF'
  # Proxy uploads to MinIO (S3 backend)
  # storage.js stores objects at key public/{file} in bucket uploads
  location /uploads/ {
    proxy_set_header Host $host;
    proxy_hide_header x-amz-request-id;
    proxy_hide_header x-amz-id-2;

    location ~* \.(jpg|jpeg|png|gif)$ {
      rewrite ^/uploads/(.*)$ /uploads/public/$1 break;
      proxy_pass http://MINIO_UPSTREAM;
      proxy_set_header Host $host;
      proxy_hide_header x-amz-request-id;
      proxy_hide_header x-amz-id-2;
      add_header X-Content-Type-Options "nosniff" always;
      add_header Content-Security-Policy "default-src 'none'; sandbox" always;
      add_header X-Frame-Options "DENY" always;
      add_header Cross-Origin-Resource-Policy "same-site" always;
      add_header Cache-Control "public, max-age=86400" always;
    }

    return 403;
  }
UPLOADSEOF
)
# Replace placeholder with actual MinIO host:port
UPLOADS_LOCATION="${UPLOADS_LOCATION//MINIO_UPSTREAM/${MINIO_HOST}:${MINIO_PORT}}"
else
UPLOADS_LOCATION=$(cat <<'UPLOADSEOF'
  # Serve uploaded images directly from shared volume (local backend)
  location /uploads/ {
    alias /data/uploads/public/;
    autoindex off;
    disable_symlinks if_not_owner;

    location ~* \.(jpg|jpeg|png|gif)$ {
      add_header X-Content-Type-Options "nosniff" always;
      add_header Content-Security-Policy "default-src 'none'; sandbox" always;
      add_header X-Frame-Options "DENY" always;
      add_header Cross-Origin-Resource-Policy "same-site" always;
      add_header Cache-Control "public, max-age=86400" always;
      try_files $uri =404;
    }

    return 403;
  }
UPLOADSEOF
)
fi

cat << EOF > /etc/nginx/conf.d/site.conf
map \$http_upgrade \$connection_upgrade {
  default upgrade;
  '' close;
}

upstream websocket {
  server ${JANUS_WS_HOST}:${JANUS_ADMIN_PORT};
}

upstream janusws {
  server ${JANUS_WS_HOST}:${JANUS_WS_PORT};
}

upstream janusws2 {
  server ${JANUS2_WS_HOST}:${JANUS_WS_PORT};
}

map \$cookie_janus_id \$janusServer {
  janus "janusws";
  janus2 "janusws2";
}

upstream websrv {
  ip_hash;
  server ${WEB_HOST}:${WEB_PORT} max_fails=3 fail_timeout=30s;
  server ${WEB2_HOST}:${WEB2_PORT} max_fails=3 fail_timeout=30s;
}

upstream homesrv {
  server ${HOME_HOST}:${HOME_PORT} max_fails=3 fail_timeout=30s;
  server ${HOME2_HOST}:${HOME2_PORT} max_fails=3 fail_timeout=30s;
}

upstream haproxybackend {
  server ${HAPROXY_HOST}:${HAPROXY_PORT} max_fails=3 fail_timeout=30s;
}

geo \$limit {
  default 1;
  10.0.0.0/8 0;
  ${EXTERNAL_IP} 0;
}

map \$limit \$limit_key {
  0 "";
  1 \$binary_remote_addr;
}

# request limiting
limit_req_zone \$limit_key zone=sitelimit:10m rate=2r/s;

# caching
proxy_cache_path  /var/cache/nginx levels=1:2 keys_zone=one:8m max_size=3000m inactive=600m;
proxy_temp_path /var/tmp;

sendfile_max_chunk 512k;

# gzip
gzip on;
gzip_comp_level 6;
gzip_vary on;
gzip_min_length  1000;
gzip_proxied any;
gzip_types text/plain text/html text/css application/json application/x-javascript text/xml application/xml application/xml+rss text/javascript;
gzip_buffers 16 8k;

server {
  listen 80;
  listen 443 ssl;
  server_name _;
  include /etc/nginx/root-ssl.conf;
  limit_req zone=sitelimit burst=100 nodelay;
  return 444;
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;

  server_name "~^172\.\d{1,3}\.\d{1,3}\.\d{1,3}\$" "~^10\.136\.\d{1,3}\.\d{1,3}\$" jumpin.chat local.jumpin.chat jumpinchat.com;
  client_max_body_size 10M;

  gzip on;
  gzip_comp_level 6;
  gzip_vary on;
  gzip_min_length  1000;
  gzip_proxied any;
  gzip_types text/plain application/javascript application/x-javascript text/javascript text/xml text/css;
  gzip_buffers 16 8k;
  limit_req zone=sitelimit burst=100 nodelay;

  include /etc/nginx/root-ssl.conf;

${UPLOADS_LOCATION}

  location / {
    try_files \$uri \$uri/ @homepage;
    proxy_cache one;
    proxy_cache_bypass \$http_cache_control;
    add_header X-Proxy-Cache \$upstream_cache_status;
    aio threads;
  }

  location /api {
    proxy_pass http://haproxybackend;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host \$http_host;
    proxy_set_header X-Forwarded-Proto https;
  }

  location @homepage {
    proxy_pass http://homesrv;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host \$http_host;
    proxy_intercept_errors on;
    recursive_error_pages on;
    error_page 404 = @web;
    aio threads;
  }

  location @web {
    proxy_pass http://websrv;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host \$http_host;
    proxy_set_header X-Forwarded-Proto https;
    aio threads;

    # Websocket support
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location /janus/ws {
    proxy_pass https://\$janusServer/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    add_header X-JANUS-SERVER \$janusServer;
  }

  location /janus/http {
    limit_req zone=sitelimit burst=300 nodelay;
    proxy_pass http://${JANUS_HTTP_HOST}:${JANUS_HTTP_PORT}/janus;
    proxy_redirect default;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }

  location = /robots.txt  {
    root /var/www/site/;
  }
}

server {
  listen 80;
  listen 443 ssl;

  server_name www.jumpinchat.com www.jumpin.chat;
  server_tokens off;
  limit_req zone=sitelimit burst=10 nodelay;
  return 301 https://jumpin.chat\$request_uri;
}

server {
  listen 80;
  server_name jumpin.chat www.jumpin.chat local.jumpin.chat jumpinchat.com www.jumpinchat.com;
  server_tokens off;
  limit_req zone=sitelimit burst=10 nodelay;
  return 301 https://\$host\$request_uri;
}
EOF
