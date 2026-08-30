# The Discord version is a second shell: map-per-server, no hometown, voice is Discord's

We are building a Discord Activity version of the game so that voice, camera,
and screen share ride Discord's infrastructure instead of our LiveKit SFU
(ADR-0011) — the single most expensive piece we run. A two-week spike
(`odt-ville-discord-spike`, 2026-08-30) proved the full chain inside a real
Activity: launch through Discord's URL-mapping proxy, the authored map
`office-ktb` rendering in the black box, ActionCable presence between two
users, and walking into a Meeting Room zone moving the player's **real Discord
user** between voice channels via a bot with Move Members.

## Decision

- **The Discord version is a separate product surface, not a port.** It does
  not render the hometown and carries none of ADR-0020's per-user site
  scoping. One Discord server maps to one Site; one authored map per server.
  Being in the server IS the scoping — guild membership replaces Effective
  Sites for this surface. The full app keeps hometown, boards, acks, admin,
  editor, roster sync, Keycloak — unchanged.
- **It lives in this repo as a second shell**, beside the existing pages, on
  the seams that already exist: the game black box takes props and emits
  events; `communities`/`maps`/`kernel`/`catalog` are reusable from any shell
  (CONTEXT.md, "Architecture intent"). Repo extraction is deferred, not
  rejected — the ratchet rule: split only when the second shell causes real
  friction. Until then a fork would rot the one contract the two products
  share forever: the editor authors map documents here, and the Discord
  version renders them.
- **Voice is Discord's; the `VoiceHandle` port is the seam.** The spike
  swapped `connectVoice` for a Discord adapter: the scene feeds it the
  player's tile (unchanged), the adapter resolves ADR-0004 meeting zones via
  the existing `resolveRoom`, and a bot moves the user between voice
  channels. LiveKit, the meeting HUD, camera, and screen share do not exist
  on this surface — Discord provides them natively. #464 (proximity voice) is
  answered by the platform here: channel = room, no proximity audio.
- **Identity: Discord OAuth (`identify`) → our own session.** The spike used
  seeded dev users; the real shell maps a Discord user id to one stable app
  user. Email→Employee linking (the full app's join key, ADR-0016) is needed
  only if compulsory content ever enters the Discord surface — deferred with
  it.

## Consequences

- The channel-hop seam is accepted, not fought: a bot move closes the
  Activity in the old channel and re-opening costs one click. Design promises
  "see everyone, one click to be with them" — never Gather-style seamless
  walking. Softener if wanted later: a voice bar fed by the SDK's
  SPEAKING_START/STOP events.
- Two shells, one team: drift between them is the standing risk. Defense is
  the existing `pnpm arch` firewall and the black-box prop contract; shared
  code changes must stay behind those seams.
- Spike lessons that bind the real build (`odt-ville-discord-spike/SPIKE.md`):
  Discord's webview caches dev modules across vite dep re-optimizations and
  will mix two Phaser copies (dev serves `Cache-Control: no-store`; hashed
  prod builds are immune); Keycloak stamps the token issuer from the Host
  header (proxy with changeOrigin); the OAuth code flow requires a registered
  redirect URI even though Activities never redirect; channel names carry
  emoji prefixes (match by inclusion).
- Open, deliberately: spawn position after a bot move (arrive inside the
  meeting room, not at map centre); Activity re-open UX after a channel hop;
  whether the Discord shell ever needs the standee/encounter feature set.
