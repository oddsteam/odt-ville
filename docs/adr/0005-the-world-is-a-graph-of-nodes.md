# The world is a graph of Nodes connected by Portals

ADR-0004 settled that there is "one runtime map shape, two producers," and that
everything placed on a map is a Prop, a House, or a Zone. It stopped at a single
map. But the product is not one map — it is communities you enter, interiors
that can themselves lead onward, posture-gated doors, and per-space multiplayer.
Working through "an admin sets a board URL" unspooled the whole thing: a door is
just travel to another map; every map is authored; a community is an entrance
*plus* the map behind it; that map can contain another entrance; and any map can
be multiplayer or single-player. The pieces kept recursing, which is the tell
that the world is a **graph**. This ADR fixes the vocabulary and the primitives
so the editor, the runtime, and the data model share one language.

## Vocabulary

- **Node** — a place in the world. Its content is exactly one authored Map
  (tiles + objects). Node and Map are **1:1**: a Node *is* its map. Identity is
  the map `slug`.
- **Portal** — a directed connection from one Node into another: the thing the
  avatar walks into to travel. A Portal is the graph's *edge*. (We say "edge"
  only conceptually; the code word is **Portal**, because "edge" already means
  tile autotiling in this codebase — `edge_mask`, `EDGE_CORNERS`.)
- **Zone** — an *interactive* object placed in a Node: a region with a `trigger`
  and a `payload`, surfaced through one `onZone(trigger, zone)` channel. A
  Portal is itself a Zone (the travel payload); a board, an encounter, and a
  trainer are other Zones.
- **Prop** — a *non-interactive* object placed in a Node: decorative, never
  reaches the event channel (may still animate).
- **Cluster** — a named group of Nodes. The Node a Portal lands on is the
  cluster's **entry node**; other nodes are reached by Portals within the
  cluster.
- **Community** — a *designation*, not a primitive: a Cluster reachable by a
  Portal from the town hub and owned by a team. (Graph theory already calls a
  cluster of nodes a "community" — the word fits the math.) Deeper clusters that
  are not hub-level team spaces are just Clusters.

## Decision

- **The world is a directed graph: Nodes connected by Portals.** Traveling is
  edge traversal; authoring the world is adding Nodes and Portals. There is no
  "interior," "room," or "community" *type* — those are positions in the graph.

- **A Node is an authored Map, 1:1.** Every place — the town hub, a community
  lobby, a back room — is a Map produced by the ADR-0003/0004 pipeline and
  rendered by the map-agnostic runtime (`MapScene`). The hardcoded
  `InteriorScene` (a fixed 11×8 room with three welded-in boards) is the v0 of a
  Node and converges onto the authored-map runtime — the interior counterpart of
  #81's "converge the generated hometown onto the shared producer."

