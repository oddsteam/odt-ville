# Standees live outside the baked map document

A **Standee** is a copy of a user's avatar, deployed by that user onto a
multiplayer map at runtime, carrying a **Placard** (a short line over its head
and a detail view behind a press-A). It is a placed entity in every visual
sense — it stands on a cell, it draws at a footprint, it sorts against the
avatar — and every other placed entity in this codebase lives in the map
document: props, houses, zones and NPCs are all authored into `source` and
resolved into `baked` (ADR-0003, ADR-0004, ADR-0008).

A Standee cannot follow them there, and the reasons are worth writing down
because the code will look inconsistent to anyone who doesn't know them.

## Decision

**Standees are their own table, read alongside the map, never baked into it.**

- A `standees` row references `map_id` and `user_id` and carries its Placard,
  its cell, and its expiry. The map load resolves it into the runtime's placed
  entity list at the same point the kernel loader resolves `object_id`
  references — so the renderer sees one uniform entity stream and gains no
  second draw path.
- The **art is a reference, not a copy** (the ADR-0008 discipline): the rig is
  resolved `standee.user_id → users.character_manifest_id` at load. Changing
  your character restyles every Standee you have out.
- **Deploy and pickup are durable REST writes**, and each successful write
  broadcasts on a per-map, unpartitioned ActionCable stream
  (`standees:map:<id>`) so the cutout appears and vanishes without a reload.
  This is the `CARD_STREAM` shape from #317, chosen for the same reason: the
  event rate is a few per day per person, against a movement frame every step.
  The write is the mechanism; the broadcast is its consequence.
- **A budget of 3 per user, counted across every map**, enforced in the write
  path. At the cap the deploy is refused with a pointer to the Standees already
  out — never a silent replace of the oldest.
- **Expiry is client-retired and load-filtered.** No server tick, no sweeper
  job: the load query excludes expired rows and a client holding `expires_at`
  removes the cutout itself when it passes.

## Considered options

1. **Write Standees into the map document** — append to `source.entities` and
   re-bake. Rejected on three counts, any one of which is fatal:
   - It puts a **player's write on an admin's document**. `source` is the
     editor's canvas; a runtime deploy would have to read-modify-write a
     document a human may be editing in another tab, with no merge story.
   - It **contradicts ADR-0003**. Tiles bake at author time precisely so the
     runtime never bakes. A deploy that re-bakes makes the runtime a producer.
   - It **cannot serve the hometown case even in principle**, should we ever
     want it: a generated map has no document to write to.
2. **Model the Standee as a Zone** (`interact` trigger + a new payload kind).
   Right about the *trigger* — a Standee is inspected exactly the way a `link`
   zone is (#110) — and wrong about *identity*: a Zone is a rect with no art
   and no owner, and a Standee is defined by having both. It would also
   inherit the document-write problem above, since zones are authored data.
3. **Model the Standee as `kind:"npc"`.** Superficially the closest fit —
   `mapNpcs.ts` already rigs a person-shaped sprite from a character manifest,
   sorts it against the avatar, and moves it at runtime. Rejected because a
   placed NPC is a *reference to a `catalog_npcs` row* (#294): it carries a
   level, it can be marked a duellist (#296), and it blocks unconditionally
   (`walk_mask: ['#']`). A Standee has no catalog row, never duels, and must
   never block. Reusing the kind would mean three "except when it's a standee"
   branches in code whose whole value is that it has none.
4. **Load-time only, no live stream.** Simpler, and rejected once the usage
   pattern was named: this app is left open for hours, so a Standee that only
   materialises on the next map load is invisible to exactly the people
   standing in front of it. The unpartitioned-stream precedent already exists,
   which makes the simplicity saving small.

## Consequences

- **The renderer gains an entity kind it cannot get from a document.** Anyone
  tracing "where do entities come from" will find one source that isn't
  `baked`. That asymmetry is the price of runtime authorship; this ADR is the
  answer to the question it provokes.
- **Standees survive a Tiled re-import.** ADR-0007 replaces the terrain half
  and keeps in-app objects, flagging out-of-bounds rather than dropping; a
  Standee, living outside the document entirely, is untouched by import. One
  stranded on newly-painted water is cosmetic and self-heals at expiry.
- **Deletion is by cascade, not by document edit.** A Standee dies with its
  owner and with its map. Admins may delete any; there is deliberately no
  user-facing report flow at this scale (one company, real names, faces synced
  from the Basecamp roster) — a deferral to revisit, not an oversight.
- **The reply link is owner-supplied, and stays that way.** Basecamp addresses
  a direct message by *circle* — a conversation id that exists only once a pair
  has already talked — so there is no person-to-DM address to derive, and no
  amount of roster syncing would produce one. See ADR-0012 for what the
  Basecamp integration does and does not know about a person.
