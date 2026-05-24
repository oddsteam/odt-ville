// Wild encounters in the tall-grass field.

import vayuPhoenix from './assets/pokemon/vayu-phoenix.png'
import mrP from './assets/pokemon/mr-p.png'

// Per-step encounter rate, the authentic Game Boy way: each step taken onto a
// tall-grass tile rolls a number 0–254; a wild Pokémon appears if it lands
// under this rate. 25 / 255 ≈ 10% per step — the classic grass-route rhythm.
export const ENCOUNTER_RATE = 25

// Steps after an encounter closes during which no new encounter can fire — it
// lets the player walk back out of the grass without an instant re-trigger.
export const GRACE_STEPS = 3

// Weighted table of wild encounters. Higher `weight` = more common in the
// roll. All entries currently sit at level 99 — both are "legendary" cameos.
const ENCOUNTER_TABLE = [
  { id: 'vayu-phoenix', name: 'VAYU PHOENIX', level: 99, sprite: vayuPhoenix, weight: 1 },
  { id: 'mr-p',         name: 'MR.P',          level: 99, sprite: mrP,         weight: 1 },
]

// The authentic GB per-step roll: random 0–254 vs the grass encounter rate.
export function rollEncounter(rate = ENCOUNTER_RATE) {
  return Math.random() * 255 < rate
}

// Cumulative-weight pick from the table -> { id, name, level, sprite }.
export function pickWildPokemon() {
  const total = ENCOUNTER_TABLE.reduce((sum, e) => sum + e.weight, 0)
  let roll = Math.random() * total
  for (const entry of ENCOUNTER_TABLE) {
    roll -= entry.weight
    if (roll < 0) return { ...entry }
  }
  // Float-rounding fallback.
  return { ...ENCOUNTER_TABLE[ENCOUNTER_TABLE.length - 1] }
}
