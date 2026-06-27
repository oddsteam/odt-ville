// Response shapes for the Rails posture-gate endpoints (issue #24). Mirror the
// PostureController payloads and decode at the data-layer edge.

import * as Schema from 'effect/Schema'

// POST /game/posture/start
export const StartResponse = Schema.Struct({
  session_id: Schema.String,
  hosted_url: Schema.String,
})
export type StartResponse = Schema.Schema.Type<typeof StartResponse>

// POST /game/posture/confirm
export const ConfirmResponse = Schema.Struct({
  granted: Schema.Boolean,
  status: Schema.NullOr(Schema.String),
})
export type ConfirmResponse = Schema.Schema.Type<typeof ConfirmResponse>
