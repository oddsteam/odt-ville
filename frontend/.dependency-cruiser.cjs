// Architecture conformance check — the reflexion model of frontend/src (#179).
//
// This file IS the target architecture in machine-readable form: the intended
// module graph from ADR-0004 (one map shape, two producers, shared kernel) and
// PRD #169, declared as rules; dependency-cruiser extracts the actual import
// graph and reports the divergences. Divergences awaiting a fix are recorded
// in .dependency-cruiser-known-violations.json (the baseline); that list is
// now EMPTY, so `pnpm arch` fails on ANY violation, not merely new ones.
//
//   pnpm arch            # check (ignores baselined violations)
//   pnpm arch:baseline   # re-record the baseline (only when a violation is
//                        # accepted deliberately — normally the list only shrinks)
//
// Vocabulary: CONTEXT.md (Tile Catalog, Hometown Policy, Map/producers) and
// docs/adr/0004. A divergence means either the code is wrong (fix the code) or
// the model is wrong (change this file + say why in the PR) — never ignore one.
//
// Baseline EMPTY as of 2026-07-19 (#238). Keep it that way: a new entry means
// either the code is wrong (fix the code) or the model is wrong (change this
// file + say why in the PR) — re-baselining is for a violation accepted
// deliberately, not a shortcut past a red check.
//
// What the baseline used to hold, and what deleted each entry:
//   the 10 grandfathered ADR-0010 deep cross-module imports are GONE — #238
//     resolved every one rather than widening the rule (see #216, which
//     introduced it with the grandfather list).
//   characterRig -> character was the last black-box data edge, GONE with the
//     same #238 pass: the manifest shape helpers moved into
//     src/kernel/characterManifest.js and the promise-level load moved onto
//     character/service.ts, called from src/townLoader.ts — shell-side, outside
//     the black box. townLoader's own five edges went earlier via the same move
//     (#185): VillagePage drives it and hands the bundle to the game as props.
//     The kernel -> game and MapPreview -> game/constants edges are GONE — #178
//     extracted src/kernel/ (TILE moved into it).
//   maps/MapPage.tsx -> MapScene is GONE — #203 confirmed the MODEL refinement:
//     MapPage is the player-facing play route (#128), not authoring, so it moved
//     to src/MapPage.tsx and joined the SHELL group beside VillagePage.
//   groundTiles/GroundTileMapper.tsx -> tileMapper/styles.css is GONE — #191
//     moved the catalog modules to src/catalog/ and split the mapper UI out to
//     src/groundMapper/ (authoring), where the stylesheet borrow is legal.
//   admin/MapEditorPage.tsx -> catalog/terrains/write.ts is GONE — #198 moved
//     the terrain-priority reorder tool (#120) to the Ground Mapper (Content
//     Authoring), where the catalog write is legal; the editor keeps its
//     read-only use of priority via TerrainsService.list.

// The shared kernel (ADR-0004: "map-agnostic, depends on nobody"), physically
// extracted to src/kernel/ in #178. mapRenderer is included per the CONTEXT.md
// multi-map decision that the WYSIWYG preview and the game share one renderer
// factored into the kernel.
const KERNEL = '^src/kernel/'

// The Content Catalog (CONTEXT.md "Tile Catalog": the set of things that
// *exist*) — the admin-managed palette of placeable objects, monsters,
// terrains and tile images that both producers pick from. Physically
// extracted to src/catalog/ in #191, the same path the kernel took in #178.
const CATALOG = '^src/catalog/'

// The single AUTHORING group split in two (#196): two authoring activities
// with different write targets, running at different steps (a tree must exist
// before anyone can place one).
//
// Content Authoring defines what *exists* — raw art in, catalog records out.
// The mappers are standalone apps with their own main.tsx; MonstersAdminPage
// is an admin SPA route (src/admin/ dissolves logically — the physical split
// into contentAuthoring/mapAuthoring dirs is a deferred #191-style follow-up,
// waiting on the Hometown-Policy questions in CONTEXT.md: the policy
// "generation settings" page will be a *third* authoring kind).
// Wrinkle: spriteMapper writes src/character/, not the catalog — Content
// Authoring by nature, but the catalog write rule can't cover it until
// character's data half joins the catalog (open domain question: monsters are
// catalog, characters aren't).
const CONTENT_AUTHORING = [
  '^src/(tileMapper|groundMapper|spriteMapper)/',
  '^src/admin/MonstersAdminPage\\.tsx$',
]

// Map Authoring places *references* to catalog content and paints terrain on
// a specific map (ADR-0008: props are references to saved tile objects). It
// reads the catalog as a palette and writes map documents only. Covers the
// map admin pages, MapPreview + its paint/mask/pointer helpers, and the maps
// resource. (The player-facing play route MapPage.tsx moved out to the shell
// in #203 — it boots the map-agnostic runtime like VillagePage, not authoring.)
const MAP_AUTHORING = [
  '^src/maps/',
  '^src/admin/(MapEditorPage|MapDecoratePage|MapPreview|MapsListPage)\\.tsx$',
  '^src/admin/(mapCatalog|mapPaint|maskPaint|previewPointer)\\.ts$',
]

// Both authoring kinds — the game-runtime firewall applies to each alike.
const AUTHORING = [...CONTENT_AUTHORING, ...MAP_AUTHORING]

