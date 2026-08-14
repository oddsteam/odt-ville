# The org roster is a read-model keyed on email, fed by a replaceable upstream

ADR-0010 reserved an `org` module and declared the app a *downstream consumer*
of org data, but left the first real tables unbuilt. The need that forces them:
people must be assignable to things — sites today, teams and communities later —
**before they have ever logged in**, which a Keycloak-provisioned `Auth::User`
cannot express (a user row appears on first login, and roles live in the JWT,
not the database).

The upstream is in flux. Today the roster is reachable as a one-off authenticated
export from `talent.odds.team` (378 active + 136 archived people); the intended
long-term source is an employee-directory service publishing over a message
queue, which does not exist yet. Whatever we build now must survive that swap.

## Decision

- **`Org::Employee` is the person; `Auth::User` stays the login.** New tables
  `org_employees`, `org_sites`, `org_employee_sites`, plus a nullable
  `users.employee_id`. Either side may exist alone: an Employee with no User has
  not logged in yet; a User with no Employee is not on the roster. Assignments
  hang off Employee, never off User.

- **Lowercased email is the only key.** No `source_id` column on any table;
  sites are keyed by name. Upstream record ids (talent's numeric `id`, its site
  ids) are read during import and thrown away, because the directory service
  will not reissue them. Email is already the join key for `Auth::User`
  provisioning and `Basecamp::AvatarSync` (ADR-0012), so the roster shares one
  identity seam with everything else. Linking runs in two places behind one
  method — a backfill during sync, and the existing
  `find_or_provision_user` login path — so nobody waits for a re-import to be
  connected.

- **A Site is a client engagement, and placement is many-to-many.** Sites carry
  `kind: client | internal`. `org_employee_sites` is an unordered set with no
  primary: a person split across two clients is normal and neither is ranked.

- **Sync replaces; the app never authors org data.** Each run replaces an
  Employee's site set from the payload. Consequently the admin roster page at
  `/admin/employees` is **read-only for sites** — assignment happens upstream, and
  offering it here would create edits that the next sync silently destroys.
  Departures are a fact on the row, not something the importer infers from
  absence: which upstream list a person came from sets it, and `left_on` takes
  `resignation_date` falling back to `archived_at` — four archived people carry
  no resignation date, so a date alone cannot express "departed".

- **The importer is scaffolding and is scoped as such.** A rake task reading a
  gitignored JSON fixture — not a client, not a cron. `oddsteam/odt-ville` is a
  **public repository**, so 514 real names and emails may never enter git, and
  talent's credential is a 7-day user-scoped JWT that no unattended job could
  hold. The tables and the linking are the durable part; the loader is expected
  to be deleted when the message-queue consumer lands.

- **Only what the village uses is copied.** `national_id` (Thai national ID),
  home address, phone, `discord_id`, day rate and resignation reason are read
  past and discarded. `profile_image_url` is skipped too: `Basecamp::AvatarSync`
  already owns `users.avatar_url` and stays the single writer.

## Considered options

1. **Mirror the upstream tag model (`org_tags` + `org_employee_tags`).** Talent
   stores site, team, skill, area, movement, COP and Project as one polymorphic
   tag table, so mirroring it would have imported all seven types for free and
   never drifted. Rejected: it is anemic — a Site that owns nothing has nowhere
   to hang a map, a house or a voice room — every query filters on a type
   string, and `tag` would enter the ubiquitous language as a term no domain
   expert uses. Typed tables are adopted one at a time, as features need them.

2. **Key on the upstream's record id.** Talent exposes a stable unique `id` per
   employee and per site, which would have made the import trivially idempotent
   and resolved the one case-variant duplicate email
   (`teeratorn.r@` / `Teeratorn.r@`) as two distinct people. Rejected: it keys
   the schema to a source we intend to remove, and the duplicate is better
   collapsed than preserved.

3. **Let odt-ville own site assignment, with the import seeding once.** Directly
   contradicts ADR-0010's "never master org data in this app" and produces two
   authorities that drift invisibly. A variant — marking rows `talent` vs
   `manual` and replacing only the former — was rejected as reconciliation
   machinery bought before any feature asked for it.

4. **A `Talent::Client` + cron, following the Basecamp precedent (ADR-0012).**
   The right shape for a permanent integration, and wrong for this one: talent
   issues no service credential, and the work would be discarded when the queue
   consumer replaces it.

5. **Extend `Auth::User` instead of adding Employee.** Cheapest schema, but a
   user row cannot exist before first login, which is the entire requirement.

## Consequences

- People can be assigned before they log in, and the server can finally answer
  membership questions about *someone else* — the gap that made per-target
  `accessible_to?` uncomputable while roles lived only in the caller's JWT.
- The roster is a lossy read-model on purpose: it cannot answer HR questions,
  and should never be extended to.
- Swapping talent for the directory service is a new consumer writing to the
  same tables on the same keys — no migration, no backfill of identifiers.
- 139 of 378 join dates upstream are `2024-01-15`, a bulk-backfill placeholder.
  They are copied verbatim; the roster is as accurate as its source and does not
  pretend otherwise.
- **One email means one Employee, so rehires collapse.** Four people appear in
  both upstream lists with two employment spells (`waranyah@`, `sasi@`,
  `mintra.nank@`, `teeratorn.r@`); the importer keeps the latest `join_date` and
  treats presence in the active list as current. Employment *history* is
  therefore not representable — deliberately, since nothing in the village needs
  it. A future need for spells means a separate table, not a second Employee.
- **Upstream carries test accounts** (`john.doe@`, `j.doe@`, `jdai@` — 7 rows).
  The importer skips them by an explicit exclusion list rather than a
  clever heuristic, so the rule is visible and reviewable.
- `org` gains its first frontend directory (`src/org/`), which ADR-0010
  anticipated. Team, department and community assignment are deliberately out of
  scope until Site proves the shape.
