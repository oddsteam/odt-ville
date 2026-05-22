import { useEffect, useState } from 'react'

// A Pokémon Game Boy-style dialogue box: a framed box at the foot of the
// screen that types one line out, then shows a blinking ▾ arrow. Click / A
// advances. The parent owns which line is showing (remount via `key`).
export default function DialogueBox({ line, onAdvance }) {
  const [shown, setShown] = useState('')
  const full = line || ''

  useEffect(() => {
    setShown('')
    let i = 0
    const t = setInterval(() => {
      i += 1
      setShown(full.slice(0, i))
      if (i >= full.length) clearInterval(t)
    }, 26)
    return () => clearInterval(t)
  }, [full])

  const done = shown.length >= full.length

  return (
    <div
      className="dialogue"
      role="button"
      tabIndex={-1}
      onClick={onAdvance}
    >
      <p className="dialogue-text">{shown}</p>
      {done && <span className="dialogue-arrow" aria-hidden="true">▾</span>}
    </div>
  )
}
