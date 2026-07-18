#!/usr/bin/env bash
#
# Test for script/structure-lint.sh (issue #221). Pure shell — the lint takes
# an app-root path argument so we can drive it against synthetic fixture trees
# without a database or Rails boot. Run: backend/test/scripts/structure_lint_test.sh
#
# The check enforces ADR-0010's structure ratchet: no `.rb` file may land flat
# (outside a domain subdirectory) in app/models, app/controllers/api/v1, or
# app/serializers, except the framework base classes.
set -uo pipefail

test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lint="$test_dir/../../script/structure-lint.sh"
real_app="$test_dir/../../app"

fail=0
check() { # description  expected_exit  actual_exit
  if [[ "$2" == "$3" ]]; then
    echo "ok   - $1"
  else
    echo "FAIL - $1 (expected exit $2, got $3)"
    fail=1
  fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# 1. The real, fully-namespaced tree passes.
bash "$lint" "$real_app" >/dev/null 2>&1
check "current app tree passes" 0 $?

# 2. A flat model file (no matching domain subdirectory) fails.
mk_app() { # builds a fresh fixture app root, echoes its path
  local root; root="$(mktemp -d "$tmp/app.XXXXXX")"
  mkdir -p "$root/models" "$root/controllers/api/v1" "$root/serializers"
  # framework base classes are always present in a real tree
  : > "$root/models/application_record.rb"
  : > "$root/controllers/api/v1/base_controller.rb"
  : > "$root/serializers/serialization.rb"
  echo "$root"
}

root="$(mk_app)"
: > "$root/models/user.rb"
bash "$lint" "$root" >/dev/null 2>&1
check "flat model file fails" 1 $?

# 3. A namespace declaration file (flat .rb WITH a sibling domain dir) passes.
root="$(mk_app)"
mkdir -p "$root/models/auth"
: > "$root/models/auth.rb"
: > "$root/models/auth/user.rb"
bash "$lint" "$root" >/dev/null 2>&1
check "namespace declaration file with matching dir passes" 0 $?

# 4. A flat controller file (no matching domain subdirectory) fails.
root="$(mk_app)"
: > "$root/controllers/api/v1/widgets_controller.rb"
bash "$lint" "$root" >/dev/null 2>&1
check "flat controller file fails" 1 $?

# 5. A flat serializer file (no matching domain subdirectory) fails.
root="$(mk_app)"
: > "$root/serializers/widget_serializer.rb"
bash "$lint" "$root" >/dev/null 2>&1
check "flat serializer file fails" 1 $?

# 6. A file nested inside a domain subdirectory passes.
root="$(mk_app)"
mkdir -p "$root/models/catalog"
: > "$root/models/catalog/terrain.rb"
bash "$lint" "$root" >/dev/null 2>&1
check "file inside a domain subdirectory passes" 0 $?

# 7. The bare framework base tree (only allowlisted flat files) passes.
root="$(mk_app)"
bash "$lint" "$root" >/dev/null 2>&1
check "framework base classes alone pass" 0 $?

exit $fail
