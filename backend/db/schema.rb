# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_07_18_000001) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "boards", force: :cascade do |t|
    t.string "board_type", null: false
    t.datetime "created_at", null: false
    t.bigint "house_id", null: false
    t.datetime "updated_at", null: false
    t.index ["house_id", "board_type"], name: "index_boards_on_house_id_and_board_type", unique: true
    t.index ["house_id"], name: "index_boards_on_house_id"
  end

  create_table "character_manifests", force: :cascade do |t|
    t.boolean "active", default: false, null: false
    t.datetime "created_at", null: false
    t.jsonb "data", default: {}, null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["active"], name: "index_character_manifests_single_active", unique: true, where: "active"
    t.index ["name"], name: "index_character_manifests_on_name", unique: true
  end

  create_table "companies", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
  end

  create_table "content_items", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.bigint "board_id", null: false
    t.text "body", default: "", null: false
    t.datetime "created_at", null: false
    t.datetime "effective_from"
    t.datetime "expires_at"
    t.string "priority", default: "normal", null: false
    t.boolean "requires_ack", default: false, null: false
    t.string "summary", default: "", null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["board_id"], name: "index_content_items_on_board_id"
  end

  create_table "ground_tiles", force: :cascade do |t|
    t.integer "cell", default: 32, null: false
    t.integer "col", null: false
    t.datetime "created_at", null: false
    t.string "label", default: "", null: false
    t.string "role", default: "fill", null: false
    t.integer "row", null: false
    t.string "side"
    t.string "tile_type", null: false
    t.string "tileset", null: false
    t.datetime "updated_at", null: false
    t.index ["tile_type"], name: "index_ground_tiles_on_tile_type"
    t.index ["tileset", "col", "row"], name: "index_ground_tiles_on_cell", unique: true
  end

  create_table "houses", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.string "category_key", null: false
    t.string "color", default: "#888888", null: false
    t.bigint "company_id", null: false
    t.datetime "created_at", null: false
    t.string "entry_gate"
    t.string "logo_url", default: "", null: false
    t.integer "position_order", default: 0, null: false
    t.string "posture_set_id"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["company_id", "position_order"], name: "index_houses_on_company_id_and_position_order"
    t.index ["company_id"], name: "index_houses_on_company_id"
  end

  create_table "maps", force: :cascade do |t|
    t.jsonb "baked", default: {}, null: false
    t.integer "cols", null: false
    t.datetime "created_at", null: false
    t.integer "rows", null: false
    t.string "slug", null: false
    t.jsonb "source", default: {}, null: false
    t.string "title", default: "", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_maps_on_slug", unique: true
  end

  create_table "monsters", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.boolean "enabled", default: true, null: false
    t.text "encounter_dialog"
    t.integer "encounter_rate", default: 0, null: false
    t.text "image", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_monsters_on_name", unique: true
  end

  create_table "terrains", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.integer "priority", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_terrains_on_name", unique: true
    t.index ["priority"], name: "index_terrains_on_priority"
  end

  create_table "tile_objects", force: :cascade do |t|
    t.boolean "active", default: false, null: false
    t.datetime "created_at", null: false
    t.integer "door_dx"
    t.integer "door_dy"
    t.text "edge_mask"
    t.text "fg_mask"
    t.float "footprint_h", default: 1.0, null: false
    t.float "footprint_w", default: 1.0, null: false
    t.text "image", null: false
    t.string "kind", default: "prop", null: false
    t.string "name", null: false
    t.integer "overhang", default: 0, null: false
    t.datetime "updated_at", null: false
    t.text "walk_mask"
    t.index ["kind"], name: "index_tile_objects_one_active_per_kind", unique: true, where: "active"
    t.index ["name"], name: "index_tile_objects_on_name", unique: true
  end

  create_table "user_content_states", force: :cascade do |t|
    t.datetime "acknowledged_at"
    t.bigint "content_item_id", null: false
    t.datetime "created_at", null: false
    t.datetime "opened_at"
    t.string "state", default: "unread", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["content_item_id"], name: "index_user_content_states_on_content_item_id"
    t.index ["user_id", "content_item_id"], name: "index_user_content_states_on_user_id_and_content_item_id", unique: true
    t.index ["user_id"], name: "index_user_content_states_on_user_id"
  end

  create_table "user_location_states", force: :cascade do |t|
    t.bigint "company_id", null: false
    t.datetime "created_at", null: false
    t.string "last_area", default: "town", null: false
    t.bigint "last_house_id"
    t.string "last_room"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["company_id"], name: "index_user_location_states_on_company_id"
    t.index ["user_id"], name: "index_user_location_states_on_user_id", unique: true
  end

  create_table "users", force: :cascade do |t|
    t.bigint "character_manifest_id"
    t.bigint "company_id", null: false
    t.datetime "created_at", null: false
    t.string "email"
    t.string "external_id"
    t.string "name", null: false
    t.string "role", default: "employee", null: false
    t.datetime "updated_at", null: false
    t.index ["character_manifest_id"], name: "index_users_on_character_manifest_id"
    t.index ["company_id"], name: "index_users_on_company_id"
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["external_id"], name: "index_users_on_external_id", unique: true
  end

  add_foreign_key "boards", "houses"
  add_foreign_key "content_items", "boards"
  add_foreign_key "houses", "companies"
  add_foreign_key "user_content_states", "content_items"
  add_foreign_key "user_content_states", "users"
  add_foreign_key "user_location_states", "companies"
  add_foreign_key "user_location_states", "users"
  add_foreign_key "users", "character_manifests", on_delete: :nullify
  add_foreign_key "users", "companies"
end
