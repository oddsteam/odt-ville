# A user's character is a nullable pick on the user; global active is the fallback

`CharacterManifest.active` is a single global row: whatever an admin last
promoted in the sprite mapper is the character *every* user renders. #153 made
that resolution deterministic (remote active → committed default, no
per-browser override), which sharpened the tension: the roster of saved
manifests exists, but a normal user has no way to pick one — and the game has
no notion of "this user's character" at all (#155).

The decision is how the game resolves a user's character without breaking the
admin surfaces that depend on the global-active meaning ("the one live
character" the sprite mapper's *Load current* and *Make active* operate on).

## Decision

- **A selection is a nullable `character_manifest_id` on `users`.** No new
  table: a user has at most one pick, no metadata, and it rides the existing
  JIT-provisioned user row. FK with `on_delete: :nullify`, so removing a
  manifest silently returns its pickers to the fallback chain.
- **Resolution is: my pick → global active → committed default.**
  `GET /character_manifests/for_me` resolves the first two tiers server-side
  (`current_user.character_manifest || CharacterManifest.current`) and
  returns 204 when neither exists; the client keeps its existing fallback to
  the committed default (`scout.json`), exactly the #153 chain. Like every
  v1 route it requires a user; an unauthenticated client falls back to the
  committed default client-side, same as with `/active` today.
- **`active` keeps its meaning and its endpoint.** Global active becomes "the
  character for users with no pick" — the admin default. The sprite mapper,
  map preview, and *Make active* are untouched; they still speak to
  `/character_manifests/active`.
- **Selecting is `POST /character_manifests/:id/select`**, authenticated
  (`require_user!`). Game surfaces (`townLoader`, `MapPage`) switch from the
  active endpoint to `for_me`; the picker is a user-facing `/character` page
  over the existing roster index.

## Considered options

1. **Nullable FK on `users`** (chosen) — one column, one resolution line,
   reuses the single-active machinery as the fallback tier.
2. **A `user_character_selections` table** — same chain with an extra join
   and lifecycle to manage. Only pays off if a selection grows its own data
   (history, multiple loadouts); nothing in #155 needs that. Rejected.
3. **Make `/active` user-aware** — no new route, but one endpoint would mean
   two things depending on the caller: the admin surfaces that manage the
   global default would start seeing the admin's *personal* pick. Rejected.

## Consequences

- **Other users are unaffected by a pick**: selection writes only the picker's
  row; the global row is untouched.
- **`activate!` semantics narrow**: *Make active* changes the default
  character, not everyone's character — users with a pick keep it. That is
  the point, but it changes what admins observe after promoting a manifest.
- **The manifest roster (`index`/`show`) is already open to reads**, so the
  picker needs no new read surface — it reuses the same endpoints as the
  admin roster.
- **`for_me` inherits the active serializer** (full data blob) since the game
  loads it the same way; if manifests grow heavy this is the endpoint to slim.
