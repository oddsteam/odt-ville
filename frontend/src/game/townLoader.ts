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
      groundTiles: Effect.orElseSucceed(GroundTilesService.list(), () => []),
      // loadActiveManifest owns its own fallback chain and never throws; mirror
      // today's `.catch(() => null)` for parity.
      characterManifest: Effect.promise(() => loadActiveManifest().catch(() => null)),
    },
    { concurrency: 'unbounded' },
  )
