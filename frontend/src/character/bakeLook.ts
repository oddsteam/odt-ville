// Bake a Part list into a sheet the picker can render (#399). Loads each Part
// PNG (cached across bakes — lazy per tab), composites them in z-order via the
// same kernel composeLook the game uses, and hands back a data-URL sheet that
// AnimPreview draws exactly like any other. Part images and baked sheets are
// both memoised, so re-rendering the same Look is free.

import { composeLook } from '../kernel/composeLook.ts'

const packDir = (pack: string) => `/maps/characters/packs/${pack}/`

const imgCache = new Map<string, Promise<HTMLImageElement | null>>()
const srcCache = new Map<string, string>()

function loadPart(pack: string, name: string): Promise<HTMLImageElement | null> {
  const url = `${packDir(pack)}${name}.png`
  let p = imgCache.get(url)
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null) // a dropped/renamed Part just skips its slot
      img.src = url
    })
    imgCache.set(url, p)
  }
  return p
}

type PackLayout = { name: string; atlas: { width: number; height: number } }

// The composited sheet as a PNG data URL. Empty parts → '' (AnimPreview blanks).
export async function bakeLook(parts: readonly string[], layout: PackLayout): Promise<string> {
  if (!parts.length) return ''
  const key = `${layout.name}:${parts.join('|')}`
  const cached = srcCache.get(key)
  if (cached) return cached
  const imgs = (await Promise.all(parts.map((n) => loadPart(layout.name, n)))).filter(Boolean) as HTMLImageElement[]
  const canvas = composeLook(imgs, layout) as unknown as HTMLCanvasElement
  const src = canvas.toDataURL()
  srcCache.set(key, src)
  return src
}
