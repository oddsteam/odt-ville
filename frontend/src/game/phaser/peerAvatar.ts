// A player's face as a Phaser texture (#323). Loaded from our own stable
// avatar path (ADR-0012), keyed by the Keycloak subject presence frames
// already broadcast (#88) — the stored Basecamp URL is a rotating signed
// capability and never reaches the client.
//
// Deliberately no error channel: no avatar, an unknown subject and a dead
// upstream are one 404, and every one of them means "keep the plain
// nameplate". The callback only fires when there is a face to show.

// The Phaser scene, structurally — same loose convention as the renderers.
type Scene = any

// One texture per distinct person on the map, not per sighting.
const avatarKey = (userId: string) => `peer.avatar.${userId}`

const avatarUrl = (userId: string) => `/api/v1/users/${encodeURIComponent(userId)}/avatar`

// The round chip's own resolution — the scene scales it down to nameplate size,
// so cut it larger than it renders and the circle's edge stays smooth.
const CHIP_PX = 64
const RING_PX = 4

// Bake the square source into a circular texture. Phaser 4 dropped
// BitmapMask/setMask and its replacement (enableFilters) is WebGL-only, so the
// circle is cut once per person into a canvas texture instead of masked every
// frame — one path, both renderers. A dark ring keeps the face legible over a
// busy tilemap, the same job the nameplate's backing does for the name.
function roundChip(scene: Scene, key: string): string {
  const round = `${key}.round`
  if (scene.textures.exists(round)) return round

  const chip = scene.textures.createCanvas(round, CHIP_PX, CHIP_PX)
  // No canvas to draw into (a headless or exhausted texture manager) — a square
  // face still beats no face.
  if (!chip) return key

  const r = CHIP_PX / 2
  const ctx = chip.context
  ctx.save()
  ctx.beginPath()
  ctx.arc(r, r, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(scene.textures.get(key).getSourceImage(), 0, 0, CHIP_PX, CHIP_PX)
  ctx.restore()
  // Inset by half the stroke, so the ring lands inside the canvas rather than
  // half outside it (a stroke straddles its path).
  ctx.beginPath()
  ctx.arc(r, r, r - RING_PX / 2, 0, Math.PI * 2)
  ctx.lineWidth = RING_PX
  ctx.strokeStyle = '#000000aa'
  ctx.stroke()
  chip.refresh()
  return round
}

export function loadAvatar(
  scene: Scene,
  userId: string,
  asked: Set<string>,
  onReady: (key: string) => void,
): void {
  const key = avatarKey(userId)
  // Textures outlive the scene (stop/start swaps maps, #249) and a face does
  // not change mid-session, so a rejoin re-attaches the cached one for free.
  if (scene.textures.exists(key)) return onReady(roundChip(scene, key))
  // ponytail: a rejoin *during* the first fetch gets no face until the peer
  // walks out of range and back. Queue the waiters if that ever shows up.
  if (asked.has(userId)) return
  asked.add(userId)
  scene.load.image(key, avatarUrl(userId))
  // The queue-drained event ('complete'), not filecomplete-image-<key>: it
  // fires whether the bytes arrived or 404'd, so a face-less peer settles on
  // the plain nameplate instead of waiting forever.
  scene.load.once('complete', () => {
    if (scene.textures.exists(key)) onReady(roundChip(scene, key))
  })
  scene.load.start()
}
