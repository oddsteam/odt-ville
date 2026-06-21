// One Effect runtime for the whole React app. Effects are run only at the
// React edge (route loaders, click handlers) via `runEdge`; nothing inside
// component bodies should call `Effect.runPromise` directly so that the
// configured layer (HttpClient and anything we add later — config, telemetry,
// auth headers) stays the single source of truth.

import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'

import { HttpClientLive } from './http.ts'

// Compose every service the data layer depends on here.
export const AppLayer = Layer.mergeAll(HttpClientLive)

// A managed runtime is initialised once at module load and reused for every
// `runEdge` call. Cheap to keep around; lets future services hold open
// connections (telemetry, websockets) without re-allocation per call.
export const AppRuntime = ManagedRuntime.make(AppLayer)
