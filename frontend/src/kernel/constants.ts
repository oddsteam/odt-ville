// Shared rendering unit (ADR-0004 kernel): rendered px per tile. Both
// producers and both renderers agree on this one scale; the game re-exports it
// from game/constants.js for its internal consumers.
export const TILE = 48
