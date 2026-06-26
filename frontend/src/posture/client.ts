// Plain Promise façade over the posture-gate service, for the JSX call site
// (the village shell). Same pattern as game-session/client.js.

import { runEdge } from '../lib/runEdge.ts'
import { PostureService } from './service.ts'
import type { StartResponse, ConfirmResponse } from './schema.ts'

export function startPosture(communityId: number, callbackUrl: string): Promise<StartResponse> {
  return runEdge(PostureService.start(communityId, callbackUrl))
}

export function confirmPosture(sessionId: string): Promise<ConfirmResponse> {
  return runEdge(PostureService.confirm(sessionId))
}
