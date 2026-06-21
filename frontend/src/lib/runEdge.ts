// React-edge bridge: takes an Effect that already has every data-layer
// requirement satisfied by `AppLayer` and turns it into a Promise that
// rejects with a tagged HttpError (or any other typed error in the channel).
// Components stay plain async/await; Effects stay confined to the data layer.

import type * as Effect from 'effect/Effect'

import { AppRuntime } from './runtime.ts'

export type AppContext = typeof AppRuntime extends {
  runPromise: (effect: Effect.Effect<unknown, unknown, infer R>) => unknown
}
  ? R
  : never

export function runEdge<A, E>(
  effect: Effect.Effect<A, E, AppContext>,
): Promise<A> {
  return AppRuntime.runPromise(effect)
}
