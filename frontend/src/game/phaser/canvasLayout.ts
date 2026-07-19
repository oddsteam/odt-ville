// One coordinate-space rule for every world scene (#261): the canvas is the
// container at 1:1 CSS pixels (Scale.RESIZE — the .gb-screen CSS stretches the
// canvas to the container with !important, so RESIZE is the only mode whose
// backing size agrees with what's on screen), and layout derives from the
// canvas, never from one assumed size.

// Camera bounds that keep an authored map at the town's scale — 1:1 pixels,
// TILE=48 on screen inside a building exactly as outside. A world at least
// viewport-sized gets its own bounds (clamped follow, the town's rule); a
// smaller axis widens the bounds to the viewport, centred on the world, so the
// clamp pins the camera with the world in the middle instead of a corner.
export function cameraBounds(viewW: number, viewH: number, worldW: number, worldH: number) {
  return {
    x: Math.min(0, Math.round((worldW - viewW) / 2)),
    y: Math.min(0, Math.round((worldH - viewH) / 2)),
    width: Math.max(worldW, viewW),
    height: Math.max(worldH, viewH),
  }
}

// EncounterScene's stage sizes as fractions of the canvas. The ratios are
// anchored so the shipped absolute design falls out at the current gb-screen
// (~890×630) — the hometown duel looks the same — while any other canvas gets
// the same proportions instead of the town's pixels.
export function encounterLayout(width: number, height: number) {
  const w = (r: number) => Math.round(width * r)
  const h = (r: number) => Math.round(height * r)
  const fieldH = h(0.6)
  return {
    fieldH,
    boxY: fieldH,
    boxH: height - fieldH,
    ruleH: h(0.006),
    padX: w(0.04),
    textY: h(0.045),
    mainFont: h(0.035),
    levelY: h(0.1),
    levelFont: h(0.028),
    btnW: { trainer: w(0.225), wild: w(0.157) },
    btnH: h(0.095),
    btnFont: h(0.032),
  }
}
