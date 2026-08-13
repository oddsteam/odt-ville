#!/usr/bin/env bash
# Push authored content from the LOCAL dev Postgres to the homeserver Postgres.
#
# Why this exists: mutagen mirrors the file tree but NOT the database, so local
# and homeserver each have their own Postgres. This copies the house-independent
# content you author locally (maps, ground tiles, monsters, characters, and the
# props/flowers in tile_objects) up to the homeserver, where the app reads it live.
#
# Intentionally EXCLUDED: companies, houses, boards, content_items. Houses are
# tied to the posture-login service on the homeserver and are managed there with
# their own IDs; boards + content_items are house-bound (they FK to houses), so
# they belong with whatever houses exist on the homeserver, not the local set.
# Only the house-independent asset library is pushed.
#
# `tile_objects.overhang` only exists in the local DB (phantom drift from the
# unmerged #44 branch), so tile_objects is copied with an explicit column list
# that omits it — see memory note "overhang-schema-drift".
#
# A full homeserver backup is always taken first (remote + local copy in backups/).
#
# All SQL is streamed to psql over stdin (never `-c` across SSH) so nothing gets
# re-parsed by the remote shell; psql's default `-A` field separator is `|`.
#
# Usage: scripts/migrate-content-to-homeserver.sh [-y]
#   -y   skip the confirmation prompt (for non-interactive runs)

set -euo pipefail

# --- config (override via env) ------------------------------------------------
SSH_HOST="${SSH_HOST:-homeserver}"
REMOTE_DIR="${REMOTE_DIR:-apps/odt-ville}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-one_rev_village_development}"

# Tables to migrate. All are house-independent and have no FK dependencies on
# each other, so order and cascade don't matter here.
TABLES=(maps ground_tiles monsters character_manifests tile_objects)

# tile_objects minus the local-only `overhang` column.
TILE_OBJECT_COLS="id,active,created_at,door_dx,door_dy,edge_mask,fg_mask,footprint_h,footprint_w,image,kind,name,updated_at,walk_mask"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ASSUME_YES=0
[ "${1:-}" = "-y" ] && ASSUME_YES=1

# --- helpers ------------------------------------------------------------------
# Run psql locally. SQL via stdin or -c; rows piped through unchanged.
local_psql() { docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" "$@"; }

# Run psql on the homeserver. SQL comes from THIS function's stdin (piped into
# psql); only static, quote-free flags are passed as args, so the remote shell
# has nothing fragile to parse.
remote_psql() {
  ssh "$SSH_HOST" "cd $REMOTE_DIR && docker compose exec -T db psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 $*"
}

counts_query() {
  local q="" t
  for t in "${TABLES[@]}"; do
    [ -n "$q" ] && q+=" union all "
    q+="select '$t' as t, count(*) as c from $t"
  done
  echo "$q order by t;"
}

echo "==> Migrating content to $SSH_HOST:$REMOTE_DIR"
echo "    tables:   ${TABLES[*]}"
echo "    excluded: companies, houses, boards, content_items (homeserver-managed)"
echo

# --- confirm ------------------------------------------------------------------
if [ "$ASSUME_YES" -ne 1 ]; then
  echo "This TRUNCATEs and reloads ${TABLES[*]} on the homeserver from local."
  echo "A full backup is taken first."
  read -r -p "Proceed? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

# --- 1. backup ----------------------------------------------------------------
TS="$(date +%Y%m%d-%H%M%S)"
BK="odt-ville-db-backup-${TS}.sql.gz"
echo "==> Backing up homeserver DB -> ~/$BK (remote) + backups/$BK (local)"
ssh "$SSH_HOST" "cd $REMOTE_DIR && docker compose exec -T db pg_dump -U $DB_USER -d $DB_NAME --clean --if-exists | gzip > ~/$BK"
mkdir -p backups
scp -q "$SSH_HOST:~/$BK" "backups/$BK"
gzip -t "backups/$BK" && echo "    backup verified ($(du -h "backups/$BK" | cut -f1))"
echo

# --- 2. truncate --------------------------------------------------------------
TRUNC_LIST="$(IFS=,; echo "${TABLES[*]}")"
echo "==> Truncating on homeserver: $TRUNC_LIST"
echo "TRUNCATE $TRUNC_LIST RESTART IDENTITY CASCADE;" | remote_psql
echo

# --- 3. load (stream each table local -> remote via \copy) --------------------
echo "==> Loading tables"
for t in "${TABLES[@]}"; do
  if [ "$t" = tile_objects ]; then
    cols="$TILE_OBJECT_COLS"
    local_psql -At -c "\copy (select $cols from tile_objects order by id) to stdout" \
      | ssh "$SSH_HOST" "cd $REMOTE_DIR && docker compose exec -T db psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -c \"\\copy tile_objects($cols) from stdin\""
  else
    local_psql -At -c "\copy $t to stdout" \
      | ssh "$SSH_HOST" "cd $REMOTE_DIR && docker compose exec -T db psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -c \"\\copy $t from stdin\""
  fi
  echo "    loaded $t"
done
echo

# --- 4. reset sequences -------------------------------------------------------
echo "==> Resetting id sequences"
SEQ_SQL=""
for t in "${TABLES[@]}"; do
  SEQ_SQL+="SELECT setval(pg_get_serial_sequence('$t','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM $t),1));"
done
echo "$SEQ_SQL" | remote_psql > /dev/null
echo "    done"
echo

# --- 5. verify local vs remote counts ----------------------------------------
echo "==> Verifying row counts (local vs homeserver)"
Q="$(counts_query)"
LOCAL_COUNTS="$(echo "$Q" | local_psql -At)"     # default -A separator is '|'
REMOTE_COUNTS="$(echo "$Q" | remote_psql -At)"
printf "    %-22s %8s %8s   %s\n" table local remote status
mismatch=0
while IFS='|' read -r t lc; do
  [ -z "$t" ] && continue
  rc="$(awk -F'|' -v k="$t" '$1==k{print $2}' <<< "$REMOTE_COUNTS")"
  if [ "$lc" = "$rc" ]; then status="ok"; else status="MISMATCH"; mismatch=1; fi
  printf "    %-22s %8s %8s   %s\n" "$t" "$lc" "$rc" "$status"
done <<< "$LOCAL_COUNTS"
echo
if [ "$mismatch" -ne 0 ]; then
  echo "!! Counts differ — review above. Restore the homeserver with:" >&2
  echo "   gunzip -c backups/$BK | ssh $SSH_HOST 'cd $REMOTE_DIR && docker compose exec -T db psql -U $DB_USER -d $DB_NAME'" >&2
  exit 1
fi
echo "==> Done. Content migrated. Backup: backups/$BK"
