// React-edge bridge: takes an Effect that already has every data-layer
// requirement satisfied by `AppLayer` and turns it into a Promise that
// rejects with a tagged HttpError (or any other typed error in the channel).
// Components stay plain async/await; Effects stay confined to the data layer.

import * as Cause from 'effect/Cause'
import type * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'

import { AppRuntime } from './runtime.ts'

export type AppContext = typeof AppRuntime extends {
  runPromise: (effect: Effect.Effect<unknown, unknown, infer R>) => unknown
}
  ? R
  : never

export function runEdge<A, E>(
  effect: Effect.Effect<A, E, AppContext>,
): Promise<A> {
  // runPromise would reject with a FiberFailure wrapper whose message is the
  // useless "An error has occurred"; unwrap so callers catch the typed error
  // (with its `_tag`/`status`) this module's contract promises.
  return AppRuntime.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) return exit.value
    throw Cause.squash(exit.cause)
  })
}
