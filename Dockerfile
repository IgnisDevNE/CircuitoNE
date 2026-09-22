FROM docker.io/library/node:22-alpine@sha256:b64da1de5a51067ab8e75f0bc8dbd0905d8894baa22261f439a4572f41291e50 AS build
WORKDIR /app
RUN npm install --global pnpm@10.34.3
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM docker.io/library/caddy:2-alpine@sha256:040e9f7480b80b6d4a7e5013a21159b950a63dcbdb956e38abe2387fb28d9ec0
RUN setcap -r /usr/bin/caddy && chown -R 1000:1000 /data /config
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
