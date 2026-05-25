import { TILE } from './constants.js'

// The gate trainer rendered on the village map. A standing chibi figure at a
// single tile, optionally with a small line-of-sight indicator drawn ahead of
// him (a row of dim diamond markers showing where his sight reaches). After
// the player escapes the duel, `defeated` flips on and the sight markers
// disappear — the trainer stays put but no longer triggers.
export default function Trainer({ trainer, sightCells, defeated }) {
  return (
    <>
      {/* Sight markers — soft cues so the player knows where the trainer
          can see, in the spirit of Game Boy trainer auras. */}
      {!defeated &&
        sightCells.map((c) => (
          <div
            key={`tsight-${c.x}-${c.y}`}
            className="trainer-sight"
            style={{
              left: c.x * TILE,
              top: c.y * TILE,
              width: TILE,
              height: TILE,
              zIndex: c.y * 10 + 1,
            }}
            aria-hidden="true"
          />
        ))}

      <div
        className={`trainer trainer-${trainer.facing}${
          defeated ? ' trainer-defeated' : ''
        }`}
        style={{
          left: trainer.x * TILE,
          top: trainer.y * TILE,
          width: TILE,
          height: TILE,
          // Depth-sort with the rest of the world so the player can stand in
          // front of the trainer when they walk past after defeat.
          zIndex: trainer.y * 10 + 4,
        }}
      >
        <img src={trainer.sprite} alt={trainer.name} draggable="false" />
      </div>
    </>
  )
}
