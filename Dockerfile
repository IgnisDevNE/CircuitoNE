FROM docker.io/library/node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
WORKDIR /app
RUN npm install --global pnpm@10.34.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM docker.io/library/node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
RUN npm install --global pnpm@10.34.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/scripts/start-runtime.mjs ./scripts/start-runtime.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -q --spider http://127.0.0.1:3000/ || exit 1
CMD ["pnpm", "start"]
