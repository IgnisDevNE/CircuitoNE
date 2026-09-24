FROM docker.io/library/caddy:2-alpine@sha256:de23def33b17fb5d1290b0f6c2add1d70780e52341896c00a4c8a2a2fe9d355e
RUN setcap -r /usr/bin/caddy && chown -R 1000:1000 /data /config
COPY deploy/Caddyfile /etc/caddy/Caddyfile
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
