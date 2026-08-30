# Handoff: grill session for the real Discord shell

Paste to start the session (from the odt-ville repo root):

---

Grill me about the implementation plan for the real Discord Activity shell.

Read these first, in order:

1. `docs/adr/0022-discord-activity-is-a-second-shell.md` — the decision:
   second shell in this repo, map-per-server, no hometown, voice is
   Discord's via the VoiceHandle seam, Discord OAuth → our own session.
2. `../odt-ville-discord-spike/SPIKE.md` — what a working spike proved
   end-to-end on 2026-08-30, and the binding gotchas (webview module-cache
   mixing, Keycloak issuer from Host header, OAuth redirect URI required,
   emoji-prefixed channel names).
3. `CONTEXT.md` sections "Architecture intent" and "Domain modules" — the
   seams the shell must reuse (game black box, kernel, maps, communities)
   and the arch firewall (`pnpm arch`).

The spike code lives in `../odt-ville-discord-spike/` (disposable clone;
key files: `frontend/src/discord/*`, the `voice/write.ts` branch, the
`discordSpikeEndpoints` vite plugin, `frontend/vite.config.js`). Steal
patterns, not code.

Open decisions to grill me on until each is resolved:

1. **Identity**: Discord user id → which table? New `discord_id` on
   `Auth::User` vs a linking table? Provisioning on first launch? Email
   linking stays deferred until compulsory content enters this surface —
   confirm.
2. **Server→map registry**: how a guild id maps to a Site and a map slug.
   Where stored, who administers it, what happens on an unknown guild.
3. **Bot service**: the spike ran token exchange + Move Members inside a
   vite dev plugin. Where do these live for real — Rails endpoints? A
   separate small service? Where does the bot token live?
4. **Shell packaging**: second Vite entry vs route split; keeping
   admin/editor/Keycloak/LiveKit out of the Discord bundle; how `pnpm arch`
   rules extend to `src/discord/`.
5. **Spawn + hop UX**: arrive inside the meeting room after a bot move
   (not map centre); who posts the re-open link after a channel hop
   (bot on voice-state change?); meeting-zone → channel mapping (today:
   one hardcoded target channel by name).
6. **Feature cut**: which of standees / encounters / boards / card badges
   exist on the Discord surface at v1. Default: none — presence and
   meetings only. Challenge me if that's wrong.
7. **Deploy**: prod build hosting behind the URL mapping (hashed assets
   make the cache issue moot), env/secrets handling, one Discord app per
   env or shared.

Rules: one decision at a time, push until each is concretely resolved
(schema, file, owner), write resolved decisions down as we go, and end by
turning the resolved plan into tracker issues (tracer-bullet slices).

---

Housekeeping owed before real work: rotate the Discord bot token and OAuth
client secret in the developer portal (they transited a chat session).
