import { RequestError } from '../lib/http.ts'
import { runEdge } from '../lib/runEdge.ts'
import { DiscordService } from './service.ts'

// Which map this Discord server runs (#569, plan decision 2), or null when it
// isn't set up — an unregistered guild (404), or no guild at all (an Activity
// launched from a DM has `sdk.guildId === null`).
export async function guildMapSlug(guildId: string | null): Promise<string | null> {
  if (!guildId) return null
  return runEdge(DiscordService.guildMap(guildId)).then(
    (r) => r.slug,
    (e: unknown) => {
      if (e instanceof RequestError && e.status === 404) return null
      throw e
    },
  )
}
