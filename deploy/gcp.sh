#!/usr/bin/env bash
# Deploy SMX to one Google Compute Engine VM with Docker Compose.
#
#   deploy/gcp.sh provision   enable API, reserve IP, firewall, create VM
#   deploy/gcp.sh push        upload git archive HEAD, .env, generated .env.prod
#   deploy/gcp.sh up          build and start the stack, run migrations
#   deploy/gcp.sh logs [svc]  follow logs
#   deploy/gcp.sh ssh [cmd]   shell on the VM
#   deploy/gcp.sh stop        stop the VM (disk and IP are kept)
#   deploy/gcp.sh start       start a stopped VM
#   deploy/gcp.sh status      VM and URL
#   deploy/gcp.sh budget      create a 2000 INR billing budget (alerts 50/90/100%)
#   deploy/gcp.sh destroy     delete VM, disk, IP, firewall rules, schedule policy
#
# Every step is idempotent. Secrets in .env are copied with scp only and are
# never printed.
set -euo pipefail
# macOS tar would add AppleDouble `._*` files, which break hardhat.
export COPYFILE_DISABLE=1

PROJECT="${GCP_PROJECT:-stakeme-ex-261106}"
REGION="${GCP_REGION:-asia-south1}"
ZONE="${GCP_ZONE:-asia-south1-a}"
VM="${SMX_VM:-smx-prod}"
IP_NAME="${SMX_IP_NAME:-smx-prod-ip}"
MACHINE="${SMX_MACHINE:-e2-medium}"
DISK_GB="${SMX_DISK_GB:-20}"
SCHEDULE_NAME="${SMX_SCHEDULE:-smx-stop-nov9}"
# One-off cap: stop the VM Monday 2026-11-09 01:00 IST (cron runs yearly; destroy before then next year).
STOP_CRON="${SMX_STOP_CRON:-0 1 9 11 *}"
STOP_TZ="Asia/Kolkata"
BUDGET_INR="${SMX_BUDGET_INR:-2000}"
TAGS="http-server,https-server"
REMOTE_DIR="/opt/smx"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
G=(gcloud --project "$PROJECT" --quiet)

