# JSON payload for a baked map the runtime blits. Identity (slug/title/size)
# sits alongside the baked artifact's own keys (tilesets, tiles, entities), so
# the game receives one self-describing document and never has to branch on
# which producer made it (ADR-0004). The editable `source` is intentionally not
# exposed on the play endpoint — only the editor reads source.
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
      entities: baked[:entities] || []
    }
    # Painted maps carry autotiled `ground` (layer stacks) the runtime blits
    # instead of flat tiles; flat/seed maps omit it entirely (ADR-0003/0004).
    payload[:ground] = ground if ground
    payload
  end
end