- **A door is a Portal, and entering it is travel — not a bespoke `enter`.**
  Its payload is `{ kind: "portal", targetNode, entrySpawnId }` (the directed
  shape already in #84). Walking onto a house door loads that house's Node and
  spawns the avatar at its entry point. One Node is loaded at a time (which
  already matches `InteriorScene`'s `scene.start` hand-off).

- **Interactive objects are Zones with a self-contained payload, dispatched by
  `payload.kind`.** The shell maps `onZone` to behaviour the way it maps
  `house.type → detail component`; the renderer never branches on object type.
  Initial kinds:
  - `portal` — `{ targetNode, entrySpawnId }`: travel (the door).
  - `link` — `{ url, label }`: open an external page. **The board.** Authoring
    "three boards into one" means a Node carries one `link` Zone instead of the
    three hardcoded boards.
  - `boards` — `{ boardType }`: open an in-app board's content items (today's
    `openBoard`), preserved for communities that author content in-app.
  - `encounter` — `{ pool }` (#87), and onward. *Field renamed from the
    original `tableRef`: "pool" is already this codebase's word for the
    weighted wild set (`GET /api/v1/monsters/pool`, `Monster.enabled_rate_total`,
    `pickWild(pool)`), while "table" named an implementation detail and `Ref`
    was noise the sibling payloads don't carry.*
  - `trainer` — the duel behind an `on_sight` cone (#259). Listed here because
    the vocabulary above already calls a trainer a Zone, while this list
    originally omitted it: #86 landed `on_sight` as a trigger with no payload
    that could carry what it challenges you with. A trainer is its own kind
    rather than an `encounter` variant because an encounter pool is a spawn
    rule and a trainer is a character with identity.

    The payload is `{ npcId }`, referencing a **`Catalog::Npc`** row — the
    catalog holds *who they are* (name, sprite), the payload holds *what they
    do to you*. Named NPC rather than Trainer because duelling is a role, not
    an identity: the same row can be placed as a wandering NPC or a
    quest-giver, and the runtime already buckets the sprite as `devLayers.npc`.
    Per ADR-0008 the ref is a catalog row id, like `PlacedEntity.object_id` —
    a placed character resolves its art the same way a Prop does.

- **`trigger` is a closed enum, extended as mechanics land:** `on_enter` (step
  onto the region — Portals, encounters; #85), `on_sight` (facing cone; #86),
  `interact` (press a key while facing it — boards; the existing `pressA`). #85
  should land `trigger` as an enum, not a bool, because `interact` arrives with
  it.

- **Properties live where they belong.** A **Node** carries `multiplayer` and an
  access policy (#83/#88/#91). A **Portal** carries an optional posture-login
  gate (#24/#38 `entry_gate` / `posture_set_id` move off the House and onto the
  Portal). **Cluster** membership (and which node is the entry) is metadata over
  Nodes — a label, not a new aggregate.

- **Authoring writes through the surface that owns the element.** The map editor
  authors a Node's tiles, Props, and Zones (including each `link` Zone's URL) and
  the Portals leading out of it. The communities admin (`/admin/communities`)
  manages the hub-level Clusters: which Node a community's hub Portal lands on,
  and the Portal's gate. Both write the same self-contained Node / Portal / Zone
  shapes.

## Considered options

1. **Community / interior / room as distinct types** — each with its own table
   and render path. Rejected: it is exactly the per-kind branching ADR-0004
   exists to remove, and it cannot express recursion (an interior that leads to
   another interior).

2. **The door opens content directly** (e.g. a `board_url` on the House, or the
   door opening the URL). Rejected: it solves one object on one fixed room and
   forbids the authored, possibly-onward-connected space the admin actually
   wants. The door *enters a Node*; the board is a Zone *inside* it.

3. **A Node is a thin identity that points at a separate Map record.** Set aside,
   not rejected: the only thing it buys over 1:1 is creating a Node before its
   map is authored. The "a community spans several maps" case does **not** need
   it — that is a Cluster (many Nodes), not one fat Node. Keep 1:1; revisit only
   if author-before-content becomes a real need.

4. **A bespoke event per mechanic** (`onPortal`, `onBoard`, `onEncounter`).
   Rejected: "branch per kind" again — one `onZone` dispatched on `payload.kind`
   keeps the shell and renderer closed to new object kinds.

## Consequences

- **Today's House / Community / Interior collapse into Node + Portal + Cluster.**
  A `House` becomes a Portal (placed on the hub Node) plus the Node it targets;
  `entry_gate` / `posture_set_id` move onto the Portal; the hardcoded interior
  becomes an authored Node; "community" becomes a hub-adjacent Cluster.
  `user_location_states` (`last_area` / `last_house_id` / `last_room`) reframes as
  "which Node the avatar is in."

- **The roadmap's open tickets line up under this model:** #85 = the Zone +
  `onZone` channel + `trigger` enum; #84 = the `portal` payload (now also the
  town→Node door); #86/#87 = further triggers/payloads; #83/#88/#91 = Node
  properties; #89 + the editor slices = the producer that authors Nodes.

- **The in-app board system (Boards, ContentItem, read/ack) is untouched** and
  remains the `boards` payload behaviour. External (`link`) and in-app (`boards`)
  boards coexist, chosen per Zone.

- **A new word, `Cluster`, enters the model** for multi-Node communities, with a
  designated entry node. It is membership metadata, so it costs a label on a
  Node, not a render path.

- **`InteriorScene` is on a path to deletion**, replaced by `MapScene`-rendered
  Nodes. Until then it is the v0 Node; the seam is the door's `portal` payload.
