# "Downtown" means the Scope; the authored sample map is `sampletown`

ADR-0020 shipped a site-scope named **downtown** (the `NULL`-scoped set of
ODDS-wide community buildings every staff member sees) into a codebase that
already contained an authored travel-map called **`downtown`**. The word was
overloaded, and ADR-0020's Consequences flagged it for a decision (#502): are
the two the same place, or not?

They are not. The site-scope is the live product concept — a whitelist row
(`houses.site IS NULL`) filtered on the hometown read, referenced across the
communities model, serializer, controller, and admin UI. The authored
`downtown` was never a real place: `frontend/public/maps/downtown.json` is a
Tiled export used **only** as a fixture to test the importer (#130), plus a
`slug: "downtown"` string in a maps-controller test. It is not seeded, not
reachable by any user, and has no `Maps::AccessPolicy` row in production.

## Decision

- **`downtown`, unqualified, means the Scope** — the `NULL`-scoped ODDS-wide
  community buildings on the hometown (ADR-0020). There is one canonical meaning.

- **The authored-map sample is renamed `sampletown`.** `downtown.json` →
  `sampletown.json`; the `map:build` target, the `curate-palette.mjs` provenance
  in `palette.json`, the `tmx-to-tiledjson.mjs` example comment, and the
  maps-controller test slug all follow. A pure rename — no behavior changes.

- **Historical prose keeps its wording.** Code comments that name a past
  "library→downtown" spawn bug (#453) describe events under their real names and
  are left as-is; they create no runtime ambiguity.

## Considered options

1. **Make them the same place** — promote the authored sample to *be* the
   downtown scope's map. Rejected: the sample is a throwaway importer fixture
   with no rooms, portals, or access policy of its own; the scope is a filtered
   building list, not a single authored map. Fusing them invents a coupling the
   product does not have.

2. **Document only, keep both named `downtown`.** Rejected: the AC asked for the
   names to be disambiguated, and leaving a second `downtown` in the tree (even a
   fixture) re-seeds the exact confusion this ADR closes.

3. **Rename the scope instead of the fixture.** Rejected: the scope term is
   load-bearing across model/serializer/controller/admin and matches the
   product's spoken language ("downtown, where everyone's buildings are"); the
   fixture is a single throwaway file. Rename the cheap side.

## Consequences

- `downtown` now has exactly one meaning in the codebase and the domain
  language. The CONTEXT.md ambiguity flag is resolved.
- The sample map's identity is `sampletown` everywhere it is loaded or built.
  Its source `.tmx` is not committed (only the exported `.json` is), so nothing
  physical was renamed beyond the export; a future `pnpm map:build` expects a
  `sampletown.tmx` alongside it.
