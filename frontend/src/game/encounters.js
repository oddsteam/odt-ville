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

// The gate trainer's bundled identity — who challenges you at the entrance
// stem. Where he stands and what he sees live on the on_sight Zone buildTown
// emits (#255); this is only the name/sprite/level the duel launches with.
export const GATE_TRAINER = {
  id: 'boss-k',
  kind: 'trainer',
  name: 'THE BOSS',
  level: 99,
  sprite: bossK,
}

// The hometown duel's #69-style fallback (#255): when the NPC catalog can't
// resolve the trainer zone's npcId (unseeded DB, failed fetch), the gate is
// still guarded by the bundled boss — same shape trainerOpponent returns.
export function gateTrainerOpponent() {
  return { ...GATE_TRAINER }
}

// The authentic GB per-step roll: random 0–254 vs the grass encounter rate.
export function rollEncounter(rate = ENCOUNTER_RATE) {
  return Math.random() * 255 < rate
}

// The stateful half of the wild roll (#255), shared by the shell dispatchers:
// every fired encounter-zone step calls the gate, which rolls the per-step
// rate and — on a hit — arms GRACE_STEPS of quiet so the player can walk back
// out of the grass. Steps can't happen while the encounter runs, so arming at
// launch equals arming at close.
export function wildStepGate(roll = rollEncounter) {
  let grace = 0
  return () => {
    if (grace > 0) {
      grace -= 1
      return false
    }
    if (!roll()) return false
    grace = GRACE_STEPS
    return true
  }
}

// Cumulative-weight pick from an authored pool (GET /api/v1/monsters/pool rows:
// { id, name, encounter_rate, image, encounter_dialog }) -> a wild opponent
// { id, name, sprite, kind, encounter_dialog }. Pure: pass `rng` (defaults to
// Math.random) for a deterministic pick. Authored monsters have no level, so
// none is set — EncounterScene omits the "Lv." line for them. The dialog is the
// authored line EncounterScene shows in-world. Assumes a positive total weight;
// pickWild guards that.
const toWild = (m) => ({
  id: m.id,
  name: m.name,
  sprite: m.image,
  kind: 'wild',
  encounter_dialog: m.encounter_dialog,
})

export function pickFromPool(pool, rng = Math.random) {
  const total = pool.reduce((sum, m) => sum + m.encounter_rate, 0)
  let roll = rng() * total
  for (const m of pool) {
    roll -= m.encounter_rate
    if (roll < 0) return toWild(m)
  }
  return toWild(pool[pool.length - 1]) // float-rounding fallback
}

// The grass roll's source of truth: the authored pool when it has weight, else
// the built-in table so the grass is never dead (issue #69 fallback).
export function pickWild(pool, rng = Math.random) {
  const hasWeight = pool && pool.some((m) => m.encounter_rate > 0)
  return hasWeight ? pickFromPool(pool, rng) : pickWildPokemon()
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
