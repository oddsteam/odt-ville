# Cards: a vendor-neutral ingest contract; Eira is the store of record

Cards (#317, #318) put a badge over a peer's head saying what they are working
on right now. The facts come from Jira today — but odt-ville never talks to
Jira. **Eira** (the org's Jira→Discord bridge) pre-resolves everything and
speaks to us in a three-string vocabulary. This ADR records where the vendor
is allowed to exist, because the constraint is invisible in any single file:
not every node runs Eira (client-facing teams may adopt Jira directly, or
another tool entirely), and the day that happens must be a small change, not
an untangling.

## Decision

### The card is three strings, and that is the whole domain model

```
{ title, status, url } | null
```

`null` means "holding no card" — indistinguishable from "the source has never
heard of them", deliberately. The ingest controller whitelists exactly these
fields as strings (`events_controller.rb` `FIELDS`); the payload crosses a
trust boundary, so nothing else reaches the browser. The frontend keeps the
vendor out structurally: `statusColor` hashes the status string to a hue
rather than mirroring any workflow enum, and `cardHref` refuses non-http(s)
values before they reach `window.open`.

### Inbound: `POST /api/v1/cards/event`, named for us, open to any tool

The push half is **vendor-neutral on purpose**:

- The route, controller and stream say `cards`, never Eira.
- The credential is `ODT_VILLE_INGEST_TOKEN` — our name, a shared
  service-to-service bearer, never a user session. Fails closed: an
  unconfigured token rejects everything.
- The join key is `email`, downcased, against `Auth::User`. An email we don't
  know is a quiet 204 no-op — the source tracks more people than the world
  holds, and that is its business.

Consequence: a team that adopts Jira, Linear, or a shell script gets cards by
pushing this contract with a token and a URL — **zero odt-ville code changes**.
When a second source appears, mint it its own token; the endpoint does not
care who is calling, only that the bearer matches.

### No persistence: an in-memory registry, because Eira is the store of record

Cards live in `Cards::Registry`, a process-local map — no table, no
migration, no `eira_*` column anywhere. Mirroring the board into Postgres
would buy restart-survival and cost a second copy to keep honest; instead a
restart loses the picture and the next world entry rebuilds it. There is
nothing to migrate, backfill, or GDPR-scrub when a source is added or
removed.

### Outbound: the one Eira-named edge, behind one seam

Events only carry changes going forward, so world entry does one bulk read of
the board (#318): `Cards::Seed.run` → `Eira::Client#lookup` (`POST
/cards/lookup`, `EIRA_SERVICE_TOKEN`, `EIRA_URL`). This is the **only place
the vendor is a named thing in code**, and it is reached through exactly one
indirection — `Cards::Seed.client_factory`, swappable like
`ApplicationController.claims_resolver`. Replacing the seed source is either
repointing `EIRA_URL` at anything that answers `{emails: [...]}` with
`{email => card|null}`, or one new client class and a factory reassignment.

The seed runs inline on the cable thread at subscribe, bounded by 2s/5s
timeouts and degrading to `{}` on any failure — a slow or absent Eira costs an
arriving player a blank badge, never a hung join. Known trade-off: join
latency depends on Eira's *latency* (not its correctness); move the seed
off-thread if that bound is ever felt.

### Absent configuration is a feature, not an error

Both tokens blank → no outbound call, every ingest 401s, the registry stays
empty, presence frames carry `card: null`, and `setPeerCard` early-returns.
No badges, no errors, no logs to page anyone about. A node whose team uses no
tracker runs this code path forever and never knows cards exist.

## Consequences

- The vendor boundary is a namespace: `Eira::` appears in
  `app/clients/eira/` and in `Cards::Seed`'s factory default, nowhere else.
  A PR that imports `Eira::Client` from a controller, adds an `eira_*`
  column, or grows the card beyond three strings is changing this decision
  and must say so here first.
- Multi-source is already cheap on the push side (per-source tokens) and
  one-seam on the seed side. What this ADR does **not** solve is per-team
  routing — if two sources ever claim the same person's email, last write
  wins; partitioning the registry by source is a new decision.
- No table means no history: the badge is ambient presence, not a record.
  Anything that wants "what was X working on last Tuesday" asks the store of
  record, not us.
- Frontend and presence stay vendor-blind: every `Eira` string in
  `frontend/src` is a comment, and the dependency-cruiser model needs no rule
  because there is no vendor module to fence — keep it that way.
