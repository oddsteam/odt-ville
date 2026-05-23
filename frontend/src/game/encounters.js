// Wild encounters in the tall-grass field.
// Every encounter is the legendary Vayu Phoenix.

import vayuPhoenix from './assets/pokemon/vayu-phoenix.png'

// Per-step encounter rate, the authentic Game Boy way: each step taken onto a
// tall-grass tile rolls a number 0–254; a wild Pokémon appears if it lands
// under this rate. 25 / 255 ≈ 10% per step — the classic grass-route rhythm.
export const ENCOUNTER_RATE = 25

// Steps after an encounter closes during which no new encounter can fire — it
// lets the player walk back out of the grass without an instant re-trigger.
export const GRACE_STEPS = 3

// The one and only wild Pokémon — every encounter is this legendary.
const VAYU_PHOENIX = {
  id: 'vayu-phoenix',
  name: 'VAYU PHOENIX',
  level: 99,
  sprite: vayuPhoenix,
}

// The authentic GB per-step roll: random 0–254 vs the grass encounter rate.
export function rollEncounter(rate = ENCOUNTER_RATE) {
  return Math.random() * 255 < rate
}

// Every wild encounter yields the Vayu Phoenix.
export function pickWildPokemon() {
  return { ...VAYU_PHOENIX }
}
