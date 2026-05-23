import { useEffect, useState } from 'react'

// Wild-encounter screen. Scope is "encounter screen only": it shows the wild
// Pokémon and a single RUN action. A brief white flash plays the classic
// Game Boy battle-transition feel before the Pokémon is revealed.
export default function EncounterScreen({ wild, onRun }) {
  const [phase, setPhase] = useState('flash') // 'flash' -> 'show'

  useEffect(() => {
    const id = window.setTimeout(() => setPhase('show'), 420)
    return () => window.clearTimeout(id)
  }, [])

  // RUN also responds to A / Enter / Escape.
  useEffect(() => {
    function onKey(e) {
      const k = e.key.toLowerCase()
      if (k === 'enter' || k === ' ' || k === 'escape') {
        e.preventDefault()
        onRun()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onRun])

  return (
    <div className="encounter">
      {phase === 'flash' ? (
        <div className="encounter-flash" />
      ) : (
        <div className="encounter-stage">
          <div className="encounter-field">
            <img
              className="encounter-sprite"
              src={wild.sprite}
              alt={wild.name}
              draggable="false"
            />
          </div>
          <div className="encounter-box">
            <p className="encounter-text">
              A wild {wild.name} appeared!
              <br />
              <span className="encounter-level">Lv. {wild.level}</span>
            </p>
            <button
              type="button"
              className="encounter-run"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onRun}
            >
              RUN
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
