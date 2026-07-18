#!/usr/bin/env bash
# Deploy the current `main` to the homeserver.
#
# The homeserver runs its OWN git checkout of this repo (origin/main) — it is no
# longer a mutagen mirror of your local working tree. Your local WIP can never
# reach the homeserver except by merging to `main` and running this script.
#
# THE GUARDRAIL: the homeserver must always run the prod overlay
#   docker compose -f compose.yaml -f compose.prod.yaml ...
# A bare `docker compose up/restart` in that directory silently reverts the
# frontend + backend to DEV mode (Vite dev server, localhost Keycloak issuer) —
# that is the "dev env on homeserver" bug this script exists to prevent. Both -f
# flags are baked in below so a deploy can never drop the overlay.
#
# Auth: the homeserver pulls via a read-only SSH deploy key configured as the
# repo's core.sshCommand (~/.ssh/odt-ville-deploy). No token, no global SSH change.
#
# Usage: scripts/deploy-homeserver.sh
set -euo pipefail

SSH_HOST="${SSH_HOST:-homeserver}"
REMOTE_DIR="${REMOTE_DIR:-apps/odt-ville}"

echo "==> Deploying origin/main to ${SSH_HOST}:${REMOTE_DIR}"

ssh "$SSH_HOST" "bash -s" <<REMOTE
set -euo pipefail
cd "${REMOTE_DIR}"

DC="docker compose -f compose.yaml -f compose.prod.yaml"   # prod overlay ALWAYS

OLD=\$(git rev-parse --short HEAD)
git fetch -q origin main
git reset --hard origin/main
NEW=\$(git rev-parse --short HEAD)
echo "==> Code: \${OLD} -> \${NEW}"
if [ "\${OLD}" = "\${NEW}" ]; then
  echo "    (no new commits — redeploying current main anyway)"
fi
git --no-pager log --oneline "\${OLD}..\${NEW}" 2>/dev/null || true

# Rebuild images if the Dockerfiles/config changed, and guarantee the prod
# overlay is applied to every service (this is what un-drifts a dev'd service).
echo "==> Applying prod stack"
\$DC up -d --build

# Code lives on bind mounts, so changed source needs the boot commands to re-run:
#   backend  -> bundle install && rails db:prepare (migrations) && rails server
#   frontend -> pnpm install && pnpm run build (prod build) && pnpm run preview
# 'restart' re-runs those even when 'up' saw no config change.
# (No backticks in this heredoc — it's unquoted, so backticks EXECUTE locally.)
echo "==> Restarting backend + frontend to apply code/migrations + rebuild"
\$DC restart backend frontend

echo "==> Stack status"
\$DC ps --format "table {{.Service}}\t{{.Status}}"
REMOTE

echo "==> Waiting for the public build to come up..."
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" https://odt-ville.p2d.uk/ || true)
  if [ "$code" = "200" ]; then
    if curl -s https://odt-ville.p2d.uk/ | grep -q "@vite/client"; then
      echo "!! WARNING: site is serving the Vite DEV client — overlay drifted?"
      exit 1
    fi
    echo "==> Live: https://odt-ville.p2d.uk/ (200, prod build)"
    exit 0
  fi
  sleep 5
done
echo "!! Site did not return 200 in time — check: ssh ${SSH_HOST} 'cd ${REMOTE_DIR} && docker compose -f compose.yaml -f compose.prod.yaml logs --tail=50 frontend'"
exit 1
