#!/usr/bin/env bash
#
# Schema lint — enforces ADR-0010's database conventions (issue #220).
#
# Parses db/schema.rb and checks two things, and TWO THINGS ONLY:
#
#   1. FK allowlist — every `add_foreign_key` must be on the explicit allowlist
#      of today's nine foreign keys. A new FK fails, pointing at ADR-0010's
#      soft-seam rule (no hard FKs across the game<->org/communities seam).
#      Adding a legitimate FK means deliberately editing `fk_allowlist` below
#      in the same PR.
#
#   2. Table prefixes — every `create_table` must be one of the existing tables
#      or carry a module prefix (org_, catalog_, communities_, maps_, auth_,
#      viewer_, game_session_, character_, posture_).
#
# It inspects create_table and add_foreign_key lines ONLY — never columns — so
# column-level schema drift (e.g. the phantom `tile_objects.overhang` column)
# can never trip it.
#
# Usage: script/schema-lint.sh [path/to/schema.rb]
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
schema="${1:-$script_dir/../db/schema.rb}"

if [[ ! -f "$schema" ]]; then
  echo "schema lint: schema file not found: $schema" >&2
  exit 2
fi

# The fourteen* existing tables predate ADR-0010's prefix rule and are
# grandfathered in (*the module map counts posture as a future table, so the
# tree carries thirteen today). Existing tables are never renamed.
existing_tables=(
  boards character_manifests companies content_items ground_tiles houses
  maps monsters terrains tile_objects user_content_states
  user_location_states users
)

# One prefix per domain module (see the module map in CONTEXT.md / ADR-0010).
prefixes=(
  org_ catalog_ communities_ maps_ auth_ viewer_ game_session_ character_ posture_
)

# Today's nine foreign keys, as "from_table|to_table". Adding a legitimate FK
# means adding its pair here in the same PR — a deliberate act, not a default.
fk_allowlist=(
  "boards|houses"
  "catalog_npcs|character_manifests"
  "content_items|boards"
  "houses|companies"
  "houses|tile_objects"
  "maps_map_memberships|maps"
  "maps_map_memberships|users"
  "user_content_states|content_items"
  "user_content_states|users"
  "user_location_states|companies"
  "user_location_states|users"
  "users|character_manifests"
  "users|companies"
)

errors=()
lineno=0
while IFS= read -r line; do
  lineno=$((lineno + 1))
  # Left-trim leading whitespace so we can anchor on the statement keyword.
  trimmed="${line#"${line%%[![:space:]]*}"}"
  case "$trimmed" in
    create_table\ *)
      name="$(printf '%s\n' "$trimmed" | sed -nE 's/^create_table[[:space:]]+"([^"]+)".*/\1/p')"
      [[ -z "$name" ]] && continue
      ok=0
      for t in "${existing_tables[@]}"; do [[ "$name" == "$t" ]] && ok=1 && break; done
      if [[ $ok -eq 0 ]]; then
        for p in "${prefixes[@]}"; do [[ "$name" == "$p"* ]] && ok=1 && break; done
      fi
      if [[ $ok -eq 0 ]]; then
        errors+=("line $lineno: new table \"$name\" has no module prefix. Per ADR-0010, new tables must carry a module prefix (${prefixes[*]}). Rename the table with its module's prefix — see the module map in CONTEXT.md.")
      fi
      ;;
    add_foreign_key\ *)
      pair="$(printf '%s\n' "$trimmed" | sed -nE 's/^add_foreign_key[[:space:]]+"([^"]+)",[[:space:]]*"([^"]+)".*/\1|\2/p')"
      [[ -z "$pair" ]] && continue
      ok=0
      for f in "${fk_allowlist[@]}"; do [[ "$pair" == "$f" ]] && ok=1 && break; done
      if [[ $ok -eq 0 ]]; then
        from="${pair%%|*}"; to="${pair#*|}"
        errors+=("line $lineno: foreign key \"$from\" -> \"$to\" is not on the ADR-0010 allowlist. Hard FKs across the game<->org/communities seam are forbidden (the seams stay soft). If this FK is legitimate, add \"$from|$to\" to fk_allowlist in this script in the same PR; otherwise drop the FK.")
      fi
      ;;
  esac
done < "$schema"

if [[ ${#errors[@]} -eq 0 ]]; then
  echo "schema lint: OK ($schema)"
  exit 0
fi

echo "schema lint FAILED — ADR-0010 database conventions violated:" >&2
for e in "${errors[@]}"; do echo "  $e" >&2; done
echo "" >&2
echo "See docs/adr/0010-mirrored-domain-modules.md and the module map in CONTEXT.md." >&2
exit 1
