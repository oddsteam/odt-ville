# Interior walkability is authored and validated at save, not auto-derived at runtime

Issue #30 lets a building render at its authored footprint instead of a fixed
3×4, which lifts the door off the guaranteed-reachable bottom-centre cell: an
author can now place a door higher up or in the interior, where the surrounding
footprint walls it off and the avatar can never reach it. Resolving "what makes
a door reachable" surfaced a larger decision about *who* owns interior
walkability.

## Decision

- **A building's interior walkability is authored data, not engine inference.**
  Each building tile-object carries a tile-aligned **walk mask** (#32) — which
  footprint cells the avatar may stand on (porch / path to the door); every
  other cell stays solid. The art is tile-aligned, so the admin paints the path
  directly over it.
- **Reachability is guaranteed at save time, not patched at runtime.** The admin
  tool rejects a save unless a door *and* at least one walkable tile are defined
  *and* the door connects to the footprint edge via walkable cells. Building data
  is therefore provably enterable before it ever reaches the game.
- **`town.ts` stays pure and trusting.** `buildTown` stamps the mask at each
  plot origin and `isWalkable` reads it; the generator does no pathfinding or
  geometry repair — it renders valid data, it doesn't fix invalid data.

## Considered options

1. **Auto-carve an approach** — `buildTown` clears footprint cells between an
   unreachable door and the nearest edge. Rejected: punches holes in the
   building art and bakes pathfinding into the pure generator.
2. **Snap-to-default at runtime** — silently move an unreachable door to
   bottom-centre. Kept only as #30's *temporary* safety net so the town is never
   unplayable; rejected as the end state because it discards the author's intent
   without telling them.
3. **Author-time walk mask + validation** (chosen) — correctness is established
   where the data is created, the generator stays a dumb renderer, and the admin
   gets immediate feedback instead of a silently-relocated door.

## Consequences

- The walk mask spans the stack: a `walk_mask` DB column, controller permit +
  serializer, the `schema.ts` decoders, the `TileMapper` authoring UI, and
  `isWalkable`/`buildTown`. That cost is accepted in exchange for an
  always-walkable guarantee. This is #32's scope.
- #30 ships first with the runtime snap-to-default; #32 **replaces** that snap
  with the author-time guarantee once it lands.
- The generator never repairs data, so a future invariant can assert "every
  building's door is mask-reachable" as a pure unit test rather than an
  integration check.
