// Bake a Look (ADR-0017): stack the trimmed part atlases into one canvas the
// character rig can slice, exactly as it slices a sheet. Pure and Phaser-free —
// the same seam mapRenderer.ts uses — so it unit-tests apart from the game.
//
// Every atlas #393 emits shares the packed layout, so the parts are already
// pixel-aligned: compositing is one full-canvas draw per part, in z-order
// (body → eyes → outfit → hairstyle → accessory). Only the ~28 mapped rects
// each atlas holds are baked; the full 1792×1312 sheet never touches the GPU.

// The 2D drawing surface, structurally — a real HTMLCanvasElement in the game,
// a stand-in under test. Loose on purpose (same convention as the renderers).
type LookCanvas = { getContext(type: '2d'): { drawImage(img: any, dx: number, dy: number): void } | null }
type PackLayout = { atlas: { width: number; height: number } }

const domCanvas = (w: number, h: number): LookCanvas => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function composeLook<C extends LookCanvas>(
  parts: any[],
  layout: PackLayout,
  createCanvas: (w: number, h: number) => C = domCanvas as (w: number, h: number) => C,
): C {
  const canvas = createCanvas(layout.atlas.width, layout.atlas.height)
  const ctx = canvas.getContext('2d')
  if (ctx) for (const part of parts) ctx.drawImage(part, 0, 0)
  return canvas
}
