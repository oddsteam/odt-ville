import { useEffect, useState } from 'react'

// Wild-encounter screen. Scope is "encounter screen only": it shows the
// opponent and a single RUN action. A brief white flash plays the classic
// Game Boy battle-transition feel before the opponent is revealed.
//
// `wild.kind` is 'wild' (a Pokémon you bumped into in the grass) or
// 'trainer' (an NPC who spotted you on the road). The screen layout is the
// same; only the intro line and the run button label differ.
export default function EncounterScreen({ wild, onRun }) {
  const [phase, setPhase] = useState('flash') // 'flash' -> 'show'
  const isTrainer = wild.kind === 'trainer'

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
        <div className={`encounter-stage${isTrainer ? ' encounter-trainer' : ''}`}>
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
              {isTrainer
                ? `${wild.name} wants to duel!`
                : `A wild ${wild.name} appeared!`}
              <br />
              <span className="encounter-level">Lv. {wild.level}</span>
            </p>
            <button
              type="button"
              className="encounter-run"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onRun}
            >
              {isTrainer ? 'RUN AWAY' : 'RUN'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
