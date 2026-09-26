FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS agent
ENV MEMTRACE_NO_AUTO_SETUP=1 MEMTRACE_TELEMETRY=off MEMTRACE_SKIP_EMBED=1
RUN apt-get update && apt-get install --no-install-recommends -y ca-certificates git gh ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.34.3 @openai/codex@0.156.1 memtrace@1.2.8 \
    && mkdir -p /workspace /home/node/.cache /home/node/.codex \
    && chown -R node:node /workspace /home/node/.cache /home/node/.codex
COPY --chmod=0444 deploy/agent/requirements.toml /etc/codex/requirements.toml
COPY --chmod=0444 deploy/agent/config.toml /etc/codex/config.toml
COPY --chmod=0555 deploy/agent/start /usr/local/bin/circuitone-agent
RUN ln -s .cache /home/node/.memtrace
ENV NODE_USE_ENV_PROXY=1 \
    XDG_CACHE_HOME=/home/node/.cache \
    XDG_CONFIG_HOME=/home/node/.cache/config \
    PNPM_HOME=/home/node/.cache/pnpm/bin \
    npm_config_store_dir=/home/node/.cache/pnpm/store \
    MEMTRACE_DATA_DIR=/home/node/.cache/memtrace \
    MEMTRACE_MEMDB_DATA_DIR=/home/node/.cache/memdb \
    MEMTRACE_MAX_THREADS=2
USER node
WORKDIR /workspace
# Nenhum hook/checkout executa antes do firewall e das negativas do mantenedor.
CMD ["sleep", "infinity"]

FROM debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251 AS network
RUN apt-get update && apt-get install --no-install-recommends -y ca-certificates squid nftables \
    && rm -rf /var/lib/apt/lists/*
COPY deploy/agent/squid.conf /etc/squid/squid.conf
COPY deploy/agent/guard.nft /etc/circuitone-guard.nft
USER proxy
CMD ["squid", "-N", "-f", "/etc/squid/squid.conf"]
