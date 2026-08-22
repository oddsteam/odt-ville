#!/usr/bin/env bash
#
# Structure lint — enforces ADR-0010's mirrored-domain-module layout on the
# backend (issue #221). The backend's equivalent of the frontend `pnpm arch`
# ratchet: it fails when any `.rb` file lands flat — outside a domain
# subdirectory — in one of the namespaced layers:
#
#   app/models  app/controllers/api/v1  app/serializers
#   app/services  app/channels  app/clients
#
# The channels/services/clients layers were added by #525: the flat,
# un-namespaced PresenceChannel (presence/cards/standees god-channel) was
# invisible to CI until then. ActionCable keeps its base classes under
# app/channels/application_cable/ — a subdirectory, so they are never flat and
# so never flagged by the depth-1 rule below.
#
# Because the namespacing move (#217, #218, #219) is total there is no
# baseline to manage: a flat file is a failure, forever. New code conforms;
# the check keeps the structure self-maintaining.
#
# TWO exemptions, and two only:
#
#   1. Framework base classes — the handful of files Rails keeps at the layer
#      root by convention (see `allowlist` below). This is the whole allowlist.
#
#   2. Namespace declaration files — a flat `foo.rb` that declares `module Foo`
#      (the `def self.table_name_prefix` shims, e.g. `app/models/auth.rb`) is
#      legal *because it names a domain*: it is exempt only when a sibling
#      `foo/` domain subdirectory exists. A flat file with no matching domain
#      dir (e.g. a stray `user.rb`) is a violation.
#
# Usage: script/structure-lint.sh [path/to/app]
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app="${1:-$script_dir/../app}"

if [[ ! -d "$app" ]]; then
  echo "structure lint: app directory not found: $app" >&2
  exit 2
fi

# The framework base classes Rails keeps at the layer root. This is the entire
# allowlist — every other flat file must earn its place via a domain dir.
allowlist=(
  application_record.rb
  application_controller.rb
  base_controller.rb
  serialization.rb
)

# The layers that ADR-0010 namespaces by domain.
layers=(
  models
  controllers/api/v1
  serializers
  services
  channels
  clients
)

is_allowlisted() {
  local base="$1"
  for a in "${allowlist[@]}"; do [[ "$base" == "$a" ]] && return 0; done
  return 1
}

errors=()
for layer in "${layers[@]}"; do
  dir="$app/$layer"
  [[ -d "$dir" ]] || continue
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    base="$(basename "$file")"
    is_allowlisted "$base" && continue
    # Namespace declaration file: exempt iff a sibling domain dir exists.
    [[ -d "$dir/${base%.rb}" ]] && continue
    errors+=("app/$layer/$base: flat file outside a domain namespace. Per ADR-0010, ${layer} files live under a domain subdirectory (Catalog::, Maps::, …); move it into its module's folder — see the module map in CONTEXT.md.")
  done < <(find "$dir" -maxdepth 1 -type f -name "*.rb" | sort)
done

if [[ ${#errors[@]} -eq 0 ]]; then
  echo "structure lint: OK ($app)"
  exit 0
fi

echo "structure lint FAILED — ADR-0010 module structure violated:" >&2
for e in "${errors[@]}"; do echo "  $e" >&2; done
echo "" >&2
echo "See docs/adr/0010-mirrored-domain-modules.md and the module map in CONTEXT.md." >&2
exit 1
