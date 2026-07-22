# Voice media rides a LiveKit SFU, not a peer mesh; Cloud first, a VPS as the exit

Proximity voice (#159) was built as a hand-rolled peer-to-peer mesh: one
`RTCPeerConnection` per peer inside `VOICE_RADIUS`, SDP/ICE over an
authenticated ActionCable relay (#279), mic consent and track-level mute
(#282), TURN credentials read from env into `iceServers` (#283) — roughly 900
lines under `frontend/src/voice/`. Media never touches the app server; only the
handshake does.

It does not work today, and #290 established why it cannot be made to work on
the infrastructure we have. The homeserver sits behind **residential NAT with a
dynamic public IP**, fronted by a Cloudflare tunnel — and a tunnel proxies
HTTP/named-TCP, not TURN's directly-reachable `ip:port` plus a dynamic UDP
relay range. Strict-NAT clients (~15%) have no relay, and we cannot host one
where the app lives.

That is the fact that forces this decision: **NAT traversal must be bought from
somebody either way.** The choice was never "own it or outsource it." It is
"outsource TURN and keep the mesh" versus "outsource the media plane."

Two further pressures decide it:

- **Screen sharing is on the roadmap.** A mesh uploads one copy per peer, so
  sharing to a full pod is 5× a video stream off a domestic uplink. That is a
  topology limit; no relay fixes it.
- **`POD_CAP = 6` is not a product decision.** It exists because a mesh cannot
  afford more uplinks. In a plaza of twelve you hear an arbitrary six.

## Decision

- **The media plane moves to LiveKit**, the open-source SFU. `mesh.ts`,
  `iceConfig.ts` and the signalling half of `write.ts` go; the ActionCable
  relay channel goes with them.
- **LiveKit Cloud to begin with.** Hosting is a *deploy* decision, not an
  architectural one — LiveKit Cloud runs the same Apache-2.0 server we would
  self-host, with the same SDKs, API and token format.
- **Portability is a constraint, not a hope.** Three rules keep the exit open:
  1. Room tokens are minted **in Rails**, from an API key/secret in env.
  2. The LiveKit URL lives in env, as `VITE_TURN_URL` already does.
  3. Proximity stays ours — `podFor` computes who is audible and at what gain.
     It is never expressed through a vendor mechanism, and no Cloud-only
     surface is allowed to become load-bearing.
- **Room membership is gated on proximity, not on map entry.** LiveKit bills
  *connected participant-minutes*, not speech: two people standing silently in
  a room cost the same as two people arguing. `voiceSession.open` fires on map
  entry today, which is the expensive shape. Join when `podFor` first returns a
  peer; leave when it empties.
- **With hysteresis, because a single radius thrashes.** Someone pacing across
  the boundary would otherwise reconnect repeatedly — clipped first words, and
  a fresh billable session each time. Three radii, not one: **pre-join**
  (connect early so the first word survives), **audible** (`VOICE_RADIUS`, where
  `podFor`'s gain math applies unchanged), and **leave** (beyond audible, after
  a dwell timer). This deliberately decouples *connected* from *audible*, which
  the mesh conflates.
- **The pre-join band is derived from join latency, not picked as a tile count.**
  What matters is *lead time*: enough seconds to complete a room join before the
  peer becomes audible. So the band is `walk_speed × join_latency`, rounded up —
  a number #297 measures rather than one this ADR asserts.

  This matters because `VOICE_RADIUS` is being tightened to **2** (from 6) so
  people stop stepping into conversations by accident, and the two do not scale
  together. Scaling the band proportionally would leave under a tile of lead —
  almost certainly less than a room join takes. Held at constant lead time
  instead, the band overshoots a 2-tile audible radius *proportionally much
  further* than it did a 6-tile one.

  That is a real tension to hold consciously: a tighter audible radius buys
  fewer accidental pods, but forces the connected set to reach proportionally
  further past it, which gives some of the cost and privacy saving back. The
  saving is still real — connections track people who are genuinely close — but
  it is smaller than the radius change alone suggests.
- **Revisit when any of these trip** — stated now so the spike does not quietly
  become the deployment:
  - the monthly bill exceeds the cost of the VPS it would replace;
  - screen share ships (it changes the bandwidth arithmetic);
  - voice transiting a third party becomes unacceptable for this app's content.

## Considered options

1. **LiveKit Cloud, portable by construction** (chosen) — removes the
   reachability problem outright (clients dial out to 443; nothing inbound),
   unblocks screen share, deletes ~900 lines, and costs no ops. Pays a metered
   bill for a usage profile that is not ideal for metering (below).
2. **Keep the mesh, buy metered TURN** (Cloudflare Realtime TURN, Twilio NTS,
   Metered) — the smallest possible fix for #290: three env vars, no rewrite,
   and idle co-presence stays free. Rejected because it buys nothing beyond
   today's ceiling: screen share stays impossible, `POD_CAP` stays a bandwidth
   surrender, and we still maintain the whole handshake ourselves. Since a
   third party is being paid either way, this pays for strictly less.
3. **Self-host LiveKit on the homeserver** — rejected outright, and worth
   recording so it is not re-proposed: it reproduces #290 exactly. LiveKit needs
   publicly reachable media just as coturn does, so residential NAT plus the
   Cloudflare tunnel defeats it identically. This option looks like it removes
   the vendor and in fact removes nothing.
4. **Self-host LiveKit on a VPS from day one** — viable, and probably the
   eventual home (see Consequences), but rejected as the *starting* point. The
   uncertain part of this migration is whether proximity feels right on an SFU,
   not whether we can run a container; paying for that answer with ops setup
   first is the wrong order.

## Consequences

- **Media stops being peer-to-peer.** This reverses a property `mesh.ts`
  documents deliberately: *"audio never touches the app server."* Voice will
  transit LiveKit. E2EE via insertable streams exists if that becomes
  unacceptable, at real complexity cost. This is a conscious trade, not a side
  effect.
- **Idle co-presence stops being free.** With a mesh, two colleagues working
  quietly in the same corner for an hour cost nothing. On a metered SFU they
  are two participant-hours for zero speech. Proximity-gated membership plus
  hysteresis is the mitigation, and it is why cost scales with *people near
  each other*, not with people logged in. This is the weakest point of the
  decision and the most likely revisit trigger.
- **A VPS is the likely destination, not a fallback.** Flat hosting cost makes
  idle free again, which fits this app's ambient, mostly-quiet usage better than
  metering does. #290 already put a VPS on the table for coturn; running LiveKit
  there instead collapses two problems into one box.
- **`POD_CAP` becomes a product choice.** On an SFU you subscribe selectively;
  six stops being a bandwidth ceiling and starts being a decision about how many
  voices are legible at once.
- **It fixes the authorization hole from #279.** Per-target `accessible_to?` was
  uncomputable — roles live in the JWT, not the DB, so the backend can only
  authorize the *connecting* user. Room tokens are minted server-side for
  exactly that user, with grants. "Who may join this map's voice" becomes a
  question we can answer.
- **#283 and #290 are superseded**, not completed. No coturn, no VPS-for-TURN,
  no `VITE_TURN_*`.
- **`podFor`, `micState`, `MicIndicator` and `VoiceMeters` survive unchanged.**
  LiveKit's per-participant volume control is a direct fit for `podFor`'s
  existing `gain`, which is what #281 asks for.
