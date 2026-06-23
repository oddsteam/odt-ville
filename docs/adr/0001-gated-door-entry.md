# Gateable door entry, gated by an external posture-verification service

Issue #22 asked for a defined stop/entry spot at a house door instead of the
avatar clipping *under* the building. Resolving it surfaced a larger decision:
some houses must run an **entry gate** the player has to pass before entering.
The first gate is [posture-login](../../../posture-login) — a standalone,
OAuth-style service where the credential is a MediaPipe hand shape proven on the
service's own hosted page.

## Decision

- **Door entry is a *gateable* interaction, not a binary cut.** A house carries
  an optional `entryGate` (`{ gate, postureSetId }`). No gate → today's immediate
  town→interior transition, unchanged. The pure `townInteractionsAt` reports the
  gate on the `enterCommunity` outcome; the scene branches on it.
- **The Phaser game stays a black box.** On a gated door it stops the avatar in
  the doorway, pauses input, and emits `requestEntry({ communityId, gate })`. It
  never knows what posture-login is; it only later receives "approved → enter" or
  "denied → release."
- **The Rails backend owns the secret half.** Per posture-login's contract, the
  `client_secret` is server-only. Rails starts the verification
  (`POST /api/verifications`) and confirms it server-to-server
  (`POST /api/verifications/{session_id}/result`), unlocking only on
  `status == "passed"`, and records the grant. This mirrors the unit-tested
  `examples/demo-game-app/gate.ts` in the posture-login repo — port its shape
  rather than reinvent it.
- **The React shell orchestrates the browser handoff via a popup.** It asks Rails
  to start, `window.open`s the returned `hosted_url`, receives the result by
  `postMessage` from the callback page, has Rails confirm, then resumes the scene
  (enter on pass, release on fail). A popup keeps the Phaser scene mounted and
  paused rather than tearing it down with a full-page redirect.

## The depth half (issue #22 proper)

The "walking under the building" read is a depth bug: the door tile is the
bottom-centre tile of the 3×4 footprint, and the building sprite draws at
`(row+h)*10-1`, four levels above the player's `row*10+5`. Fix: when the
destination of a step is a door tile, elevate the player's depth above that
building **at the start of the entering step** (not on arrival), so the avatar
rises into the doorway already on top and never slides under. This ships
independently of the gate wiring.

## Consequences

- The visual half (stop + depth) and the seam (`requestEntry`) ship under #22;
  the posture-login integration (Rails endpoints, credentials, popup, grant
  storage) is a separate PRD/issue.
- Per-house data carries a `postureSetId`, so different houses can demand
  different postures. The grant is stored server-side so a page reload doesn't
  re-prompt mid-session; "once per session vs every entry" is a product decision
  still open.
- Trust rests on the server-to-server status check — no signed token. A
  compromised service could lie. Deliberately weak, fine for a fun in-game gate
  (see posture-login ADR-0005).
