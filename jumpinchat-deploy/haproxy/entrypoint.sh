#!/bin/bash
set -e

# Read the container DNS resolver from resolv.conf
RESOLVER=$(grep nameserver /etc/resolv.conf | head -1 | awk '{print $2}')

# Inject the resolver IP into haproxy config template
sed "s/RESOLVER_IP/${RESOLVER}/g" \
  /usr/local/etc/haproxy/haproxy.cfg.tpl \
  > /usr/local/etc/haproxy/haproxy.cfg

exec haproxy -f /usr/local/etc/haproxy/haproxy.cfg
