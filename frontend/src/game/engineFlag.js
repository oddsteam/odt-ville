// Single source of truth for the `?engine=` URL flag — used while the
// Phaser rebuild lands across PR-A..E (issue #16). Phaser is now the
// default; `?engine=dom` is the opt-out for the legacy DOM engine,
// which we keep around until the PR-E migration retires it. PR-A
// introduced the flag inside <VillageGame> only; PR-C taught App.jsx
// to read it too (the shell's scene-routing logic differs between
// engines), so it lives here as a tiny one-export module both can
// import.
export function readEngineFlag() {
  if (typeof window === 'undefined') return 'phaser'
  try {
    return new URLSearchParams(window.location.search).get('engine') === 'dom'
      ? 'dom'
      : 'phaser'
  } catch {
    return 'phaser'
  }
}
