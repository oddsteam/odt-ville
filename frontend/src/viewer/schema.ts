// effect/Schema decoder for the viewer (current-user) endpoint. Mirrors
// MeController#show: a thin user + company envelope used by the app header.
// Decode failures surface as typed errors at the data-layer edge.

import * as Schema from 'effect/Schema'

export const Viewer = Schema.Struct({
  user: Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    role: Schema.String,
  }),
  company: Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
  }),
})
export type Viewer = Schema.Schema.Type<typeof Viewer>
