// The Discord shell's authenticated backend calls, on the app's Effect http
// layer (same shape as MapsService / GameSessionService): the shared client
// attaches our `dsc.` session token, callers `runEdge(...)` at the edge.

import * as Effect from 'effect/Effect'

import { Http } from '../lib/http.ts'

// GET /discord/guilds/:id/map -> { slug } (404 = server not set up, #569)
const guildMap = (guildId: string) =>
  Effect.flatMap(Http, (http) => http.get<{ slug: string }>(`/discord/guilds/${encodeURIComponent(guildId)}/map`))

// POST /discord/move -> the bot moves us to the room's voice channel (#571)
const move = (guildId: string, room: string) =>
  Effect.flatMap(Http, (http) => http.post('/discord/move', { guild_id: guildId, room }))

export const DiscordService = { guildMap, move } as const
