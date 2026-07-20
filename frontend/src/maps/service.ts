// Effect-based map resource service. `get(slug)` loads a baked authored map
// (GET /maps/:slug) and decodes it to the runtime BakedMap shape. No React, no
// DOM — callers `runEdge(...)` it at the React boundary. The runtime renders
// whatever this returns without branching on which map it is (ADR-0004).

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { BakedMap } from '../kernel/schema.ts'
import type { BakedEntity, BakedGround, MapAccessPolicy, Zone } from '../kernel/schema.ts'
import { bakeSourceMap } from '../kernel/baker.ts'
import type { SourceMap } from '../kernel/baker.ts'
import { propEntities } from './props.ts'
import type { PlacedProp, MaskOf, DoorOf } from './props.ts'
import type { TileCatalog } from '../kernel/tileCatalog.ts'

const decodeOne = Schema.decodeUnknown(BakedMap)

// Identity-only row for the admin map picker (GET /maps) — no baked/source.
export const MapSummary = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  cols: Schema.Number,
  rows: Schema.Number,
})
export type MapSummary = Schema.Schema.Type<typeof MapSummary>
const decodeList = Schema.decodeUnknown(Schema.Array(MapSummary))

function decode<A>(path: string, decoder: (u: unknown) => Effect.Effect<A, unknown>) {
  return (raw: unknown) =>
    Effect.mapError(
      decoder(raw),
      (e) =>
        new DecodeError({
          path,
          reason: e instanceof Error ? e.message : String(e),
        }),
    )
}

// GET /maps/:slug -> the baked map for play.
export const get = (slug: string): Effect.Effect<BakedMap, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/maps/${encodeURIComponent(slug)}`
    const raw = yield* http.get(path)
    return yield* decode(path, decodeOne)(raw)
  })

// Bake the painted source once (ADR-0003 save path) and assemble the POST body:
// the Rails columns (slug/title/cols/rows) plus the editable source and its
// baked artifact. The editor calls this, then posts the result via `create`.
export function mapCreateBody(source: SourceMap, catalog: TileCatalog) {
  const { baked } = bakeSourceMap(source, catalog)
  return { slug: source.slug, title: source.title, cols: source.cols, rows: source.rows, source, baked }
}

// Assemble the POST body for a Tiled-imported map (ADR-0007). `source` is the raw
// Tiled JSON (the map stays re-editable in Tiled); `baked` carries the imported
// ground plus `producer: 'tiled'` so the play endpoint and editor both know the
// terrain came from Tiled. No client-side baking — the import already resolved it.
export function tiledMapCreateBody(
  identity: { slug: string; title: string },
  tiledSource: unknown,
  ground: BakedGround,
  collision?: ReadonlyArray<ReadonlyArray<boolean>>,
) {
  const { slug, title } = identity
  const { cols, rows } = ground
  // Collision is authored in-app even on a Tiled map (the importer never reads
  // Tiled object layers, ADR-0007) — so a tiled map carries the painted mask on
  // the baked artifact just like a painted one (#131).
  const baked: {
    slug: string
    title: string
    cols: number
    rows: number
    producer: string
    ground: BakedGround
    collision?: ReadonlyArray<ReadonlyArray<boolean>>
  } = { slug, title, cols, rows, producer: 'tiled', ground }
  if (collision) baked.collision = collision
  return { slug, title, cols, rows, source: tiledSource, baked }
}

// POST /maps -> the created baked map. A rejected write (422 dup slug, etc.)
// surfaces as a RequestError the editor shows to the author.
export const create = (
  body: ReturnType<typeof mapCreateBody> | ReturnType<typeof tiledMapCreateBody>,
): Effect.Effect<BakedMap, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.post('/maps', body)
    return yield* decode('/maps', decodeOne)(raw)
  })

// GET /maps -> the identity-only list for the admin map picker.
export const list = (): Effect.Effect<readonly MapSummary[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.get('/maps')
    return yield* decode('/maps', decodeList)(raw)
  })

// The baked-document patch the decorate editor sends for a saved map (#139,
// ADR-0008): its collision mask, placed props (object references) AND authored
// zones (#90, ADR-0005), as full desired state — plus `otherEntities`, the
// loaded entities the editor doesn't manage (legacy tileset/frame props),
// preserved so a save never wipes them. Blank layers (null mask, no entities,
// no zones) are sent null/empty so the backend drops the keys. Pure, so it's
// unit-testable apart from the request.
export function decorationsBaked(
  collision: ReadonlyArray<ReadonlyArray<boolean>> | null,
  props: readonly PlacedProp[],
  otherEntities: readonly BakedEntity[],
  zones: readonly Zone[],
  maskOf?: MaskOf,
  edgeMaskOf?: MaskOf,
  doorOf?: DoorOf,
) {
  return {
    collision,
    entities: [...otherEntities, ...propEntities(props, maskOf, edgeMaskOf, doorOf)],
    zones,
  }
}

// The map settings (#91, ADR-0005 Node properties): who may enter and whether
// players see each other. PATCHed alongside the baked document.
export type MapSettings = { multiplayer: boolean; access_policy: MapAccessPolicy }

// PATCH /maps/:slug -> re-save a saved map's authored decorations — collision
// mask + placed props — in one write (the decorate editor, #139, extends the
// #131 collision-only patch), plus the map settings (#91) when the editor
// carries them. Returns the re-serialized baked map.
export const saveDecorations = (
  slug: string,
  collision: ReadonlyArray<ReadonlyArray<boolean>> | null,
  props: readonly PlacedProp[],
  otherEntities: readonly BakedEntity[],
  zones: readonly Zone[],
  maskOf?: MaskOf,
  edgeMaskOf?: MaskOf,
  doorOf?: DoorOf,
  settings?: MapSettings,
): Effect.Effect<BakedMap, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/maps/${encodeURIComponent(slug)}`
    const raw = yield* http.patch(path, {
      baked: decorationsBaked(collision, props, otherEntities, zones, maskOf, edgeMaskOf, doorOf),
      ...settings,
    })
    return yield* decode(path, decodeOne)(raw)
  })

export const MapsService = { get, create, list, saveDecorations } as const

// Pure map-authoring reads re-exposed on the read surface (ADR-0010):
// cross-module callers reach them here, not via ./props.ts / ./tiledImport.ts.
export {
  placeProp,
  erasePropAt,
  propEntities,
  propsFromBaked,
  propGhost,
} from './props.ts'
export type { PlacedProp, SizeOf, MaskOf, DoorOf } from './props.ts'
export { newZone, retrigger, triggersFor, zoneIndexAt, eraseZoneAt, replaceZone } from './zoneAuthor.ts'
export type { ZoneKind } from './zoneAuthor.ts'
export { importTiledMap, TiledImportError } from './tiledImport.ts'
export { travel } from './travel.ts'
// Preview-in-game handoff (#91): the editor stashes its draft document, the
// play shell takes it back through the schema — never an import (ADR-0004).
export { draftMap, stashDraft, takeDraft, DRAFT_PLAY_PATH } from './draft.ts'