log() { printf '==> %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

require_billing() {
  local b
  b="$("${G[@]}" billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || true)"
  [[ "$b" == "True" ]] || die "billing is not enabled on $PROJECT"
}

vm_exists() { "${G[@]}" compute instances describe "$VM" --zone "$ZONE" >/dev/null 2>&1; }

ip_address() {
  local i out
  for i in 1 2 3 4; do
    if out="$("${G[@]}" compute addresses describe "$IP_NAME" --region "$REGION" --format='value(address)' 2>/dev/null)"; then
      printf '%s' "$out"; return 0
    fi
    sleep 2
  done
}

# SMX_DOMAIN defaults to the production host; set it empty-and-unset to use <ip>.sslip.io.
domain() {
  if [[ -n "${SMX_DOMAIN-stakeme.magnificlabs.org}" ]]; then printf '%s' "${SMX_DOMAIN-stakeme.magnificlabs.org}"; return; fi
  local ip; ip="$(ip_address)"
  [[ -n "$ip" ]] || die "static IP $IP_NAME not reserved; run provision"
  printf '%s.sslip.io' "${ip//./-}"
}

# Direct SSH (port 22 is open). Set SMX_IAP=1 to tunnel through IAP instead.
SSH_FLAGS=()
[[ "${SMX_IAP:-0}" == "1" ]] && SSH_FLAGS=(--tunnel-through-iap)
gssh() { "${G[@]}" compute ssh "$VM" --zone "$ZONE" ${SSH_FLAGS[@]+"${SSH_FLAGS[@]}"} --command "$1"; }
gscp() { "${G[@]}" compute scp --zone "$ZONE" ${SSH_FLAGS[@]+"${SSH_FLAGS[@]}"} "$@"; }

STARTUP_SCRIPT='#!/bin/bash
set -e
if ! command -v docker >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
mkdir -p /opt/smx && chmod 777 /opt/smx
touch /var/lib/smx-startup-done
'

cmd_provision() {
  require_billing
  log "enabling compute API"
  "${G[@]}" services enable compute.googleapis.com iap.googleapis.com

  if [[ -z "$(ip_address)" ]]; then
    log "reserving static IP $IP_NAME"
    "${G[@]}" compute addresses create "$IP_NAME" --region "$REGION"
  fi

  if ! "${G[@]}" compute firewall-rules describe smx-allow-http-https >/dev/null 2>&1; then
    log "creating firewall rule for tcp:80,443"
    "${G[@]}" compute firewall-rules create smx-allow-http-https \
      --network default --direction INGRESS --allow tcp:80,tcp:443 \
      --target-tags "$TAGS" --source-ranges 0.0.0.0/0
  fi
  if ! "${G[@]}" compute firewall-rules describe smx-allow-iap-ssh >/dev/null 2>&1; then
    log "creating firewall rule for SSH via IAP (35.235.240.0/20)"
    "${G[@]}" compute firewall-rules create smx-allow-iap-ssh \
      --network default --direction INGRESS --allow tcp:22 \
      --source-ranges 35.235.240.0/20 || true
  fi

  if ! vm_exists; then
    log "creating VM $VM ($MACHINE, ${DISK_GB} GB, Ubuntu 22.04)"
    local sf; sf="$(mktemp)"; printf '%s' "$STARTUP_SCRIPT" > "$sf"
    "${G[@]}" compute instances create "$VM" \
      --zone "$ZONE" --machine-type "$MACHINE" \
      --image-family ubuntu-2204-lts --image-project ubuntu-os-cloud \
      --boot-disk-size "${DISK_GB}GB" --boot-disk-type pd-standard \
      --address "$IP_NAME" --tags "$TAGS" \
      --metadata-from-file startup-script="$sf"
    rm -f "$sf"
  else
    log "VM $VM already exists"
    "${G[@]}" compute instances start "$VM" --zone "$ZONE" >/dev/null 2>&1 || true
  fi

  ensure_schedule

  log "waiting for Docker install on the VM"
  local i
  for i in $(seq 1 40); do
    if gssh 'test -f /var/lib/smx-startup-done && docker compose version' >/dev/null 2>&1; then
      log "VM ready"; echo "https://$(domain)"; return 0
    fi
    sleep 15
  done
  die "VM did not become ready; check: deploy/gcp.sh ssh 'sudo journalctl -u google-startup-scripts'"
}

ensure_schedule() {
  if ! "${G[@]}" compute resource-policies describe "$SCHEDULE_NAME" --region "$REGION" >/dev/null 2>&1; then
    log "creating instance schedule $SCHEDULE_NAME (stop: '$STOP_CRON' $STOP_TZ)"
    "${G[@]}" compute resource-policies create instance-schedule "$SCHEDULE_NAME" \
      --region "$REGION" --vm-stop-schedule="$STOP_CRON" --timezone="$STOP_TZ"
  fi
  # The Compute Engine service agent stops the VM, so it needs permission.
  local num
  num="$("${G[@]}" projects describe "$PROJECT" --format='value(projectNumber)')"
  "${G[@]}" projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:service-${num}@compute-system.iam.gserviceaccount.com" \
    --role=roles/compute.instanceAdmin.v1 --condition=None >/dev/null 2>&1 || true
  if ! "${G[@]}" compute instances describe "$VM" --zone "$ZONE" --format='value(resourcePolicies)' | grep -q "$SCHEDULE_NAME"; then
    log "attaching schedule to $VM"
    "${G[@]}" compute instances add-resource-policies "$VM" --zone "$ZONE" --resource-policies="$SCHEDULE_NAME"
  fi
}

cmd_budget() {
  require_billing
  "${G[@]}" services enable billingbudgets.googleapis.com
  local acct cur amt
  acct="$("${G[@]}" billing projects describe "$PROJECT" --format='value(billingAccountName)' | sed 's#billingAccounts/##')"
  [[ -n "$acct" ]] || die "no linked billing account"
  if "${G[@]}" billing budgets list --billing-account="$acct" --format='value(displayName)' 2>/dev/null | grep -qx smx-cap; then
    log "budget smx-cap already exists"; return 0
  fi
  cur="$("${G[@]}" billing accounts describe "$acct" --format='value(currencyCode)' 2>/dev/null || echo INR)"
  amt="$BUDGET_INR"
  if [[ "$cur" != "INR" ]]; then
    # Budget currency must match the account. Approximate 2000 INR (about 24 USD).
    local usd="${SMX_BUDGET_FOREIGN:-24}"
    log "billing account currency is $cur, not INR: using $usd $cur as the equivalent of ${BUDGET_INR} INR (set SMX_BUDGET_FOREIGN to override)"
    amt="$usd"
  fi
  "${G[@]}" billing budgets create --billing-account="$acct" --display-name=smx-cap \
    --filter-projects="projects/$PROJECT" --budget-amount="${amt}${cur}" \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 --billing-project="$PROJECT"
  log "budget created: ${amt} ${cur}, alerts at 50/90/100% (alerts email billing admins; budgets do not stop spend)"
}

cmd_push() {
  require_billing
  local dom; dom="$(domain)"
  [[ -f "$ROOT/.env" ]] || die "$ROOT/.env not found"
  local tmp; tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  log "archiving HEAD"
  git -C "$ROOT" archive --format=tar.gz -o "$tmp/smx.tgz" HEAD
  # Until the deploy files are committed, overlay them from the working tree
  # (only these paths; other uncommitted work is never shipped).
  if [[ -n "$(git -C "$ROOT" status --porcelain -- deploy Dockerfile docs/deployment.md packages/app/public/styles/diwali-effects.css)" ]]; then
    log "overlaying uncommitted deploy/, Dockerfile, docs/deployment.md"
    mkdir "$tmp/x" && tar -xzf "$tmp/smx.tgz" -C "$tmp/x"
    (cd "$ROOT" && cp -R deploy Dockerfile "$tmp/x/" && cp docs/deployment.md "$tmp/x/docs/" && cp packages/app/public/styles/diwali-effects.css "$tmp/x/packages/app/public/styles/")
    tar -czf "$tmp/smx.tgz" -C "$tmp/x" .
    find "$tmp/x" -name '._*' -delete
  fi

  # DEMO_MODE as in .env (default 1). The password is read from the VM so it is
  # generated once and survives re-pushes.
  local demo
  demo="$(grep -E '^DEMO_MODE=' "$ROOT/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'" || true)"
  demo="${demo:-1}"
  local pw
  pw="$(gssh 'cat /opt/smx/.pgpass-smx 2>/dev/null || true' | tr -d '[:space:]')"
  if [[ -z "$pw" ]]; then
    pw="$(openssl rand -hex 24)"
    log "generated a Postgres password (kept on the VM only)"
  fi
  cat > "$tmp/env.prod" <<EOP
NODE_ENV=production
DEMO_MODE=$demo
CANONICAL_ORIGIN=https://$dom
SMX_DOMAIN=$dom
PORT=4020
POSTGRES_PASSWORD=$pw
DB_URI=postgres://postgres:$pw@postgres:5432/postgres
CHAIN_NULLIFIER_SALT=prod-2026-11-07b
ATS_MODE=live
DIVIDEND_HBAR_PER_USDC=0.0001
EOP
  printf '%s' "$pw" > "$tmp/pgpass"

  log "uploading"
  gscp "$tmp/smx.tgz" "$tmp/env.prod" "$tmp/pgpass" "$ROOT/.env" "$VM:/tmp/"
  gssh "set -e
    sudo mkdir -p $REMOTE_DIR && sudo chown \$(id -u):\$(id -g) $REMOTE_DIR
    cd $REMOTE_DIR
    rm -rf src.new && mkdir src.new && tar -xzf /tmp/smx.tgz -C src.new
    umask 077
    mv -f /tmp/.env src.new/.env
    mv -f /tmp/env.prod src.new/.env.prod
    [ -f .pgpass-smx ] || mv /tmp/pgpass .pgpass-smx
    rm -f /tmp/pgpass /tmp/smx.tgz
    rm -rf src.old && { [ -d src ] && mv src src.old || true; } && mv src.new src && rm -rf src.old
    chmod 600 src/.env src/.env.prod .pgpass-smx
    echo uploaded"
}

cmd_up() {
  require_billing
  local dom; dom="$(domain)"
  local dc="sudo docker compose -f deploy/docker-compose.prod.yml --env-file .env.prod"
  log "ensuring 2 GB swap (the Vite and Hardhat build needs it on 4 GB RAM)"
  gssh 'swapon --show | grep -q swapfile || { sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile; }'
  # The build runs as a systemd unit so it survives the SSH session ending
  # (a plain background job is killed with the session and never finishes).
  log "building the image (first build takes about 10 minutes; later builds use the layer cache)"
  gssh "sudo systemctl reset-failed smx-build 2>/dev/null || true
    cd $REMOTE_DIR/src
    sudo systemd-run --unit smx-build --working-directory $REMOTE_DIR/src --collect \\
      --property=StandardOutput=file:$REMOTE_DIR/build.log --property=StandardError=file:$REMOTE_DIR/build.log \\
      docker compose -f deploy/docker-compose.prod.yml --env-file .env.prod build --progress=plain app"
  local i
  for i in $(seq 1 120); do
    gssh 'systemctl is-active --quiet smx-build' 2>/dev/null || break
    sleep 10
  done
  gssh "sudo docker images -q smx-app | grep -q . || { tail -n 40 $REMOTE_DIR/build.log; exit 1; }" \
    || die "image build failed; see $REMOTE_DIR/build.log on the VM"
  log "starting the stack"
  gssh "set -e; cd $REMOTE_DIR/src
    $dc up -d --no-build --remove-orphans
    $dc ps"
  log "waiting for https://$dom/healthz"
  for i in $(seq 1 30); do
    if [[ "$(curl -fsS --max-time 10 "https://$dom/healthz" 2>/dev/null || true)" == "ok" ]]; then
      log "healthy"; echo "https://$dom"; return 0
    fi
    sleep 10
  done
  echo "https://$dom"
  die "health check did not pass yet (certificate issuance can take a minute); try: deploy/gcp.sh logs"
}

cmd_logs() {
  gssh "cd $REMOTE_DIR/src && sudo docker compose -f deploy/docker-compose.prod.yml --env-file .env.prod logs -f --tail=200 ${*:-}"
}

cmd_ssh() {
  if [[ $# -gt 0 ]]; then gssh "$*"; return; fi
  "${G[@]}" compute ssh "$VM" --zone "$ZONE" ${SSH_FLAGS[@]+"${SSH_FLAGS[@]}"}
}

cmd_stop() { log "stopping $VM (disk and IP remain, small cost)"; "${G[@]}" compute instances stop "$VM" --zone "$ZONE"; }
cmd_start() { "${G[@]}" compute instances start "$VM" --zone "$ZONE"; echo "https://$(domain)"; }
cmd_status() { "${G[@]}" compute instances list --filter="name=$VM" 2>/dev/null; echo "https://$(domain 2>/dev/null || echo '<no-ip>')"; }

cmd_destroy() {
  log "deleting VM, static IP and firewall rules in $PROJECT"
  if [[ "${SMX_YES:-}" != "1" ]]; then
    read -r -p "Type the project id to confirm: " ans
    [[ "$ans" == "$PROJECT" ]] || die "aborted"
  fi
  vm_exists && "${G[@]}" compute instances delete "$VM" --zone "$ZONE" --delete-disks=all
  [[ -n "$(ip_address)" ]] && "${G[@]}" compute addresses delete "$IP_NAME" --region "$REGION"
  "${G[@]}" compute resource-policies describe "$SCHEDULE_NAME" --region "$REGION" >/dev/null 2>&1 \
    && "${G[@]}" compute resource-policies delete "$SCHEDULE_NAME" --region "$REGION"
  local r
  for r in smx-allow-http-https smx-allow-iap-ssh; do
    "${G[@]}" compute firewall-rules describe "$r" >/dev/null 2>&1 && "${G[@]}" compute firewall-rules delete "$r"
  done
  log "destroyed"
}

sub="${1:-}"; shift || true
case "$sub" in
  provision|budget|push|up|logs|ssh|stop|start|status|destroy) "cmd_$sub" "$@" ;;
  *) sed -n '2,17p' "${BASH_SOURCE[0]}"; exit 1 ;;
esac
