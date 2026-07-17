# Domain modules are mirrored across frontend, backend, and schema

The frontend grew explicit, machine-governed modules (dependency-cruiser
reflexion model, ADR-0004 lineage) while the backend stayed a flat layered
Rails app whose domain seams lived only in routes.rb comments and the FK
graph. A newcomer browsing the code sees modules on one side and layers on
the other, and the same domain answers to different names per side
(`viewer/` vs `me`, `posture/` vs `posture_login`). Meanwhile the roadmap
adds a new domain: this app is a **downstream consumer of org data** —
employee profiles, teams, departments and the org chart will sync in from an
external service (plan: Basecamp API) — which forces the question of where
`Company` and the coming `Employee`/`Team`/`Department` live.

## Decision

- **One canonical module list, mirrored by name.** A domain module has the
  same name as a frontend directory (`src/<module>/`), a backend namespace
  (`<Module>::`), and — for tables created from now on — a table prefix
  (`<module>_*`). Each side implements only the subset it needs:
  frontend-only modules (game, kernel, the mappers, lib, the shell) are
  legal and expected. The map itself lives in `CONTEXT.md`; this ADR holds
  the rationale.
- **Backend modules are vanilla Rails namespaces inside the existing
  layers** — `app/models/catalog/terrain.rb` → `Catalog::Terrain`,
  `app/controllers/api/v1/catalog/terrains_controller.rb`, matching
  serializer dirs. No engines, no packwerk, no `packs/`. Existing table
  names are kept via `def self.table_name_prefix = ""` per namespace;
  existing URLs are kept via `scope module:` in routes (the comment blocks
  in routes.rb become real scopes). Zero migrations, zero client breaks.
- **A new `org` module owns the org tree.** `Company` is the tenant root of
  communities/teams/departments — an org concept, not a communities one. It
  moves to `Org::Company` now; `Employee`, `Team`, `Department` and the
  Basecamp sync client (an anti-corruption layer following the
  `app/clients/posture_login` precedent) land there when built. **Identity
  and profile are separate:** `Auth::User` (Keycloak `external_id`) will
  *link to* `Org::Employee` by external id/email, not be it — a person can
  exist in the org chart before ever logging in. Following a community
  stays in `communities`; team/department *assignment* is `org`.
- **Canonical names where the sides disagreed:** `viewer` (backend `me`
  controller nests under `Viewer::`, URL `/me` unchanged) and `posture`
  (the `posture_login` client moves under `Posture::`).
- **The frontend public API is a file-pattern, not a barrel.** Cross-module
  imports may target only `schema.ts` (types), `service.ts` (reads),
  `write.ts` (mutations), or a module-root component (`*.tsx`); everything
  else is module-internal. Enforced by a dependency-cruiser rule with
  today's deep imports baselined. **No `index.ts` barrels**: a barrel
  collapses reads and writes into one import edge, which would blind the
  path-based `map-authoring-never-writes-the-catalog` firewall; barrels are
  also the classic cycle generator and an over-pull risk (one type import
  dragging Phaser into an admin page's graph).
- **The database keeps its seams soft.** No hard foreign keys across the
  game↔org/communities seam; cross-cluster references stay
  nullable-or-FK-less by design (the existing
  `users → character_manifests` `on_delete: nullify` and the deliberately
  FK-less `user_location_states.last_house_id` are the pattern). New tables
  carry their module prefix; existing tables are never renamed.
- **Structure ratchets; it is never a project.** New code conforms; old
  code migrates only when a feature touches it. CI holds each boundary:
  `pnpm arch` (frontend graph + public-surface rule) and a backend
  structure check that fails new files landing flat outside a domain
  namespace.

## Considered options

1. **`index.ts` barrels as each module's public API** — rejected. Breaks
   static read/write separability (above), invites cycles (the codebase has
   exactly one today), and rewires ~180 imports for a convention swap. The
   schema/service/write triad already *is* a public API — named files
   instead of a barrel — it just needed enforcement and documentation.
2. **packwerk / Rails engines / packs** — rejected. The goal is a modular
   monolith without package machinery; at 13 models, namespaces give the
   same visibility and greppability at zero tooling cost. Revisit only if
   the app grows past what a CI structure check can keep honest.
3. **Leave `Company` in `communities` until the employee work lands**
   (strict second-consumer rule) — rejected. The org domain is already on
   the roadmap and the namespacing move is happening anyway; homing
   `Company` once is cheaper than moving it twice, and the communities
   module should not temporarily own tenant data it won't keep.
4. **Big-bang restructure of frontend imports and backend files in one
   pass** — rejected. The dependency-cruiser baseline burn-down already
   proved the ratchet model: declare the target, baseline the divergence,
   let features delete it.

## Consequences

- `ls frontend/src` and `ls backend/app/models` read as the same module
  list — the modules are visible in the code, not in a diagram.
- The map-authoring write firewall stays statically checkable, and the
  public-surface rule makes today's implicit convention enforced.
- The backend gains its first structural boundaries with no behavior
  change: same tables, same URLs, mechanical `git mv` + module wrap,
  verified by the existing test suite.
- Cross-module ActiveRecord associations (`Auth::User belongs_to
  Org::Company`, `Communities::House belongs_to Org::Company`) remain
  allowed — the boundary governs code organization and public surfaces,
  not AR relations.
- When the org-chart UI arrives, the frontend grows `src/org/` under a
  name the backend already uses; until then the module is backend-only.
