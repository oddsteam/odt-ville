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
// Baseline as of 2026-07-11 (2 violations) and what deletes them:
//   characterRig -> character: the last black-box data edge. townLoader's five
//     edges are gone — #185 moved that shell-side data orchestration out of
//     src/game/ to src/townLoader.ts (its only caller, VillagePage, drives it
//     and hands the bundle to the game as props). characterRig resolution
//     belongs to the per-user-character work (#155). The kernel -> game and
//     MapPreview -> game/constants edges are GONE — #178 extracted src/kernel/
//     (TILE moved into it).
//   maps/MapPage.tsx -> MapScene: likely a MODEL refinement, not a code bug —
//     MapPage is the player-facing play route (#128) living under src/maps/;
//     reclassify it out of the authoring group (or move the file) when the
//     House/interior slice (#90/#111) touches it.
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
// resource. (maps/MapPage.tsx is the player-facing play route (#128) still
// living here — reclassify with #90/#111, see the baseline note above.)
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
const SHELL = '^src/(App|RootLayout|VillagePage|main)\\.tsx$'

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
