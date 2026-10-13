import { getAuthToken } from '../lib/authToken'

// Which map this Discord server runs (#569, plan decision 2), or null when it
// isn't set up — an unregistered guild (404), or no guild at all (an Activity
// launched from a DM has `sdk.guildId === null`). Same injectable-fetch shape
// as signIn so it tests without the Effect http layer.
export async function guildMapSlug(
  guildId: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  if (!guildId) return null
  const res = await fetchFn(`/api/v1/discord/guilds/${encodeURIComponent(guildId)}/map`, {
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Could not look up this server (${res.status})`)
  return ((await res.json()) as { slug: string }).slug
}
