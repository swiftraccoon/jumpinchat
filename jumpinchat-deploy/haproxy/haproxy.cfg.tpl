global
  log stdout  format raw  local0  debug

resolvers podman
  nameserver dns RESOLVER_IP:53
  resolve_retries 3
  timeout resolve 1s
  timeout retry   1s
  hold valid      10s
  hold other      10s
  hold refused    10s
  hold nx         10s
  hold timeout    10s
  hold obsolete   10s

defaults
  log     global
  mode    http
  option  httplog
  option  dontlognull
  timeout connect 5000
  timeout client  50000
  timeout server  50000

frontend localnodes
  bind *:80
  mode http
  default_backend nodes

backend nodes
  mode http
  balance roundrobin
  option forwardfor
  http-request set-header X-Forwarded-Port %[dst_port]
  http-request add-header X-Forwarded-Proto https if { ssl_fc }
  server web01 web:80 resolvers podman init-addr last,libc,none resolve-prefer ipv4
  server web02 web2:80 resolvers podman init-addr last,libc,none resolve-prefer ipv4
