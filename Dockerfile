# SMX app — production image.
#
# Build for the architecture the ECS task runs on; a macOS arm64 host would
# otherwise produce an image Fargate x86 cannot start:
#   docker build --platform linux/amd64 -t stakeme:latest .
#
# Stages: deps (cached install) -> build (compile + prune) -> runtime (slim).
#
# glibc rather than Alpine is deliberate: native prebuilt binaries target glibc.

# Node 24 is the Active LTS (Krypton, security-supported to 2028-04-30) and
# matches the repo's `engines.node`. Track LTS majors only — odd-numbered
# releases never become LTS and are supported for about eight months.
ARG NODE_IMAGE=node:24-bookworm-slim

# ---- deps: install once, cached on the lockfile ---------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app

# Some transitive deps (utf-8-validate, bufferutil) have no prebuilt binary for
# every platform and fall back to node-gyp, which needs a toolchain. It stays
# in this stage; the runtime image copies only the compiled node_modules.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

# A slow registry link otherwise kills `npm ci` with EIDLETIMEOUT.
ENV NPM_CONFIG_FETCH_RETRIES=5 \
	NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
	NPM_CONFIG_FETCH_TIMEOUT=300000

# Manifests only, so this layer survives any source edit. Every workspace has to
# be listed — `npm ci` refuses to run against a lockfile whose workspaces it
# cannot see,.
COPY package.json package-lock.json ./
COPY packages/app/package.json ./packages/app/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/client/package.json ./packages/client/

# Dev dependencies are needed here: typescript and vite do the build below.
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- build: compile, then drop dev dependencies ---------------------------
FROM deps AS build
WORKDIR /app
COPY . .

# Produces client/lib, app/lib and app/public/dist. The last is the browser bundle: JS, the
# bundled stylesheet, the webfonts, and the `manifest.json` the server reads to
# resolve their content-hashed filenames. Under NODE_ENV=production the server
# does not start Vite, so without it every page renders unstyled and without
# its JavaScript.
RUN npm run build

# Prune in place rather than running `npm ci --omit=dev` into a clean stage:
# that keeps the node_modules/@stakeme/* symlinks pointing at
# ./packages/*, which is how the app resolves its own workspaces.
RUN npm prune --omit=dev

# ---- runtime --------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

# tini reaps zombies and forwards signals. The proof path spawns child processes
# (the zk-circuit downloader) and PID 1 does no reaping by default, so without
# an init those accumulate. It also means correct SIGTERM delivery without
# depending on the task definition's `initProcessEnabled`. postgresql-client
# supplies `psql` for running SQL by hand in the container; migrations go over
# a pg client (scripts/migrate.ts) and no longer need it.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends postgresql-client tini \
	&& rm -rf /var/lib/apt/lists/*

# TZ=UTC is a product decision, not a default. The dashboard renders dates
# server-side, so the container's zone decides which calendar day a timestamp
# falls on — set TZ to anything else and every date in the UI shifts. Pinning it
# keeps the UI, the API and the logs all on one clock.
ENV NODE_ENV=production \
	PORT=4020 \
	TZ=UTC \
	NPM_CONFIG_UPDATE_NOTIFIER=false

# `node` (uid 1000) ships with the official image. Root is the default and is
# worth undoing — a dependency RCE should not own the container.
COPY --from=build --chown=node:node /app /app
USER node

EXPOSE 4020

# Container-level liveness. Point the ALB target group at the same path; this
# check covers `docker compose` and any ECS container-level healthCheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4020)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]

# The COMPILED entry, not `scripts/start.ts`. Route modules are resolved next to
# the running `app` module, and 45 of them are `.tsx`: Node's type stripping
# handles `.ts` but cannot load JSX, so a server started from `src/` returns 500
# for every HTML page while the JSON routes look healthy. `lib/` is all `.js`.
#
# Web and background workers share this one process (src/server.ts). Schema
# migrations are a separate deployment step: run
# `node packages/app/scripts/migrate.ts` as an ECS one-off task before starting
# this release. It applies only pending migrations and is safe on every deploy.
CMD ["node", "packages/app/lib/server.js"]
