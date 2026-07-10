import { describe, expect, it } from 'vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'

import { Http, type HttpError } from '../src/lib/http.ts'
import { TerrainsService } from '../src/catalog/terrains/service.ts'
import { priorityOrder, type Terrain } from '../src/catalog/terrains/schema.ts'

// Fake Http: GET returns the terrains payload; PUT echoes the reordered list it
// is given, mirroring the controller's `render Terrain.ordered`.
function fakeHttp(list: unknown) {
  const get = (): Effect.Effect<unknown, HttpError> => Effect.succeed(list)
  const put = (_path: string, body?: unknown): Effect.Effect<unknown, HttpError> => {
    const order = (body as { order: string[] }).order
    return Effect.succeed(order.map((name, priority) => ({ name, priority })))
  }
  const client = { get, post: get, put, patch: get, del: get }
  return Layer.succeed(Http, client as never)
}

const TERRAINS: Terrain[] = [
  { name: 'road', priority: 0 },
  { name: 'dirt', priority: 1 },
  { name: 'grass', priority: 2 },
]

describe('TerrainsService.list', () => {
  it('loads and decodes the terrain priority catalog', async () => {
    const exit = await Effect.runPromiseExit(Effect.provide(TerrainsService.list(), fakeHttp(TERRAINS)))
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) expect(exit.value).toEqual(TERRAINS)
  })
})

describe('TerrainsService.setOrder', () => {
  it('persists the reordered stack and decodes the result', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(TerrainsService.setOrder(['grass', 'dirt', 'road']), fakeHttp(TERRAINS)),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value.map((t) => t.name)).toEqual(['grass', 'dirt', 'road'])
      expect(exit.value.map((t) => t.priority)).toEqual([0, 1, 2])
    }
  })
})

describe('priorityOrder', () => {
  it('is the terrain names sorted low→high priority', () => {
    const shuffled: Terrain[] = [
      { name: 'grass', priority: 2 },
      { name: 'road', priority: 0 },
      { name: 'dirt', priority: 1 },
    ]
    expect(priorityOrder(shuffled)).toEqual(['road', 'dirt', 'grass'])
  })
})
