# AGENTS.md

Agent instructions for the ODT Ville repo. See `CONTEXT.md` for the project's
intent and domain language; read it before editing.

## Agent skills

### Issue tracker

GitHub Issues on `oddsteam/odt-ville` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Gotchas

### Two map-entry paths — change both, test via a portal

An authored map boots `MapScene` from **two** independent paths that populate the
Phaser registry separately, with no shared source of truth:

- Standalone route `/maps/:slug` → `MapPage.tsx` (fresh `new Phaser.Game`).
- In-game town portal / onward hop → `VillagePage.handlePortal` assembles the
  bundle → `PhaserGame.enterPortal` sets the per-target registry keys.

When you add a **per-target map input** (a new baked* registry key, a bundle
field), wire it into **both** paths and verify by **walking in through a town
portal**, not just by loading `/maps/:slug` — that route never exercises the
portal path, so gaps stay invisible. This is how placed-NPC rigs (#294/#295)
shipped rendering on the route but blank via a portal (missing `bakedNpcs`).
Durable fix tracked in its own refactor issue: one shared
`loadMapBundle`/`applyMapTarget` so the key set can't drift.