// The catalog's write surface (#196): each catalog module keeps its reads in
// service.ts and its mutations in write.ts, so the write boundary below is
// import-separable.
const CATALOG_WRITES = '^src/catalog/[^/]+/write\\.ts$'

// Game Runtime (the black box), minus the kernel files under src/game/.
const GAME = '^src/game/'

// The shell: composes everything; nothing may depend on it.
const SHELL = '^src/(App|RootLayout|VillagePage|MapPage|main)\\.tsx$'

// Proximity voice (#159, #278). Kept extractable from the day it was created:
// it owns pod membership now and WebRTC signalling/media later, and none of
// that belongs to any existing module. The two rules below say it depends on
// nothing but shared infrastructure, and that the game never imports it — so
// lifting src/voice/ out (to a package, a worker, its own app) stays a move
// rather than an untangling.
const VOICE = '^src/voice/'

// The shared src/lib grab-bag: like the kernel, it exists to be imported
// broadly, so (with the kernel) it is exempt as a cross-module import TARGET.
const LIB = '^src/lib/'

// Every domain module's PUBLIC SURFACE (ADR-0010): the only files another
// module may import. Deliberately a file-pattern, NOT an index.ts barrel — a
// barrel would collapse a module's reads and writes into one import edge and
// blind the map-authoring-never-writes-the-catalog firewall above. The triad
// is schema.ts (types), service.ts (reads), write.ts (mutations); a
// module-root component (`<Module>/<Name>.tsx`) is public too. The catalog
// exposes its surface one level down, per nested submodule
// (catalog/<sub>/{schema,service,write}.ts), so it earns its own pattern.
const PUBLIC_SURFACE = [
  '^src/[^/]+/(schema|service|write)\\.ts$',
  '^src/[^/]+/[^/]+\\.tsx$',
  '^src/catalog/[^/]+/(schema|service|write)\\.ts$',
]

module.exports = {
  forbidden: [
    {
      name: 'kernel-depends-on-nobody',
      comment:
        'ADR-0004: the Tile Catalog / Autotile Engine kernel sits beneath both ' +
        'producers and depends on no app module.',
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
      name: 'map-authoring-never-writes-the-catalog',
      comment:
        '#196: placing a tree can never mutate what a tree *is*. Map ' +
        'Authoring reads the catalog as its palette (schemas + service.ts ' +
        'reads); only Content Authoring may import a catalog module\'s write ' +
        'surface (write.ts).',
      severity: 'error',
      from: { path: MAP_AUTHORING },
      to: { path: CATALOG_WRITES },
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
        path: [CATALOG, '^src/(communities|viewer|posture|character)/'],
      },
    },
    {
      name: 'catalog-knows-no-consumers',
      comment:
        'CONTEXT.md: the Content Catalog is the palette of things that exist. ' +
        'Producers, authoring and the shell pick from it; it may depend only ' +
        'on itself and shared infrastructure (src/lib) — never on whoever ' +
        'consumes it.',
      severity: 'error',
      from: { path: CATALOG },
      to: { path: '^src/', pathNot: [CATALOG, '^src/lib/'] },
    },
    {
      name: 'cross-module-imports-target-public-surface-only',
      comment:
        'ADR-0010: a module\'s public API is a file-pattern, not a barrel. A ' +
        'cross-module import may reach only another module\'s public surface — ' +
        'schema.ts (types), service.ts (reads), write.ts (mutations) or a ' +
        'module-root component (*.tsx); the catalog exposes the triad per ' +
        'nested submodule (catalog/<sub>/{schema,service,write}.ts). ' +
        'Everything else is module-internal. No index.ts barrels — a barrel ' +
        'collapses reads and writes into one edge and would blind the ' +
        'map-authoring-never-writes-the-catalog firewall. kernel and lib are ' +
        'exempt as targets: shared infrastructure whose job is to be imported ' +
        'broadly (ADR-0004: the kernel sits beneath everything). Today\'s deep ' +
        'imports are baselined and burn down when touched.',
      severity: 'error',
      from: { path: '^src/([^/]+)/' },
      to: {
        path: '^src/[^/]+/',
        // `$1` back-references the source module captured in `from.path`, so a
        // module's own internal imports are unrestricted; only reaching INTO
        // another module past its public surface is forbidden.
        pathNot: ['^src/$1/', KERNEL, LIB, ...PUBLIC_SURFACE],
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
      name: 'voice-depends-only-on-shared-infrastructure',
      comment:
        '#278: proximity voice must stay independently extractable. It may ' +
        'depend on itself, the kernel and src/lib — nothing else, and the ' +
        'game runtime least of all. Voice needs only a peer\'s {x, y}, which ' +
        'MapScene\'s RemotePlayer satisfies structurally, so the roster can be ' +
        'handed over without an import edge.',
      severity: 'error',
      from: { path: VOICE },
      to: { path: '^src/', pathNot: [VOICE, KERNEL, LIB] },
    },
    {
      name: 'game-runtime-never-imports-voice',
      comment:
        '#278, mirrored: voice does network I/O (signalling, #279), which is ' +
        'exactly what game-black-box-no-data-services keeps out of src/game/. ' +
        'The shell owns the voice session and injects a handle via the Phaser ' +
        'registry — the same path presence takes (ADR-0004), which is why ' +
        'MapScene calls this.presence.loadManifest rather than importing a ' +
        'service.',
      severity: 'error',
      from: { path: GAME, pathNot: KERNEL },
      to: { path: VOICE },
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
