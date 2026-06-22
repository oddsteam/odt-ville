import type React from 'react'

// On-screen directional pad. Uses pointer press/release so holding a button
// keeps the avatar walking — the shared touch control on every device.
export default function MobileDpad({
  onPress,
  onRelease,
}: {
  onPress: (dir: string) => void
  onRelease: (dir: string) => void
}) {
  const noFocus = (e: React.MouseEvent) => e.preventDefault()

  const dir = (d: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      onPress(d)
    },
    onPointerUp: () => onRelease(d),
    onPointerLeave: () => onRelease(d),
    onPointerCancel: () => onRelease(d),
  })

  return (
    <div className="dpad" role="group" aria-label="Movement controls">
      <button type="button" className="dpad-btn dpad-up" onMouseDown={noFocus} {...dir('up')} aria-label="Move up">▲</button>
      <button type="button" className="dpad-btn dpad-left" onMouseDown={noFocus} {...dir('left')} aria-label="Move left">◀</button>
      <div className="dpad-center" />
      <button type="button" className="dpad-btn dpad-right" onMouseDown={noFocus} {...dir('right')} aria-label="Move right">▶</button>
      <button type="button" className="dpad-btn dpad-down" onMouseDown={noFocus} {...dir('down')} aria-label="Move down">▼</button>
    </div>
  )
}
