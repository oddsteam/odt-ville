# The hometown is site-scoped per user, gated by a fail-closed staff signal

The hometown stops rendering one shared building set and renders **per user**:
an ODDS employee sees the buildings for the client Sites they are placed at plus
**downtown**; an external **Client** sees only their one Site's buildings and
never downtown. This is a whitelist — there is no "visible to everyone" scope,
because such a scope would leak company content to Clients.

## Decision

- **A community carries a `site` scope.** A nullable `site` string on
  `houses` (FK-less by name, per the soft-seam rule — not a hard FK into
  `org_sites`): `NULL` → downtown, a name → that one Site. One scope per
  building. Today's company-wide communities all become downtown-scoped, and a
  new community defaults to `NULL` = downtown, which is the safe default (Staff
  see it, Clients never do).

- **Staff vs Client is decided fail-closed at login, from a Company-owned
  email domain.** Staff status must be *positively proven*: the login email's
  domain must match one of the user's `Org::Company` staff domains, held as data
  in `org_company_domains` (unique on `domain`), never a hardcoded constant.
  Unproven → Client. The result is stored explicitly as `external` on
  `Auth::User`, set at provisioning and admin-flippable — so the downtown gate
  is decided at first login and never waits on a Site being assigned.

- **A Client's Site membership lives on `Auth::User`, not `Employee`.** Effective
  sites = staff `employee.sites` (sync-owned, ADR-0016) ∪ a Client's
  admin-assigned `client_site`. The roster sync replaces `Employee.sites`
  wholesale and would wipe an in-app assignment, and a Client is not on the
  roster at all.

- **Clients are pre-provisioned by email before login,** in the existing users
  console — an `Auth::User` with `external` + `client_site`, mirroring how an
  `Employee` may exist before a `User`. Every Client Site is guaranteed ≥1
  building. The normal flow therefore never hits an empty town; a never-invited
  external is the only empty case and gets a plain "not placed yet" line from the
  shell, not a generated ghost town.

- **Enforcement is server-side, on the hometown read.** The communities list is
  filtered by the caller's effective sites and `external` flag before it reaches
  the client; the game black box still receives only a list of buildings and
  learns nothing about identity. The admin CRUD read is unfiltered.

## Considered options

1. **Derive Client-ness from `has no Employee` or from `has a Site`.** Rejected:
   a new hire has no Employee, and a Client's Site is assigned after first login —
   both leave a window where a Client is treated as Staff and sees downtown.
   Classification must be an explicit, login-time flag.

2. **Hardcode the ODDS staff email domain.** Rejected: multi-org is on the
   roadmap, so the staff domain must be per-Company data. The same table becomes
   the future domain→tenant router.

3. **A Keycloak group/role as the staff signal.** The canonical access boundary,
   but the realm defines no such group today and it would need a one-time `kcadm`
   assignment to every existing employee. Domain-as-data classifies all staff
   with no per-user Keycloak change; the group remains a later option.

4. **Assign the Client's Site on a hand-made `Org::Employee`.** Rejected: it
   pollutes "Employee = person on the ODDS roster" and risks the sync's
   replace/departure logic touching it. The User-link keeps the two populations
   cleanly separated.

## Consequences

- `downtown` was briefly an overloaded word: the **Scope** here vs an authored
  `downtown.json` travel-map sample. Resolved in [ADR-0021](0021-downtown-means-the-scope.md):
  they are deliberately separate, and the sample was renamed to `sampletown` so
  `downtown` unambiguously means the Scope.
- The hometown gains its first per-user input on the server side. The generated
  producer stays identity-blind — the filter runs before the list reaches it.
