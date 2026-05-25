// Wild encounters in the tall-grass field — and the gate trainer who waits
// for the player on the way in.

import vayuPhoenix from './assets/pokemon/vayu-phoenix.png'
import mrP from './assets/pokemon/mr-p.png'
import bossK from './assets/character/boss-k.png'

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

// The gate trainer — stationed at the south end of the entrance stem, facing
// across the road. Walking into his line of sight starts a duel that, like
// the wild encounters, currently only supports RUN. See <Trainer />.
export const GATE_TRAINER = {
  id: 'boss-k',
  kind: 'trainer',
  name: 'THE BOSS',
  level: 99,
  sprite: bossK,
  // Where the trainer stands relative to the town. Resolved against the
  // generated town in <VillageGame>; see resolveTrainer().
  positionFrom: 'entrance',
  // Five-tile line of sight along the trainer's facing direction.
  sightRange: 5,
  facing: 'left',
}

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
    if (roll < 0) return { ...entry, kind: 'wild' }
  }
  // Float-rounding fallback.
  return { ...ENCOUNTER_TABLE[ENCOUNTER_TABLE.length - 1], kind: 'wild' }
}

// The trainer stands one tile east of the entrance, on the row just inside
// the south margin — close enough to the gate to read as "stationed at the
// entrance", far enough up that the player has to take a step before they
// land in sight.
export function resolveTrainerStart(town) {
  return {
    x: town.entrance.x + 1,
    y: town.entrance.y - 1,
    facing: GATE_TRAINER.facing,
    sightRange: GATE_TRAINER.sightRange,
  }
}

// Cells the trainer can see, in tile coordinates. A straight line in the
// facing direction up to `sightRange` tiles ahead, stopping early if the
// line walks off the map. (Buildings / signs don't block sight for now —
// the trainer is on the south side of the village where the road is open.)
export function trainerSightCells(trainer, town) {
  const dx =
    trainer.facing === 'left' ? -1 : trainer.facing === 'right' ? 1 : 0
  const dy =
    trainer.facing === 'up' ? -1 : trainer.facing === 'down' ? 1 : 0
  const cells = []
  for (let i = 1; i <= trainer.sightRange; i++) {
    const x = trainer.x + dx * i
    const y = trainer.y + dy * i
    if (x < 0 || y < 0 || x >= town.cols || y >= town.rows) break
    cells.push({ x, y })
  }
  return cells
}
