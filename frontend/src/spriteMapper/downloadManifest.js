// Export a manifest from the sprite-mapper tool as a committable JSON file.

import { normalizeManifest } from '../kernel/characterManifest.js'

// Produce the committable form of a manifest: strip the inline data URL and
// point at the conventional repo path so the JSON is portable. Returns the
// cleaned manifest plus, when relevant, the path the user must drop the PNG.
export function toDownloadable(m) {
  const clean = normalizeManifest(m)
  let note = null
  if (clean.sheet.dataUrl) {
    const file = `${clean.name || 'character'}.png`
    const path = `/maps/characters/sheets/${file}`
    clean.sheet = { path, width: clean.sheet.width, height: clean.sheet.height }
    note = `This sheet was uploaded. Place its PNG at frontend/public${path} so the game can load it.`
  }
  return { manifest: clean, note }
}

export function downloadManifest(m) {
  const { manifest, note } = toDownloadable(m)
  const blob = new Blob([JSON.stringify(manifest, null, 1)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${manifest.name || 'character'}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return note
}
