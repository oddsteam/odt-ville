// Town-scene data loader. Composes the typed resource services with
// `Effect.all` (unbounded, like the Promise.all it replaces) and makes the
// best-effort fallbacks explicit: optional resources (tile object, ground
// tiles, character) fall back to null/[]/null so the town still renders;
// required resources (communities, session, feed) surface their error.

import * as Effect from 'effect/Effect'

import { CommunitiesService } from '../communities/service.ts'
import { GameSessionService } from '../game-session/service.ts'
import { TileObjectsService } from '../tileObjects/service.ts'
import { GroundTilesService } from '../groundTiles/service.ts'
import { loadActiveManifest } from '../character/manifest.js'

export const loadTown = () =>
  Effect.all(
    {
      communities: CommunitiesService.list(),
      session: GameSessionService.get(),
      feed: CommunitiesService.getFeed(),
      // Optional visual enhancements: swallow any failure to a fallback so a
      // missing/erroring endpoint never breaks the town load.
      treeObject: Effect.orElseSucceed(TileObjectsService.getActive('tree'), () => null),
      // Flower art for the '*' scatter (#27). The multi-tile group is tiled
      // across contiguous '*' clusters; the single is the per-cell fallback for
      // leftover/lone cells. The group falls back to the legacy 'prop' kind
      // (#26) so existing flower art keeps rendering. Both best-effort: none →
      // procedural buds, town still renders.
      flowerGroup: Effect.orElseSucceed(
        TileObjectsService.getActive('flower-group').pipe(
          Effect.flatMap((g) => (g ? Effect.succeed(g) : TileObjectsService.getActive('prop'))),
        ),
        () => null,
      ),
      flowerSingle: Effect.orElseSucceed(TileObjectsService.getActive('flower-single'), () => null),
      // Admin-mapped house (#29): replaces the bundled roof/body art on every
      // plot and supplies the door anchor. Absent → bundled buildings.
      building: Effect.orElseSucceed(TileObjectsService.getActive('building'), () => null),
      groundTiles: Effect.orElseSucceed(GroundTilesService.list(), () => []),
      // loadActiveManifest owns its own fallback chain and never throws; mirror
      // today's `.catch(() => null)` for parity.
      characterManifest: Effect.promise(() => loadActiveManifest().catch(() => null)),
    },
    { concurrency: 'unbounded' },
  )
