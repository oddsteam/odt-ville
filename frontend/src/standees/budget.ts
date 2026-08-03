// The world-wide Standees budget (#371, ADR-0015): an employee may have at most
// 3 Standees out at once, counted across *every* map — not 3 per map. This is
// the pure client mirror of the backend `Standees::Budget`, so the deploy
// affordance can show "N of 3 out" and refuse — with a located pointer — before
// the employee writes anything. The backend stays the enforcement point; this
// only keeps the form from asking for something it cannot submit.

// The cap, shared with the "N of 3 out" label. Mirrors `Standees::Budget::CAP`.
export const STANDEE_CAP = 3

// One of the caller's own Standees, as `GET /standees/mine` returns it: enough
// to name where it stands (`map_title` + cell) in the refusal pointer.
export interface StandeePlacement {
  readonly map_title: string
  readonly x: number
  readonly y: number
}

export interface StandeeBudget {
  readonly out: number
  readonly remaining: number
  readonly allowed: boolean
  // The located refusal when at the cap, else null — the same shape and
  // wording the write-path refusal gives (`Standees::Budget#refusal`).
  readonly reason: string | null
}

export function standeeBudget(
  placements: readonly StandeePlacement[],
  cap = STANDEE_CAP,
): StandeeBudget {
  const out = placements.length
  const allowed = out < cap
  return {
    out,
    remaining: Math.max(cap - out, 0),
    allowed,
    reason: allowed ? null : refusal(placements, cap),
  }
}

function refusal(placements: readonly StandeePlacement[], cap: number): string {
  const places = placements.map((p) => `${p.map_title} (${p.x}, ${p.y})`).join(', ')
  return (
    `You already have all ${cap} Standees out — pick one up to deploy another. ` +
    `They're standing on: ${places}.`
  )
}
