#!/usr/bin/env bash
#
# Test for script/schema-lint.sh (issue #220). Pure shell — the lint takes a
# schema path argument so we can drive it against synthetic fixtures without a
# database or Rails boot. Run: backend/test/scripts/schema_lint_test.sh
set -uo pipefail

test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lint="$test_dir/../../script/schema-lint.sh"
real_schema="$test_dir/../../db/schema.rb"

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

# 1. The real, fully-namespaced schema passes.
bash "$lint" "$real_schema" >/dev/null 2>&1
check "current db/schema.rb passes" 0 $?

# 2. An unlisted add_foreign_key line fails.
cat > "$tmp/bad_fk.rb" <<'RB'
ActiveRecord::Schema[8.1].define(version: 1) do
  create_table "boards", force: :cascade do |t|
    t.bigint "house_id"
  end
  add_foreign_key "boards", "houses"
  add_foreign_key "content_items", "users"
end
RB
bash "$lint" "$tmp/bad_fk.rb" >/dev/null 2>&1
check "unlisted add_foreign_key fails" 1 $?

# 3. An unprefixed new create_table line fails.
cat > "$tmp/bad_table.rb" <<'RB'
ActiveRecord::Schema[8.1].define(version: 1) do
  create_table "widgets", force: :cascade do |t|
    t.string "name"
  end
end
RB
bash "$lint" "$tmp/bad_table.rb" >/dev/null 2>&1
check "unprefixed new create_table fails" 1 $?

# 4. A new create_table WITH a module prefix passes.
cat > "$tmp/good_table.rb" <<'RB'
ActiveRecord::Schema[8.1].define(version: 1) do
  create_table "org_employees", force: :cascade do |t|
    t.string "name"
  end
  create_table "communities_reactions", force: :cascade do |t|
    t.string "kind"
  end
end
RB
bash "$lint" "$tmp/good_table.rb" >/dev/null 2>&1
check "prefixed new create_table passes" 0 $?

# 5. Immune to column-level drift: a phantom column that would look like a bad
#    table/FK name if we linted columns must NOT trip the check.
cat > "$tmp/column_drift.rb" <<'RB'
ActiveRecord::Schema[8.1].define(version: 1) do
  create_table "tile_objects", force: :cascade do |t|
    t.boolean "overhang"
    t.string "widgets"
    t.bigint "houses_id"
  end
  add_foreign_key "boards", "houses"
end
RB
bash "$lint" "$tmp/column_drift.rb" >/dev/null 2>&1
check "column-level drift does not trip the lint" 0 $?

exit $fail
