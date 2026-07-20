# JSON payload for a baked map the runtime blits. Identity (slug/title/size)
# sits alongside the baked artifact's own keys (tilesets, tiles, entities), so
# the game receives one self-describing document and never has to branch on
# which producer made it (ADR-0004). The editable `source` is intentionally not
# exposed on the play endpoint — only the editor reads source.
module Maps
  module MapSerializer
    module_function

    def call(map)
      baked = map.baked.is_a?(Hash) ? map.baked.deep_symbolize_keys : {}
      ground = baked[:ground]
      payload = {
        slug: map.slug,
        title: map.title,
        cols: map.cols,
        rows: map.rows,
        # A painted map (#106/#107) has no flat `tiles`; its sheets live on the
        # ground, so lift them to the top-level list the runtime preloads.
        tilesets: baked[:tilesets] || ground&.dig(:tilesets) || [],
        tiles: baked[:tiles] || [],
        entities: baked[:entities] || [],
        # Presence multiplayer (#88): the runtime opens a presence channel off
        # this Node property (ADR-0005); solo maps never connect.
        multiplayer: map.multiplayer,
        # The other Node property (#91): who may list/load the map. The runtime
        # ignores it (the gate is server-side, #83); the editor reads it to
        # prefill the settings panel. Raw column read — the model getter wraps
        # it in the AccessPolicy value object.
        access_policy: map.read_attribute(:access_policy)
      }
      # Painted maps carry autotiled `ground` (layer stacks) the runtime blits
      # instead of flat tiles; flat/seed maps omit it entirely (ADR-0003/0004).
      payload[:ground] = ground if ground
      # The collision mask (#131): a per-cell blocked grid painted in the editor.
      # It only vetoes walkability (not a Placed Entity), so the runtime reads it
      # straight off the baked document. Absent on maps with nothing masked.
      payload[:collision] = baked[:collision] if baked[:collision]
      # Terrain producer (`painted`/`tiled`, ADR-0007). The runtime ignores it; the
      # editor reads it to lock the paint tools for an imported map.
      payload[:producer] = baked[:producer] if baked[:producer]
      # Interactive zones (#85, ADR-0005): trigger + payload regions the runtime's
      # detector fires through the one onZone channel. Absent when none authored.
      payload[:zones] = baked[:zones] if baked[:zones]
      # Named entry spawns (#84): where a portal's entrySpawnId lands the avatar
      # on this map. Absent when none authored (runtime falls back to centre).
      payload[:spawns] = baked[:spawns] if baked[:spawns]
      payload
    end
  end
end
