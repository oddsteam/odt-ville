# Premade characters (#396, ADR-0017) — the 20 hand-picked characters that seed
# the /character gallery on day one. Each is a finished character trimmed to one
# packed atlas (premade-NN.png), so `data.sheet.path` + the shared packed layout
# is the whole recipe; no Parts to reverse-engineer.
#
# Split out of the main seed on purpose: db/seeds.rb clears the village first
# (delete_all users/companies/houses/maps) and MUST NOT run in prod, but the
# house-owned roster DOES need to exist in prod. This file is additive and
# idempotent (find_or_initialize by name, never a delete), so prod runs it
# straight after a deploy:
#
#   docker compose exec backend ./bin/rails runner 'load Rails.root.join("db/seeds/premades.rb")'
#
# The packed layout is INLINED, not read from frontend/, because the backend
# container mounts only ./backend and cannot see the pack — a File.read would
# skip silently. Re-trimming the pack (#393) regenerates layout.json; refresh
# this to match. Never activated, so an existing global default stays put.

require "json"

premade_layout = JSON.parse(<<~JSON)
  {"version":1,"name":"modern-interiors","grid":{"frameWidth":32,"frameHeight":64},
   "render":{"originX":0.5,"originY":1,"scale":1},"frameRate":9,"atlas":{"width":256,"height":384},
   "postures":{
    "idleDown":[{"x":0,"y":0,"w":32,"h":64},{"x":32,"y":0,"w":32,"h":64},{"x":64,"y":0,"w":32,"h":64},{"x":96,"y":0,"w":32,"h":64},{"x":128,"y":0,"w":32,"h":64},{"x":160,"y":0,"w":32,"h":64}],
    "walkDown":[{"x":192,"y":0,"w":32,"h":64},{"x":224,"y":0,"w":32,"h":64},{"x":0,"y":64,"w":32,"h":64},{"x":32,"y":64,"w":32,"h":64},{"x":64,"y":64,"w":32,"h":64},{"x":96,"y":64,"w":32,"h":64}],
    "idleUp":[{"x":128,"y":64,"w":32,"h":64},{"x":160,"y":64,"w":32,"h":64},{"x":192,"y":64,"w":32,"h":64},{"x":224,"y":64,"w":32,"h":64},{"x":0,"y":128,"w":32,"h":64},{"x":32,"y":128,"w":32,"h":64}],
    "walkUp":[{"x":64,"y":128,"w":32,"h":64},{"x":96,"y":128,"w":32,"h":64},{"x":128,"y":128,"w":32,"h":64},{"x":160,"y":128,"w":32,"h":64},{"x":192,"y":128,"w":32,"h":64},{"x":224,"y":128,"w":32,"h":64}],
    "idleLeft":[{"x":0,"y":192,"w":32,"h":64},{"x":32,"y":192,"w":32,"h":64},{"x":64,"y":192,"w":32,"h":64},{"x":96,"y":192,"w":32,"h":64},{"x":128,"y":192,"w":32,"h":64},{"x":160,"y":192,"w":32,"h":64}],
    "walkLeft":[{"x":192,"y":192,"w":32,"h":64},{"x":224,"y":192,"w":32,"h":64},{"x":0,"y":256,"w":32,"h":64},{"x":32,"y":256,"w":32,"h":64},{"x":64,"y":256,"w":32,"h":64},{"x":96,"y":256,"w":32,"h":64}],
    "idleRight":[{"x":128,"y":256,"w":32,"h":64},{"x":160,"y":256,"w":32,"h":64},{"x":192,"y":256,"w":32,"h":64},{"x":224,"y":256,"w":32,"h":64},{"x":0,"y":320,"w":32,"h":64},{"x":32,"y":320,"w":32,"h":64}],
    "walkRight":[{"x":64,"y":320,"w":32,"h":64},{"x":96,"y":320,"w":32,"h":64},{"x":128,"y":320,"w":32,"h":64},{"x":160,"y":320,"w":32,"h":64},{"x":192,"y":320,"w":32,"h":64},{"x":224,"y":320,"w":32,"h":64}]
   }}
JSON

(1..20).each do |n|
  slug = format("premade-%02d", n)
  manifest = ::Character::CharacterManifest.find_or_initialize_by(name: slug)
  manifest.update!(owner: nil, data: {
    "version" => 1,
    "name" => slug,
    "sheet" => { "path" => "/maps/characters/packs/modern-interiors/#{slug}.png", "width" => 256, "height" => 384 },
    "layout" => premade_layout,
  })
end

puts "Seeded premades: #{::Character::CharacterManifest.where("name like 'premade-%'").count} house-owned characters."
