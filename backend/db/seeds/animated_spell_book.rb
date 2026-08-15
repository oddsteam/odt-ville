# Hand-seed one animated tile object (#435, ADR-0019) so the frame-strip pipe
# can be proven before the mapper can author one (A2). An animated object is a
# plain Catalog::TileObject whose `image` is the art pack's horizontal strip and
# whose `frame_count` is > 1 — no new kind, no new table.
#
#   bin/rails runner db/seeds/animated_spell_book.rb [path/to/strip.png]
#
# The strip ships with the pack, outside the repo:
#   map-assets/moderninteriors-win/3_Animated_objects/32x32/spritesheets/
#     animated_spell_book_32x32.png   (2304×64 — 72 frames of 1×2 tiles)
# Use the spritesheets/ PNG, never the .gif: nothing in the stack decodes one.
#
# Frame size is derived from the image at load time (imageWidth / frame_count ×
# imageHeight), so the only number to get right here is frame_count = strip
# width ÷ one frame's width. FRAMES/FPS/KIND override the spell book's.

path = ARGV[0] || Rails.root.join("../map-assets/moderninteriors-win/3_Animated_objects/32x32/spritesheets/animated_spell_book_32x32.png").to_s
abort "no frame strip at #{path} — pass the pack's spritesheets/ PNG as an argument" unless File.exist?(path)

obj = ::Catalog::TileObject.find_or_initialize_by(name: "Spell Book (animated)")
obj.update!(
  kind: ENV.fetch("KIND", "prop"),
  image: "data:image/png;base64,#{Base64.strict_encode64(File.binread(path))}",
  footprint_w: 1,
  footprint_h: 2,
  frame_count: ENV.fetch("FRAMES", 72).to_i,
  fps: ENV.fetch("FPS", 12).to_i,
  playback: "loop"
)
# Left inactive: the decorate palette lists every saved object, so an authored
# map can place it without taking over a kind the hometown renders. Pass
# KIND=tree and activate it by hand to check the generated-town path.
puts "seeded ##{obj.id} #{obj.name} (#{obj.kind}): #{obj.frame_count} frames @ #{obj.fps}fps"
