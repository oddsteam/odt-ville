// On-screen directional pad. Uses pointer press/release so holding a button
// keeps the avatar walking — the shared touch control on every device.
export default function MobileDpad({ onPress, onRelease }) {
  const noFocus = (e) => e.preventDefault()

  const dir = (d) => ({
    onPointerDown: (e) => {
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
