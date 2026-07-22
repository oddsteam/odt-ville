// Town-scene data loader. Composes the typed resource services with
// `Effect.all` (unbounded, like the Promise.all it replaces) and makes the
// best-effort fallbacks explicit: optional resources (tile object, ground
// tiles, character) fall back to null/[]/null so the town still renders;
// required resources (communities, session, feed) surface their error.

import * as Effect from 'effect/Effect'

import { NetworkError, RequestError } from './lib/http.ts'
import { CommunitiesService } from './communities/service.ts'
import { GameSessionService } from './game-session/service.ts'
import { TileObjectsService } from './catalog/tileObjects/service.ts'
import { GroundTilesService } from './catalog/groundTiles/service.ts'
import { NpcsService } from './catalog/npcs/service.ts'
import { loadMyManifest } from './character/service.ts'
import { GATE_TRAINER } from './game/encounters.js'

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

// User-facing copy for a failed town load (issue #226). Auth failures are an
// access problem (in dev: no DEV user picked yet; in prod: not authorized),
// 5xx/network failures mean the backend is down or warming up; anything else
// keeps its own message.
const UNAVAILABLE = 'THE VILLAGE IS TEMPORARILY UNAVAILABLE — TRY AGAIN IN A MOMENT'

export const townErrorMessage = (e: unknown): string => {
  if (e instanceof RequestError) {
    if (e.status === 401 || e.status === 403) return "YOU DON'T HAVE ACCESS TO ENTER THE VILLAGE"
    if (e.status >= 500) return UNAVAILABLE
  }
  if (e instanceof NetworkError) return UNAVAILABLE
  if (e instanceof Error && e.message) return e.message
  return 'CAN’T REACH THE VILLAGE'
}

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
      // The NPC catalog (#259) for trainer-Zone duels. Best-effort: a
      // missing/erroring endpoint falls back to [] and a trainer zone simply
      // challenges nobody (the hometown gate keeps its bundled fallback).
      npcs: Effect.orElseSucceed(NpcsService.list(), () => []),
      // The current user's character (#155): pick -> global active -> default.
      // loadMyManifest owns its own fallback chain and never throws; mirror
      // today's `.catch(() => null)` for parity.
      characterManifest: Effect.promise(() => loadMyManifest().catch(() => null)),
    },
    { concurrency: 'unbounded' },
  ).pipe(
    // Complete the policy with the producer's encounter inputs (#255): the
    // wild pool the field zone names ('' — the global pool — until a
    // generation-settings admin names one) and the gate trainer's Catalog::Npc
    // row, matched by the bundled boss's name. #260 dropped the seed that used
    // to supply that row, so this normally finds nothing now and the gate falls
    // back to the shell's bundled boss — until an admin authors an NPC under
    // the same name in /admin/npcs, which adopts it.
    Effect.map((town) => ({
      ...town,
      policy: {
        ...town.policy,
        wildPool: '',
        gateNpcId: town.npcs.find((n) => n.name === GATE_TRAINER.name)?.id ?? 0,
      },
    })),
  )
