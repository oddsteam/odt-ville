import { SPRITES } from './constants.js'

// The walking avatar — Pokémon Red protagonist sprites (from the pokemon-js
// reference repo). Shows a still frame when idle, alternating step frames
// while moving.
export default function PlayerSprite({ facing, moving, step }) {
  const frames = SPRITES[facing] || SPRITES.down
  const frame = moving ? (step % 2 === 0 ? 1 : 3) : 0
  return (
    <img
      className="player-img"
      src={frames[frame]}
      alt="player"
      draggable="false"
    />
  )
}
