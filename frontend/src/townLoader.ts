// Town-scene data loader. Composes the typed resource services with
// `Effect.all` (unbounded, like the Promise.all it replaces) and makes the
// best-effort fallbacks explicit: optional resources (tile object, ground
// tiles, character) fall back to null/[]/null so the town still renders;
// required resources (communities, session, feed) surface their error.

import * as Effect from 'effect/Effect'

import { CommunitiesService } from './communities/service.ts'
import { GameSessionService } from './game-session/service.ts'
import { TileObjectsService } from './tileObjects/service.ts'
import { GroundTilesService } from './groundTiles/service.ts'
import { MonstersService } from './monsters/service.ts'
import { loadActiveManifest } from './character/manifest.js'

// The Hometown Policy resolution point (CONTEXT.md 2026-07-07, #173): the one
// place the generated producer's authored inputs — the active object per
// foliage kind — are resolved. Today's only adapter is the global admin config
// (the active-object toggles); a per-user/per-cohort policy would be a second
// adapter behind this same seam. Each role is best-effort: a missing/erroring
// endpoint resolves to null and that kind simply places nothing. The group
// falls back to the legacy 'prop' kind (#26) so existing flower art keeps
// rendering. `building` stays bespoke until the House slice (#90).
export const resolveHometownPolicy = () =>
  Effect.all(
    {
      tree: Effect.orElseSucceed(TileObjectsService.getActive('tree'), () => null),
      flowerGroup: Effect.orElseSucceed(
        TileObjectsService.getActive('flower-group').pipe(
          Effect.flatMap((g) => (g ? Effect.succeed(g) : TileObjectsService.getActive('prop'))),
        ),
        () => null,
      ),
      flowerSingle: Effect.orElseSucceed(TileObjectsService.getActive('flower-single'), () => null),
    },
    { concurrency: 'unbounded' },
  )

export const loadTown = () =>
  Effect.all(
    {
      communities: CommunitiesService.list(),
      session: GameSessionService.get(),
      feed: CommunitiesService.getFeed(),
      // The hometown's generation inputs, resolved once (#173).
      policy: resolveHometownPolicy(),
      // Admin-mapped house (#29): replaces the bundled roof/body art on every
      // plot and supplies the door anchor. Absent → bundled buildings.
      building: Effect.orElseSucceed(TileObjectsService.getActive('building'), () => null),
      groundTiles: Effect.orElseSucceed(GroundTilesService.list(), () => []),
      // Authored wild-encounter pool (#69). Best-effort: a missing/erroring
      // endpoint falls back to [] and TownScene rolls the built-in table, so
      // the grass is never dead.
      monsterPool: Effect.orElseSucceed(MonstersService.pool(), () => []),
      // loadActiveManifest owns its own fallback chain and never throws; mirror
      // today's `.catch(() => null)` for parity.
      characterManifest: Effect.promise(() => loadActiveManifest().catch(() => null)),
    },
    { concurrency: 'unbounded' },
  )
