#!/usr/bin/env bash
# Refresh Basecamp avatars on the homeserver, unattended (#322, ADR-0012).
#
# Basecamp's `avatar_url` is a signed URL that rotates when a person's Basecamp
# record moves. Between syncs a rotated URL 404s on our proxy and the header
# degrades to the initials chip — so the fix for staleness is simply running
# `rake basecamp:avatars` again. This is the thing that runs it.
#
# CRON (homeserver, `crontab -e` as ubuntu):
#   17 4 * * * /home/ubuntu/apps/odt-ville/scripts/basecamp-avatar-sync.sh
# Daily is plenty: a full run is a handful of requests over ~520 people.
#
# The prod overlay is baked in for the same reason it is in
# deploy-homeserver.sh — a bare `docker compose` in that directory addresses
# the DEV stack.
#
# ADR-0012 said to run this from the host, because launchpad's token endpoint
# answered 525 to container egress. It no longer does — the token endpoint and
# the avatar CDN both answer from inside the backend container on the
# homeserver — and `exec`ing the container costs no host Ruby, no host bundle
# to keep in step with each deploy, and no published Postgres port (prod
# deliberately keeps the database private). If 525 ever comes back it lands in
# the log below as a FAILED run, and the host-side command in ADR-0012 is the
# fallback.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

LOG_FILE="${LOG_FILE:-$PWD/log/basecamp-avatars.log}"
mkdir -p "$(dirname "$LOG_FILE")"

out=$(docker compose -f compose.yaml -f compose.prod.yaml \
  exec -T backend bin/rails basecamp:avatars 2>&1)
status=$?

# One line per healthy run ({people:, updated:}); the whole output when it
# fails, so an expired refresh token is readable rather than just absent.
if [ "$status" -eq 0 ]; then
  printf '%s ok %s\n' "$(date -u +%FT%TZ)" "$(printf '%s' "$out" | tail -n 1)" >>"$LOG_FILE"
else
  printf '%s FAILED (exit %s)\n%s\n' "$(date -u +%FT%TZ)" "$status" "$out" >>"$LOG_FILE"
fi

exit "$status"
