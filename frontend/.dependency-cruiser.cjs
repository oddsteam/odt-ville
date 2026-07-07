// Architecture conformance check — the reflexion model of frontend/src (#179).
//
// This file IS the target architecture in machine-readable form: the intended
// module graph from ADR-0004 (one map shape, two producers, shared kernel) and
// PRD #169, declared as rules; dependency-cruiser extracts the actual import
// graph and reports the divergences. Today's divergences are recorded in
// .dependency-cruiser-known-violations.json (the baseline) and burn down via
// #171/#173/#177/#178 — `pnpm arch` fails only on NEW violations.
//
//   pnpm arch            # check (ignores baselined violations)
//   pnpm arch:baseline   # re-record the baseline (only when a violation is
//                        # accepted deliberately — normally the list only shrinks)
//
// Vocabulary: CONTEXT.md (Tile Catalog, Hometown Policy, Map/producers) and
// docs/adr/0004. A divergence means either the code is wrong (fix the code) or
// the model is wrong (change this file + say why in the PR) — never ignore one.
//
// Baseline as of 2026-07-07 (12 violations) and what deletes them:
//   kernel -> game (mapRenderer/entityLoader -> constants, groundModel ->
//     town.ts): the physical kernel extraction, #178.
//   game/townLoader -> data services (x5) + characterRig -> character:
//     shell-side data orchestration living inside the black box. #173 shrinks
//     townLoader's fetches; moving it out to the shell has no issue yet — the
//     baseline itself tracks it. characterRig resolution belongs to the
//     per-user-character work (#155).
//   authoring -> game (TileMapper -> town.ts, MapPreview -> constants): #178
//     (shared constants/kernel move).
//   maps/MapPage.tsx -> MapScene: likely a MODEL refinement, not a code bug —
//     MapPage is the player-facing play route (#128) living under src/maps/;
//     reclassify it out of the authoring group (or move the file) when the
//     House/interior slice (#90/#111) touches it.

// The shared kernel (ADR-0004: "map-agnostic, depends on nobody"). These files
// physically move to a kernel/ directory in #178; until then the group is
// listed explicitly. mapRenderer is included per the CONTEXT.md multi-map
// decision that the WYSIWYG preview and the game share one renderer factored
// into the kernel.
const KERNEL = [
  '^src/game/phaser/groundModel\\.js$',
  '^src/game/phaser/tileCatalog\\.ts$',
  '^src/game/phaser/entityLoader\\.ts$',
  '^src/game/phaser/mapRenderer\\.ts$',
  '^src/maps/baker\\.ts$',
  '^src/maps/schema\\.ts$',
]

// Map Authoring (ADR-0004 bounded context): the editor/mapper admin surfaces
// and the maps resource, minus the kernel files that live under src/maps/.
const AUTHORING = '^src/(admin|maps|tileMapper|spriteMapper)/'

// Game Runtime (the black box), minus the kernel files under src/game/.
const GAME = '^src/game/'

// The shell: composes everything; nothing may depend on it.
const SHELL = '^src/(App|RootLayout|VillagePage|main)\\.tsx$'

module.exports = {
  forbidden: [
    {
      name: 'kernel-depends-on-nobody',
      comment:
        'ADR-0004: the Tile Catalog / Autotile Engine kernel sits beneath both ' +
        'producers and depends on no app module. Baselined offenders move or ' +
        'dissolve in #178 (e.g. entityLoader -> game constants).',
      severity: 'error',
      from: { path: KERNEL },
      to: { path: '^src/', pathNot: KERNEL },
    },
    {
      name: 'authoring-never-imports-game-runtime',
      comment:
        'ADR-0004: Map Authoring and Game Runtime meet only at the document ' +
        'and the kernel — the editor must not reach into the running game.',
      severity: 'error',
      from: { path: AUTHORING, pathNot: KERNEL },
      to: { path: GAME, pathNot: KERNEL },
    },
    {
      name: 'game-runtime-never-imports-authoring',
      comment:
        'ADR-0004, mirrored: the black box renders documents; it never imports ' +
        'editor or mapper code.',
      severity: 'error',
      from: { path: GAME, pathNot: KERNEL },
      to: { path: AUTHORING, pathNot: KERNEL },
    },
    {
      name: 'game-black-box-no-data-services',
      comment:
        'CONTEXT.md architecture intent: the game takes communities + session ' +
        'as props and emits events — no API imports inside the black box. ' +
        'game-session is deliberately allowed ("the only piece shared between ' +
        'the game and the rest"). Baselined offenders are townLoader-shaped: ' +
        'shell-side data orchestration currently living inside src/game/.',
      severity: 'error',
      from: { path: GAME, pathNot: KERNEL },
      to: {
        path: '^src/(communities|tileObjects|groundTiles|monsters|terrains|viewer|posture|character)/',
      },
    },
    {
      name: 'communities-reusable-from-any-shell',
      comment:
        'CONTEXT.md: the communities module owns CRUD/content and must be ' +
        'reusable from any shell — it may never know the game exists.',
      severity: 'error',
      from: { path: '^src/communities/' },
      to: { path: '^src/game' },
    },
    {
      name: 'nothing-imports-the-shell',
      comment: 'The shell composes modules; no module may depend back on it.',
      severity: 'error',
      from: { path: '^src/', pathNot: SHELL },
      to: { path: SHELL },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Tests may cross boundaries freely (fixtures, golden nets); the model
    // constrains production imports only.
    exclude: { path: ['\\.test\\.(ts|tsx|js)$', '(^|/)test/'] },
    tsConfig: { fileName: 'tsconfig.json' },
  },
}
