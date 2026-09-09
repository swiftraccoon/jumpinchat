# TURN relay

The image extends the upstream coturn 4.18 release. Configuration is generated at
startup; credentials and TLS keys are never baked into the image.

Use `jumpinchat-deploy/compose.turn.yml` alongside the main profile or on a separate
media host. Set `TURN_SHARED_SECRET` to the same random value in the app and relay,
`TURN_REALM` to the relay hostname, and `TURN_EXTERNAL_IP` to its public IP. On a
host behind NAT, coturn also accepts `public-ip/private-ip` mapping. Set the app's
`TURN_URIS` to the public relay hostname. Mount its certificate and key as shown in
the Compose file. The relay exposes UDP/TCP 3478, TLS/TCP 5349, and UDP relay ports
49160–49200; those ports must be forwarded to this host.

```bash
cd ../jumpinchat-deploy
podman-compose -f compose.turn.yml build
podman-compose -f compose.turn.yml up -d
```

For an isolated development relay without certificates, pass `TURN_TLS=false`
when running the image directly. Production clients should use the TLS endpoint
when UDP is unavailable. After upgrading, verify media with a browser configured
to require a relay candidate and verify TLS connectivity from the deployment's
supported networks. No relay or live data migration is run by the build.
