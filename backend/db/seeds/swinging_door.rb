# Hand-seed one proximity-playback tile object (#438, ADR-0019) so the swinging
# door can be walked up to before the mapper can author `playback` (A2). It is
# the same Catalog::TileObject the spell book is — only `playback` differs, and
# that one field is the whole difference between an ambient loop and a door.
#
#   bin/rails runner db/seeds/swinging_door.rb [path/to/strip.png]
#
# The strip ships with the pack, outside the repo:
#   map-assets/moderninteriors-win/3_Animated_objects/32x32/spritesheets/
#     animated_door_1_32x32.png   (160×64 — 5 frames of 1×2 tiles, 0 shut → 4 open)
#
# The door is decorative: its cell stays walkable at every frame, exactly like
# any other prop's. A door that can *refuse* is a separate stateful kind.

path = ARGV[0] || Rails.root.join("../map-assets/moderninteriors-win/3_Animated_objects/32x32/spritesheets/animated_door_1_32x32.png").to_s
abort "no frame strip at #{path} — pass the pack's spritesheets/ PNG as an argument" unless File.exist?(path)

obj = ::Catalog::TileObject.find_or_initialize_by(name: "Swinging Door (animated)")
obj.update!(
  kind: ENV.fetch("KIND", "prop"),
  image: "data:image/png;base64,#{Base64.strict_encode64(File.binread(path))}",
  footprint_w: 1,
  footprint_h: 2,
  frame_count: ENV.fetch("FRAMES", 5).to_i,
  fps: ENV.fetch("FPS", 10).to_i,
  playback: "proximity"
)
puts "seeded ##{obj.id} #{obj.name} (#{obj.kind}): #{obj.frame_count} frames @ #{obj.fps}fps, proximity"
