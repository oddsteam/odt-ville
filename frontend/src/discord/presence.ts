// Presence for the Discord shell (#570): the same per-map room MapPage opens,
// bundled the way MapScene reads it from the registry. `connect` is injected
// (the shell passes connectPresence) because src/discord/ may not deep-import
// another module's wire code. The cable rides the `dsc.` token sign-in stored
// and a relative URL, so Discord's URL mapping proxies it like any REST call.
export function mapPresence<H extends object>(
  map: { slug: string; multiplayer?: boolean },
  ownId: string | null,
  ownName: string | null,
  connect: (slug: string) => H | null,
  loadManifest: (id: number) => Promise<unknown>,
) {
  const handle = map.multiplayer && ownId ? connect(map.slug) : null
  return handle ? { ownId, ownName, loadManifest, ...handle } : null
}
