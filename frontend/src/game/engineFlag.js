// Single source of truth for the `?engine=phaser` URL flag — used while
// the Phaser rebuild lands across PR-A..E (issue #16). PR-A introduced
// the flag inside <VillageGame> only; PR-C needs App.jsx to read it too
// (the shell's scene-routing logic differs between engines), so it lives
// here as a tiny one-export module both can import.
export function readEngineFlag() {
  if (typeof window === 'undefined') return 'dom'
  try {
    return new URLSearchParams(window.location.search).get('engine') === 'phaser'
      ? 'phaser'
      : 'dom'
  } catch {
    return 'dom'
  }
}
