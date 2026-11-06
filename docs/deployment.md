# Deploy SMX to Google Compute Engine

This guide describes how to run StakeMe Exchange (SMX) on one Compute Engine VM
with Docker Compose. Caddy terminates TLS, the app serves HTTP on port 4020, and
Postgres 18 runs in a container on the same host.

Production URL: https://stakeme.magnificlabs.org

## Before you begin

- Install and sign in to the `gcloud` CLI. Use project `stakeme-ex-261106`.
- Point the `A` record of your domain at the VM's static IP (Cloudflare: DNS only).
- Put your app secrets in the repo-root `.env`. The file is copied with `scp`
  and never committed or printed.

## Resources

| Resource | Value |
| --- | --- |
| VM | `smx-prod`, `asia-south1-a`, e2-medium (4 GB RAM), 20 GB disk, Ubuntu 22.04 |
| Static IP | `smx-prod-ip` (`asia-south1`) |
| Firewall | `smx-allow-http-https` (tcp:80, tcp:443; tags `http-server`, `https-server`) and `smx-allow-iap-ssh` (tcp:22 from the IAP range) |
| Budget | `smx-cap`, 2000 INR, alerts at 50%, 90% and 100%. Alerts only; the budget doesn't stop spend. |
| Auto-stop | `smx-stop-nov9`, stops the VM Monday 9 Nov 2026 at 01:00 IST |

## Deploy

Run one deploy at a time. Two concurrent `push` or `up` runs race on the
`/opt/smx/src` swap and the `smx-build` unit. All commands are idempotent. `SMX_DOMAIN` defaults to `stakeme.magnificlabs.org`.

```sh
deploy/gcp.sh provision   # first time only: enable APIs, reserve the IP, add firewall rules, create the VM, attach the stop schedule
deploy/gcp.sh push   # upload `git archive HEAD`, .env, and a generated .env.prod
deploy/gcp.sh up     # add swap, build the image, start the stack, wait for /healthz
```

`push` generates `.env.prod` with `NODE_ENV=production`, `DEMO_MODE` (copied from
`.env`, default `1`), `CANONICAL_ORIGIN`, `SMX_DOMAIN`, `PORT`, `POSTGRES_PASSWORD`,
a `DB_URI` that points at the Compose Postgres, and three fixed values:
`CHAIN_NULLIFIER_SALT` (currently `prod-2026-11-07b`), `ATS_MODE=live`, and
`DIVIDEND_HBAR_PER_USDC=0.0001` (the HBAR rail for DB-only creators). It archives `HEAD`, so commit
first; uncommitted files under `deploy/`, plus `Dockerfile` and `docs/deployment.md`,
are overlaid from your working tree. The database password is created once and kept on the VM.

`up` builds the image in a `systemd` unit (`smx-build`) so the build survives the
SSH session. The first build takes about 10 minutes on an e2-medium; later builds
reuse cached layers. A one-shot `migrate` service applies pending migrations
before the app starts, and Caddy starts once the app is healthy. Caddy requests a
Let's Encrypt certificate on first start. `up` also adds 2 GB of swap for the build.

## Verify

```sh
curl -s https://stakeme.magnificlabs.org/healthz   # prints: ok
deploy/gcp.sh status
deploy/gcp.sh logs app
```

## Seed demo data

The seed sends real Hedera testnet transactions with the oracle key. Run only one
process that signs with that key at a time, or nonces collide.

```sh
deploy/gcp.sh ssh 'cd /opt/smx/src && sudo docker compose -f deploy/docker-compose.prod.yml --env-file .env.prod run --rm -v /opt/smx/users.json:/users.json:ro -e SMX_DEMO_USERS=/users.json app npm run seed:demo -- --pg'
```

### Reseed production

Production puts only `MUSH`, `RAVI` and `RAHUL` onchain. The other five seeded
creators are DB-only. The worker runs inside the `app` container and signs with
the same oracle key, so pause it while you seed:

1. Stop the app: `deploy/gcp.sh ssh 'cd /opt/smx/src && sudo docker compose -f deploy/docker-compose.prod.yml --env-file .env.prod stop app'`.
2. Run the seed command above with `--onchain=MUSH,RAVI,RAHUL` after `--pg`.
3. Start the app again: `deploy/gcp.sh up`.

The factory blocks reused World ID nullifiers. To reseed a database that
already launched onchain creators, change `CHAIN_NULLIFIER_SALT` in
`deploy/gcp.sh` first (or deploy a new factory), then `push`.

## Other commands

`logs [service]`, `ssh [command]`, `stop`, `start`, `budget`, and `destroy`
(`destroy` asks you to type the project ID; `SMX_YES=1` skips the prompt). SSH
connects directly by default; set `SMX_IAP=1` to tunnel through IAP.

## Troubleshooting

- **Build fails in `vite build` or `hardhat compile`**: read `/opt/smx/build.log`
  on the VM. macOS metadata files (`._*`) in the archive break Hardhat; `push`
  removes them and `.dockerignore` excludes them.
- **Build stops with no error**: it was started from a session that ended. Use
  `deploy/gcp.sh up`, which runs it as a systemd unit.
- **Certificate not issued**: confirm the `A` record resolves to the VM IP and
  ports 80 and 443 are open, then read `deploy/gcp.sh logs caddy`.
