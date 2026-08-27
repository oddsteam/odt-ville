import Phaser from 'phaser'
import { preloadBakedMap, renderBakedMap } from '../../../kernel/mapRenderer.ts'
import { MOVE_MS, TILE } from '../../constants.js'
import { cameraBounds } from '../canvasLayout.ts'
import { isTransitioning } from '../../transition.ts'
import { spawnTile, mapWalkable, entityBlockedFor, entityEdgeBlockedFor, entityDoorCells, entityLadderFor, entityOverhangFor, entityForegroundFor, mapPlayerDepth, slidePlayerDepth, peerDepth, peerSlideDepth, feetWorldXY, MAP_NAMEPLATE_DEPTH } from '../mapWalk.ts'
import { spawnNpcs, npcBlockedFor, sortNpcs } from '../mapNpcs.ts'
import { preloadStandees, spawnStandees, sortStandees, standeeAt, placardOf, addStandee, restandeeRigs, expiredStandees, cutout } from '../mapStandees.ts'
import {
  CHAR_SHEET_KEY,
  preloadCharacter,
  queueCharacterSheet,
  buildCharacterRig,
  characterScale,
  peerSheetKey,
  applyFacing,
  applyPeerRig,
} from '../characterRig.js'
import bus from '../bus.js'
import { deltaFor, resolveDirection, stepTile } from '../movement.ts'
import { applyFrame, pruneOutOfRange } from '../../presence.ts'
import { applyStandeeFrame } from '../../standees.ts'
import { loadAvatar } from '../peerAvatar.ts'
import { updateProximityStamps } from '../../../kernel/entityLoader.ts'
import { badgeText, cardHref, statusColor } from '../cardBadge.ts'
import { interactZoneEvents, sightZoneEvents, zoneEvents } from '../../../kernel/zones.ts'
import downStill from '../../assets/character/rpg-char-01/r0-c0.png'
import leftStill from '../../assets/character/rpg-char-01/r1-c0.png'
import rightStill from '../../assets/character/rpg-char-01/r2-c0.png'
import upStill from '../../assets/character/rpg-char-01/r3-c0.png'

// Bundled still frame per direction — the no-manifest fallback. This game
// instance boots without TownScene, so the walk strips it loads aren't in the
// texture cache; stills are enough for the movement tracer.
const STILL_URLS = { down: downStill, left: leftStill, right: rightStill, up: upStill }

// The nameplate band, above a peer's head — where the name label hangs and the
// face chip (#323) sits on top of it. Peers only: our own character needs no
// label telling us who we are, and no face either.
const NAMEPLATE_Y = -100
const AVATAR_PX = 32
// The card badge (#317) stacks on top of the face chip, so a glance across the
// room reads name, face, and what they're holding as one column.
const CARD_Y = NAMEPLATE_Y - AVATAR_PX - 4

// The authored-map scene — the runtime side of the map contract (ADR-0004).
// It renders "the current map" (read from the registry as a baked document)
// with no knowledge of which map it is: load the tilesets it names, blit the
// baked cells, and walk the shared character rig over it. Walkability is the
// composed rule (mapWalk.mapWalkable): in bounds ∧ not in the painted collision
// mask (#131) ∧ not blocked by a placed entity's walk-mask; zones and presence
// arrive in later slices (#85).
export default class MapScene extends Phaser.Scene {
  constructor() {
    super('Map')
    this.player = null
    this.playerTile = { x: 0, y: 0 }
    this.facing = 'down'
    this.movingTween = null
    this.dpadDir = null
    // True while a Placard panel is open in the shell (#372): input pauses so
    // the avatar doesn't wander off behind the takeover, and resumes exactly
    // where it stood when the shell reports the panel closed.
    this.reading = false
  }

  preload() {
    preloadBakedMap(this)
    preloadStandees(this)
    this._charManifest = preloadCharacter(this)
    for (const [dir, url] of Object.entries(STILL_URLS)) {
      this.load.image(`player.${dir}.0`, url)
    }
  }

  create() {
    // Phaser reuses the scene instance across stop/start, so the constructor
    // does not re-run on a restart — which is how an onward Portal hop swaps
    // maps (#249). Clear the movement state here or a tween still in flight
    // when the swap landed leaves `movingTween` set on the fresh map and
    // update() refuses every input: an avatar frozen on arrival.
    this.movingTween = null
    // A stale reading flag from a previous map (the instance survives stop/start,
    // #249) would freeze input on arrival — clear it like movingTween above.
    this.reading = false
    renderBakedMap(this)
    const map = this._bakedMap
    if (!map) return

    const rig = buildCharacterRig(this, this._charManifest)
    this.usingManifest = rig.usingManifest
    this.charDir = rig.charDir

    // Arriving through a portal names the entry spawn (#84); unnamed, we land
    // on this map's door back to where the hop came from. Both registry keys are
    // unset on direct navigation and spawnTile falls back to the centre.
    this.playerTile = spawnTile(map, this.registry.get('entrySpawnId'), this.registry.get('fromSlug'))
    // A placed building's door cell (#29, #212) is its walkable entrance: it
    // overrides the entity's own walk-mask so a solid footprint is still
    // enterable, mirroring town.ts's always-walkable door. Legacy/door-less maps
    // yield no door cells, so this leaves walk-mask collision untouched.
    this.doorCell = entityDoorCells(map.entities)
    // The placed NPCs, alive (#295): the kernel's stamps rigged and animating,
    // each holding the cell it actually stands on.
    this.npcs = spawnNpcs(this)
    // Standees, the runtime-placed peer cutouts (#369, ADR-0015): static effigies
    // the shell handed over the registry, resolved by reference. Deliberately NOT
    // folded into `walkable` below — a Standee never blocks, so the avatar walks
    // straight through its cell.
    this.standees = spawnStandees(this)
    // A placed NPC's baked walk_mask is only its authored *starting* cell (#294),
    // so it is skipped here — the live entity speaks for where an NPC blocks, and
    // keeps doing so once something walks it. Unlike a building's mask, a person
    // is not opened by a door cell: you can't walk through someone standing in a
    // doorway.
    const entityBlocked = entityBlockedFor(map.entities.filter((e) => e.kind !== 'npc'))
    const npcBlocked = npcBlockedFor(this.npcs)
    // Walkability = in bounds ∧ not in the collision mask ∧ not blocked by a
    // placed entity's walk-mask (#131) or a live NPC, except the door cell is
    // always walkable. Legacy maps carry no `collision` and only props (no
    // walk_mask), so this reduces to the in-bounds tracer rule for them.
    this.walkable = mapWalkable(
      map,
      map.collision,
      (x, y) => (entityBlocked(x, y) && !this.doorCell(x, y)) || npcBlocked(x, y),
    )
    // Fence-style border collision (#207): a placed entity's edge_mask blocks the
    // border *between* two otherwise-walkable cells (not the cell itself), so it
    // rides stepTile's transition-aware veto rather than `walkable`. Legacy maps
    // carry no edge masks, so this reduces to "never blocked".
    this.edgeBlocked = entityEdgeBlockedFor(map.entities)
    // Ladder posture (#54, #211): a placed object's walk-mask 'L' cell is
    // walkable like a porch but swaps the walk loop for the climb posture while
    // the avatar moves over it, mirroring town.ts's isLadderCell. Characters
    // with no authored climb frames fall back to walk (handled in the rig).
    // Legacy maps carry no 'L' cells, so this reduces to "never a ladder".
    this.isLadder = entityLadderFor(map.entities)
    // Overhang depth (#44, #210): a placed object's walk-mask 'o' cell is walkable
    // like a porch, but the object's art must draw *over* the avatar (walk-under),
    // so while the avatar stands there its depth drops below the entity band —
    // the authored-map companion to town.ts playerDepthAt's overhang branch.
    // Legacy maps carry no 'o' cells, so this reduces to "never an overhang".
    this.isOverhang = entityOverhangFor(map.entities)
    // Foreground overlay occlusion (#36, #168): a placed object carrying an
    // fg_mask stamps a masked copy of its art over the avatar's band (see
    // mapRenderer). While the avatar stands on that object's footprint its depth
    // drops between the base art and the overlay so the masked canopy covers it,
    // but its default depth beats the overlay once south of the footprint. The
    // mask + footprint live on the object, so this reads the resolved objects.
    // Legacy/mask-less maps yield no foreground cells — a no-op here.
    const objectsById = new Map((this._bakedObjects || []).map((o) => [o.id, o]))
    this.isForeground = entityForegroundFor(map.entities, objectsById)
    const feet = feetWorldXY(this.playerTile, this.usingManifest)
    if (this.usingManifest) {
      const render = this._charManifest.render || { originX: 0.5, originY: 1, scale: 1 }
      this.player = this.add
        .sprite(feet.x, feet.y, CHAR_SHEET_KEY, this.charDir.down.idleFrame)
        .setOrigin(render.originX, render.originY)
      this.player.setScale(characterScale(this._charManifest))
      applyFacing(this.player, this.charDir, this.facing, false)
    } else {
      this.player = this.add
        .image(feet.x, feet.y, `player.${this.facing}.0`)
        .setOrigin(0.5, 1)
        // Same display size as TownScene (rpg-char-01 padding compensation).
        .setDisplaySize(96, 96)
    }
    // Above every baked ground layer and entity by default (ground stacks carry
    // small producer depths, entities sit at MAP_ENTITY_DEPTH), except an
    // overhang cell drops the avatar below the entity band so the object's art
    // draws over it (walk-under, #210).
    this.player.setDepth(
      mapPlayerDepth(
        this.isOverhang(this.playerTile.x, this.playerTile.y),
        this.isForeground(this.playerTile.x, this.playerTile.y),
      ),
    )
    // NPCs sort against the avatar's row rather than the flat entity band (#295)
    // — one standing further south covers it, one further north stands behind.
    sortNpcs(this.npcs, this.playerTile.y)
    // Standees sort by the very same rule (#369): a cutout is character-shaped,
    // so it covers/reveals the avatar exactly as a placed NPC does.
    sortStandees(this.standees, this.playerTile.y)

    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    })

    // The interact affordance (#110): ENTER/SPACE — the same pressA keys the
    // interior scene binds — fire interact zones covering the avatar's tile or
    // the tile it faces. A press, never a step; keydown only, so holding the
    // key doesn't re-fire every frame.
    this.input.keyboard.on('keydown-ENTER', this.pressA, this)
    this.input.keyboard.on('keydown-SPACE', this.pressA, this)
    // Overlay D-pad + A over the bus — same pattern as Town/InteriorScene, so
    // an authored interior Node inside the village game (#111) keeps working
    // on mobile. Standalone MapPage has no overlay, so nothing ever emits.
    this.dpadDir = null
    this._onDpadPress = (d) => {
      this.dpadDir = d
    }
    this._onDpadRelease = (d) => {
      if (this.dpadDir === d) this.dpadDir = null
    }
    this._onABtn = () => this.pressA()
    // Deploy affordance (#369): the shell owns the write (the game imports no
    // data service, ADR-0004) and echoes the created Standee back on the bus. We
    // stand the deployer's own cutout up at once, so it appears without a reload.
    this._onStandeeDeployed = (s) => this.addOwnStandee(s)
    // The owner picked up their own cutout (#370): the shell owns the DELETE and
    // echoes the id so we drop the sprite at once, without a reload.
    this._onStandeePickedUp = (id) => this.removeStandee(id)
    // The shell closed a Placard panel (#372): resume input in place. The
    // avatar never moved while reading, so "exactly where they were" is free.
    this._onStandeeClosed = () => {
      this.reading = false
    }
    bus.on('dpadPress', this._onDpadPress)
    bus.on('dpadRelease', this._onDpadRelease)
    bus.on('aButton', this._onABtn)
    bus.on('standeeDeployed', this._onStandeeDeployed)
    bus.on('standeePickedUp', this._onStandeePickedUp)
    bus.on('standeeClosed', this._onStandeeClosed)
    // Tell the shell overlay which map we're on, so the deploy control shows
    // only on a multiplayer map and knows the slug to POST to. Standalone MapPage
    // has no overlay, so nothing listens; leaving emits `mapLeft` to hide it.
    bus.emit('mapEntered', { slug: map.slug, multiplayer: Boolean(map.multiplayer) })
    // The bus outlives the scene, so every subscription above must come off
    // when the scene goes. SHUTDOWN covers scene.stop/start; DESTROY is the
    // game.destroy() path (a page unmount), which Phaser fires *without* a
    // SHUTDOWN — a listener left behind there runs on a dead scene whose
    // `this.add` is null, throws, and stops the live scene's listener from
    // ever running (own Standee never appears until a reload).
    const unbindBus = () => {
      bus.off('dpadPress', this._onDpadPress)
      bus.off('dpadRelease', this._onDpadRelease)
      bus.off('aButton', this._onABtn)
      bus.off('standeeDeployed', this._onStandeeDeployed)
      bus.off('standeePickedUp', this._onStandeePickedUp)
      bus.off('standeeClosed', this._onStandeeClosed)
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown-ENTER', this.pressA, this)
      this.input.keyboard.off('keydown-SPACE', this.pressA, this)
      unbindBus()
      bus.emit('mapLeft')
    })
    this.events.once(Phaser.Scenes.Events.DESTROY, unbindBus)

    // The camera inside a building behaves exactly as outside (#261): 1:1
    // pixels at the town's tile scale, clamped follow. A map smaller than the
    // viewport sits centred via widened bounds instead of floating loose in a
    // corner of the canvas.
    const cam = this.cameras.main
    const fit = () => {
      const b = cameraBounds(this.scale.width, this.scale.height, map.cols * TILE, map.rows * TILE)
      cam.setBounds(b.x, b.y, b.width, b.height)
    }
    fit()
    this.scale.on('resize', fit)
    // The scale manager outlives the scene (stop/start swaps maps, #249).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', fit))
    cam.startFollow(this.player, true)

    // Presence (#88): the shell hands a connected room via the registry (the
    // onZone pattern) only for multiplayer maps — absent means solo, and the
    // scene renders no peers. Roster/sprites reset here because the scene
    // instance survives stop/start (#249).
    this.presence = this.registry.get('presence') || null
    this.remoteRoster = new Map()
    this.remoteSprites = new Map()
    // A peer's nameplate (label + face chip + card badge) lives in its own
    // container, not the body one (#483): a Phaser container forces one depth on
    // every child, and the body drops to the walk-under / masked band on a masked
    // tile (peerDepth), so a plate riding it sinks under prop art — the peer half
    // of #482. The plate holds MAP_NAMEPLATE_DEPTH and tracks the body's position
    // every frame in update(), keyed by the same userId as remoteSprites.
    this.remotePlates = new Map()
    // Our own nameplate container (below) — cleared here because the instance
    // survives stop/start (#249); a hop to a solo map builds none, so a stale
    // reference would point update() at a destroyed object.
    this.selfPlate = null
    // Peer characters by manifest id (#266): a present key means "already
    // asked", the value is the built stills or null while the fetch/sheet load
    // is in flight (and after a failure — that peer stays on the fallback).
    this.peerChars = new Map()
    // Faces already asked for (#323), keyed by subject — the textures those
    // fetches produce outlive the scene, this only stops a second ask.
    this.avatarsAsked = new Set()
    // The card badge each peer is currently wearing (#317), so a change can
    // replace it. The container owns it as a child — this only finds it again.
    this.cardBadges = new Map()
    // Proximity voice (#280): an opaque handle the shell injects for multiplayer
    // maps only (solo maps and the hometown get none). The game never imports
    // voice — it just feeds it our tile and a {x,y} projection of the roster and
    // lets it carry audio to pod peers. Absent means voice off, not an error. The
    // shell session owns teardown now (#522), so the scene never stops it.
    /** @type {import('../../../voice/schema.ts').VoiceHandle | null} */
    this.voice = this.registry.get('voice') || null
    if (this.presence) {
      this.presence.onFrame((frame) => this.wireFrame(frame))
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.presence.onFrame(null))
      // Announce our spawn; peers echo their own positions back (stateless
      // roster sync — see presence.ts).
      this.sendPosition()
      this.spawnSelfPlate()
    }

    // Test API — same shape the town/interior scenes publish, so the walking
    // e2e scripts can read state off the canvas.
    if (typeof window !== 'undefined') {
      window.__game = {
        engine: 'phaser',
        activeSceneKey: () => this.scene.key,
        playerTile: () => ({ ...this.playerTile }),
        mapSize: () => ({ cols: map.cols, rows: map.rows }),
      }
    }
  }

  // Our own nameplate + face, mirroring a peer's (#323) but for the local
  // avatar — the one character the peer path deliberately skips. A container of
  // [label, face] we reposition onto the player each frame in update(), because
  // `this.player` is a lone tweened sprite (camera-followed, anim-played), not a
  // container we can safely reparent. Multiplayer maps only — presence carries
  // the name + the id the face is fetched by, exactly as for peers.
  spawnSelfPlate() {
    const name = this.presence?.ownName || ''
    const children = []
    if (name) {
      children.push(
        this.add
          .text(0, NAMEPLATE_Y, name, { fontSize: '12px', color: '#ffffff', backgroundColor: '#000000aa' })
          .setOrigin(0.5, 0),
      )
    }
    // The plate holds its own nameplate depth (#482) rather than the avatar's,
    // which drops onto masked tiles (walk-under / foreground) and would sink the
    // plate under prop art. It tracks the avatar's *position* every frame, not
    // its depth.
    this.selfPlate = this.add.container(this.player.x, this.player.y, children).setDepth(MAP_NAMEPLATE_DEPTH)
    if (this.presence?.ownId) {
      loadAvatar(this, this.presence.ownId, this.avatarsAsked, (key) => {
        this.selfPlate?.add(this.add.image(0, NAMEPLATE_Y, key).setOrigin(0.5, 1).setDisplaySize(AVATAR_PX, AVATAR_PX))
      })
    }
  }

  update(_time, delta) {
    // Swing every proximity object toward or away from us (#438) — a door opens
    // as you walk up and closes behind you. Ahead of the input guards, so it
    // keeps swinging while a panel is open or a warp is fading; it is pure
    // theatre and never touches walkability.
    updateProximityStamps(this, this.playerTile, delta)
    // Keep our own nameplate glued to the avatar: the plate is a separate
    // container (the player is a lone tweened sprite), so it tracks position here
    // every frame — ahead of the input guard, which only gates steps. Its depth
    // is fixed at MAP_NAMEPLATE_DEPTH (#482): a nameplate is UI about a person and
    // must not follow the avatar down onto a masked tile, so we no longer copy
    // `this.player.depth` onto it.
    if (this.selfPlate && this.player) {
      this.selfPlate.setPosition(this.player.x, this.player.y)
    }
    // Glue each peer's nameplate to its body the same way (#483): the plate is a
    // separate container held at MAP_NAMEPLATE_DEPTH, so it tracks the tweened
    // body's position here every frame — no lag or drift while the peer walks —
    // while the body keeps its own dynamic walk-under / row-sort depth.
    for (const [userId, plate] of this.remotePlates) {
      const body = this.remoteSprites.get(userId)
      if (body) plate.setPosition(body.x, body.y)
    }
    // A Standee retires itself when its moment passes (#374) — off the clock
    // this loop already runs on, so there is no sweeper job and no server tick.
    // Ahead of the input guards below: a cutout dying while you stand reading
    // in front of it still goes.
    for (const s of expiredStandees(this.standees || [], Date.now())) this.removeStandee(s.id)
    // Mid-warp (#254): a held direction key would otherwise bank a step the
    // instant the new map lands. The fade-in covers arrival, so refuse input
    // until it lifts.
    if (!this.player || this.movingTween || isTransitioning() || this.reading) return
    const dir = this.activeDirection()
    if (dir) this.step(dir)
  }

  activeDirection() {
    return resolveDirection({ dpadDir: this.dpadDir, cursors: this.cursors, wasd: this.wasd })
  }

  // Press A — fire interact zones under or in front of the avatar (#110)
  // through the same onZone channel steps use; the shell dispatches on
  // payload.kind and never learns which input fired.
  pressA() {
    // A panel is already open — swallow the press so it can't stack.
    if (this.reading) return
    const { dx, dy } = deltaFor(this.facing)
    const faced = { x: this.playerTile.x + dx, y: this.playerTile.y + dy }
    // Reading a Standee's Placard (#372) takes precedence over an interact
    // zone under the same cell: a cutout you can press A on is the thing you
    // meant. The game emits the note; the shell renders the full Placard and
    // reports back on `standeeClosed`. Input pauses now (before the async shell
    // responds) so the avatar can't wander off behind the takeover.
    const s = standeeAt(this.standees || [], faced) || standeeAt(this.standees || [], this.playerTile)
    if (s) {
      this.reading = true
      bus.emit('readStandee', placardOf(s))
      return
    }
    const onZone = this.registry.get('onZone')
    if (!onZone) return
    for (const ev of interactZoneEvents(this.playerTile, faced, this._bakedMap?.zones)) {
      onZone(ev.trigger, ev.zone)
    }
  }

  // Stand up the deployer's own cutout the instant a deploy succeeds (#369), so
  // it appears without a reload. It reuses the avatar's already-rigged sheet —
  // which *is* the owner's rig, by definition — so no fetch is needed; a later
  // map load resolves every cutout by reference through the registry instead.
  // Never blocks and never animates, exactly like a loaded Standee.
  addOwnStandee({ id, x, y, message = '', detail = null, reply_link = null, expires_at = '', owner_name = null, owner_avatar_url = null }) {
    if (!this.standees) return
    // The same cutout treatment every other path stamps (#376) — effigy, not
    // colleague — over our own already-rigged sheet.
    const figure = this.usingManifest
      ? this.add.sprite(0, 0, CHAR_SHEET_KEY, this.charDir.down.idleFrame).setScale(characterScale(this._charManifest))
      : null
    const sprite = cutout(this, { x, y }, figure, message)
    // Carry the Placard the server echoed back (#372) so pressing A on your own
    // fresh cutout reads it too — the same shape a loaded Standee holds. It is
    // yours by definition, so `mine` is true: press-A offers pick up on it (#370).
    this.standees.push({
      id,
      message,
      detail,
      ownerName: owner_name,
      ownerAvatarUrl: owner_avatar_url,
      replyLink: reply_link,
      mine: true,
      // Our own cutout expires on the same terms as anyone else's (#374): the
      // server stamped the window, and this scene retires it when it passes.
      expiresAt: expires_at,
      tile: { x, y },
      sprite,
    })
    sortStandees(this.standees, this.playerTile.y)
  }

  // Take a picked-up cutout off the map the instant its owner confirms (#370),
  // so it disappears without a reload — the mirror of addOwnStandee. The shell
  // owns the durable DELETE and echoes the id back on the bus; we drop the
  // sprite and the entry. Unknown id is a no-op (already gone).
  removeStandee(id) {
    if (!this.standees) return
    const i = this.standees.findIndex((s) => s.id === id)
    if (i === -1) return
    this.standees[i].sprite?.destroy()
    this.standees.splice(i, 1)
  }

  sendPosition() {
    this.presence.send({ x: this.playerTile.x, y: this.playerTile.y, facing: this.facing })
    // Interest management (#158): stepping out of a cell's neighbourhood stops
    // its stream server-side, and a stopped stream sends no leave frame — so
    // the peers standing in it have to be dropped here or they linger frozen
    // on their last tile.
    for (const userId of pruneOutOfRange(this.remoteRoster, this.playerTile)) {
      this.dropPeer(userId)
    }
    this.syncVoice()
  }

  // Reconcile voice with who is in earshot now. Hand it a bare {x, y} projection
  // of the roster (#522) rather than the RemotePlayer sprites — voice needs only
  // the tiles (#278) and must never reach into game objects. Called on our own
  // step (above) and on every peer frame (below), so a peer walking into range
  // while we stand still still opens a link.
  syncVoice() {
    if (!this.voice) return
    const roster = new Map()
    for (const [id, p] of this.remoteRoster) roster.set(id, { x: p.x, y: p.y })
    this.voice.update(this.playerTile, roster)
  }

  dropPeer(userId) {
    // Kill the step tween before the body goes. A peer who leaves — or walks out
    // of presence range — mid-step would otherwise fire onComplete on a
    // destroyed container, and that throw takes the whole game loop with it:
    // Phaser never schedules the next frame, so the local avatar freezes.
    const remote = this.remoteSprites.get(userId)
    if (remote) this.tweens.killTweensOf(remote)
    remote?.destroy()
    this.remoteSprites.delete(userId)
    // The plate is a sibling container, not a child of the body, so it needs its
    // own destroy (#483) — otherwise a leaver's label/face/badge lingers.
    this.remotePlates.get(userId)?.destroy()
    this.remotePlates.delete(userId)
    // Destroyed with the plate container above; drop the handle so a rejoin
    // builds a fresh badge instead of trying to destroy a dead one.
    this.cardBadges.delete(userId)
  }

  // Hang what this peer is working on over their head (#317). Rebuilt rather
  // than edited: a new card changes the label and the colour together, and
  // there is one of these per person, not per frame.
  setPeerCard(userId, card) {
    this.cardBadges.get(userId)?.destroy()
    this.cardBadges.delete(userId)
    const plate = this.remotePlates.get(userId)
    // No card is the resting state, not an error — most people never link a
    // Jira token to Eira at all.
    if (!plate || !card) return

    const badge = this.add
      .text(0, CARD_Y, badgeText(card), {
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: statusColor(card.status),
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
    const href = cardHref(card.url)
    if (href) {
      badge.setInteractive({ useHandCursor: true })
      badge.on('pointerdown', () => window.open(href, '_blank', 'noopener'))
    }
    plate.add(badge)
    this.cardBadges.set(userId, badge)
  }

  // One cable subscription carries every stream this map opened — the per-cell
  // presence frames, the shared card stream, and the map-wide standee stream
  // (#375) — so frames are sorted by type here and folded by their own module.
  wireFrame(frame) {
    if (String(frame?.type).startsWith('standee:')) this.standeeFrame(frame)
    else this.presenceFrame(frame)
  }

  // Someone deployed or picked up a Standee while we were standing here (#375):
  // stand the cutout up, or take it down, without a reload. Our own echoes fold
  // to 'none' — our cutout already went up on the write that broadcast this.
  standeeFrame(frame) {
    if (!this.standees) return
    const result = applyStandeeFrame(this.standees, frame, this.presence.ownId)
    if (result.action === 'remove') {
      result.standee.sprite?.destroy()
      return
    }
    if (result.action !== 'add') return
    // The owner is usually a peer standing right there, whose rig is already
    // cut; if not, this kicks off the one-time fetch and the cutout upgrades
    // from the bundled fallback when it settles.
    this.loadPeerCharacter(result.standee.manifestId)
    this.standees.push(addStandee(this, result.standee))
    sortStandees(this.standees, this.playerTile.y)
  }

  // Fold one presence frame into the roster and render the outcome: spawn a
  // labelled avatar, tween a known one to its new tile, or drop a leaver.
  // Each frame names its sender's character (#266), so a first sighting also
  // kicks off that manifest's one-time load.
  // Re-sort every peer against the row the local avatar is on (or stepping to),
  // the same rule and same trigger point as sortNpcs/sortStandees (#403): the
  // local row is the sort key, so walking past a peer swaps who covers whom. An
  // overhang / foreground peer keeps its walk-under band regardless (#402).
  sortPeers(avatarRow) {
    for (const [userId, state] of this.remoteRoster) {
      this.remoteSprites
        .get(userId)
        ?.setDepth(peerDepth(state.y, avatarRow, this.isOverhang(state.x, state.y), this.isForeground(state.x, state.y)))
    }
  }

  presenceFrame(frame) {
    // Snapshot the peer's tile before applyFrame folds the new one in: a move's
    // depth slide needs where they stepped *from* (#402), and applyFrame
    // replaces the roster entry outright.
    const prev = this.remoteRoster.get(frame.userId)
    const { action, echo } = applyFrame(this.remoteRoster, frame, this.presence.ownId)
    if (echo) this.sendPosition()
    if (action === 'none') return
    // applyFrame has already folded this spawn/move/remove into the roster, so
    // reconcile the voice mesh now — before any render early-return below — and
    // a peer stepping into (or out of) earshot opens/closes their audio link.
    this.syncVoice()
    if (action === 'remove') {
      this.dropPeer(frame.userId)
      return
    }
    const state = this.remoteRoster.get(frame.userId)
    // A card change touches nothing else — they haven't moved.
    if (action === 'card') {
      this.setPeerCard(frame.userId, state.card)
      return
    }
    this.loadPeerCharacter(state.manifestId)
    const feet = this.peerFeet(state)
    if (action === 'spawn') {
      // A sprite, not an image: peers play their own walk loop (#267). The body
      // container holds the sprite alone — the plate (label + chip + badge) is a
      // sibling (#483), so applyPeerLook still reads the body's list[0].
      const img = this.add.sprite(0, 0, `player.${state.facing}.0`).setOrigin(0.5, 1)
      const remote = this.add.container(feet.x, feet.y, [img])
      // A peer sorts against the local avatar's row like a placed NPC (#403):
      // south covers, north draws behind — and an overhang / foreground cell
      // still wins where it applies (#402: behind an object's art on an overhang
      // cell #210, under the masked canopy on a foreground cell #168).
      remote.setDepth(
        peerDepth(state.y, this.playerTile.y, this.isOverhang(state.x, state.y), this.isForeground(state.x, state.y)),
      )
      this.remoteSprites.set(frame.userId, remote)
      // The nameplate rides its own container at MAP_NAMEPLATE_DEPTH (#483), so
      // it never sinks under prop art when the body drops onto a masked tile. It
      // tracks the body's position every frame in update().
      const label = this.add
        .text(0, NAMEPLATE_Y, state.name, { fontSize: '12px', color: '#ffffff', backgroundColor: '#000000aa' })
        .setOrigin(0.5, 0)
      const plate = this.add.container(feet.x, feet.y, [label]).setDepth(MAP_NAMEPLATE_DEPTH)
      this.remotePlates.set(frame.userId, plate)
      this.applyPeerLook(remote, state)
      // The spawn frame carries their card, so someone who picked one up while
      // out of range walks back in already wearing the badge.
      this.setPeerCard(frame.userId, state.card)
      // Their face on the nameplate (#323) once it lands — a child of the plate
      // container, so leaving destroys it with the rest of them. A peer who left
      // (or walked out of range) mid-fetch is no longer the plate we hold.
      loadAvatar(this, frame.userId, this.avatarsAsked, (key) => {
        if (this.remotePlates.get(frame.userId) !== plate) return
        // A square chip standing on the nameplate line, whatever the source
        // image's aspect (Basecamp serves squares, the proxy re-serves them).
        plate.add(this.add.image(0, NAMEPLATE_Y, key).setOrigin(0.5, 1).setDisplaySize(AVATAR_PX, AVATAR_PX))
      })
      return
    }
    const remote = this.remoteSprites.get(frame.userId)
    if (!remote) return
    // Walk while the step tween runs, settle to idle on arrival (#267). Kill the
    // previous tween first: a frame that lands just before its predecessor
    // finished would otherwise let the stale onComplete idle a walking peer.
    this.tweens.killTweensOf(remote)
    this.applyPeerLook(remote, state, true)
    // Re-derive depth on the move, exactly as the local avatar does each step:
    // hold the walk-under band for the whole slide while either end of the step
    // overhangs (#402) — so a peer stepping out of an overhang cell doesn't pop
    // over the art it is still standing in front of — otherwise sort against the
    // local avatar's row (#403), keyed on the destination cell. onComplete
    // settles to the landed cell's own depth.
    const to = { x: state.x, y: state.y }
    remote.setDepth(peerSlideDepth(prev ?? to, to, this.playerTile.y, this.isOverhang, this.isForeground))
    this.tweens.add({
      targets: remote,
      x: feet.x,
      y: feet.y,
      duration: MOVE_MS,
      onComplete: () => {
        this.applyPeerLook(remote, state, false)
        remote.setDepth(peerDepth(to.y, this.playerTile.y, this.isOverhang(to.x, to.y), this.isForeground(to.x, to.y)))
      },
    })
  }

  // Where a peer's feet belong on their tile. The lift is theirs, not ours
  // (#274): only the bundled rpg-char-01 needs PLAYER_FEET_LIFT for its padded
  // box, so a peer rigged to their own manifest stands on the tile line — the
  // same line the local player takes there.
  peerFeet(state) {
    return feetWorldXY({ x: state.x, y: state.y }, Boolean(this.peerChars.get(state.manifestId)))
  }

  // Resolve a peer's character once per manifest id (#266). The fetch is the
  // shell's job — it rides the presence bundle off the registry, so the game
  // imports no data service (ADR-0004) — and we runtime-load the sheet it
  // names. A peer with no manifest (null), a missing loader, a failed fetch or
  // a sheet-less manifest all just leave them on the bundled stills.
  loadPeerCharacter(manifestId) {
    if (manifestId == null || this.peerChars.has(manifestId)) return
    const fetchManifest = this.presence?.loadManifest
    if (!fetchManifest) return
    // Three states, because "still loading" and "has no character" must render
    // differently: null = in flight (the peer stays hidden rather than flashing
    // the generic sprite), false = resolved to nothing (bundled stills), an
    // object = their cut stills.
    this.peerChars.set(manifestId, null)
    const settle = (stills) => {
      this.peerChars.set(manifestId, stills)
      this.refreshPeers()
      // A cutout raised by someone out of range (#375) came up on the bundled
      // fallback while this was in flight — swap in their real rig now.
      restandeeRigs(this, this.standees || [], this.playerTile.y)
    }
    Promise.resolve(fetchManifest(manifestId))
      .then((manifest) => {
        if (!manifest) return settle(false)
        const key = peerSheetKey(manifestId)
        // The same rig the local player uses, keyed to this peer's sheet (#267),
        // so their walk/idle loops play from their own frames — and their Look
        // bakes the same way the player's does (#397).
        const cut = () => {
          const rig = this.textures.exists(key) && buildCharacterRig(this, manifest, key)
          return rig && rig.usingManifest && { charDir: rig.charDir, scale: characterScale(manifest) }
        }
        // Textures outlive the scene (stop/start swaps maps, #249), so a peer
        // seen on an earlier map — or a second peer wearing the very same Look —
        // is already cut and needs no second load (one texture, shared #397).
        if (this.textures.exists(key)) return settle(cut())
        // A sheet is one image; a Look is N Part atlases plus a composite. The
        // shared queue decides which, keyed to this peer. A manifest that names
        // neither leaves them on the bundled stills.
        if (!queueCharacterSheet(this, manifest, key)) return settle(false)
        // The queue-drained event rather than filecomplete-image-<key>: it
        // fires whether the atlases arrived or 404'd, so a broken sheet/Look
        // settles to the fallback instead of hiding that peer forever.
        this.load.once(Phaser.Loader.Events.COMPLETE, () => settle(cut()))
        this.load.start()
      })
      .catch(() => settle(false))
  }

  // Show a peer facing the way they last moved — walking or idle (#267): their
  // own character once its sheet is rigged, the bundled stills for a peer who
  // has none. While their character is still in flight they stay hidden — a
  // first sighting used to flash the generic sprite for a frame before snapping
  // to the real one.
  applyPeerLook(remote, state, walking = false) {
    // A destroyed body holds no children: bail rather than throw, since a stale
    // callback can still land here after the peer went.
    const img = remote.list?.[0]
    if (!img) return
    const rig = this.peerChars.get(state.manifestId)
    remote.setVisible(rig !== null)
    remote.peerWalking = walking
    if (!rig) {
      img.setTexture(`player.${state.facing}.0`).setFlipX(false).setDisplaySize(96, 96)
      return
    }
    applyPeerRig(img, rig, peerSheetKey(state.manifestId), state.facing, walking)
  }

  // A character settled — re-render every peer on it, since they've been
  // waiting hidden (or on the fallback) while the fetch was in flight. They
  // were also placed with the fallback's lift, so move them too (#274); their
  // step tween holds that stale target, so end it on the tile it aimed at.
  refreshPeers() {
    for (const [userId, state] of this.remoteRoster) {
      const remote = this.remoteSprites.get(userId)
      if (!remote) continue
      this.tweens.killTweensOf(remote)
      this.applyPeerLook(remote, state, false)
      const feet = this.peerFeet(state)
      remote.setPosition(feet.x, feet.y)
    }
  }

  // Stop the avatar where it stands: forget the held D-pad direction and reset
  // the keyboard keys, so a key still physically down reads as up until it is
  // released and pressed again.
  halt() {
    this.dpadDir = null
    this.input.keyboard.resetKeys()
  }

  step(dir) {
    this.facing = dir
    const from = { ...this.playerTile }
    const result = stepTile({
      scene: this,
      target: this.player,
      from: this.playerTile,
      dir,
      walkable: this.walkable,
      transitionBlocked: (from, to) => this.edgeBlocked(from.x, from.y, to.x, to.y),
      toWorldXY: (t) => feetWorldXY(t, this.usingManifest),
      duration: MOVE_MS,
      onStart: (t) => {
        this.playerTile = t
        // One presence frame per tile-step (#88) — peers replay the step as a
        // tween, so cadence is bounded by walk speed, not frame rate.
        if (this.presence) this.sendPosition()
        // Drop below the entity band for the whole slide when either end of the
        // step is an overhang cell, so the object's art overhangs the avatar
        // stepping in *and* out (#210, #294), or between the base art and the fg
        // overlay on a foreground cell so the masked canopy covers it (#168) —
        // mirroring TownScene's per-step playerDepthAt. onArrive settles it back
        // to the landed cell's own depth.
        this.player.setDepth(slidePlayerDepth(from, t, this.isOverhang, this.isForeground))
        // Re-sort the NPCs against the row being stepped onto, so walking past
        // one swaps who covers whom for the whole slide (#295).
        sortNpcs(this.npcs, t.y)
        // Standee cutouts re-sort against the same row (#369).
        sortStandees(this.standees, t.y)
        // Peers sort against the same row too (#403) — the local avatar is the
        // sort key, so stepping past a peer swaps who covers whom.
        this.sortPeers(t.y)
        // Climb while stepping onto a placed object's ladder cell (#211); the
        // rig falls back to walk when the character authors no climb frames.
        if (this.usingManifest) applyFacing(this.player, this.charDir, dir, true, this.isLadder(t.x, t.y))
        else this.player.setTexture(`player.${dir}.0`)
      },
      onBlocked: () => {
        if (this.usingManifest) applyFacing(this.player, this.charDir, dir, false)
        else this.player.setTexture(`player.${dir}.0`)
      },
      onArrive: () => {
        this.movingTween = null
        // Settle on the landed cell's own depth — the slide may have held the
        // walk-under band for the cell it left (#294).
        const at = this.playerTile
        this.player.setDepth(mapPlayerDepth(this.isOverhang(at.x, at.y), this.isForeground(at.x, at.y)))
        if (this.usingManifest && !this.activeDirection()) {
          applyFacing(this.player, this.charDir, this.facing, false)
        }
        // The Zone/Trigger channel (#85): once the step lands, the pure detector
        // maps it against the map's zones and every fired event goes out through
        // the one onZone callback the shell registered. Edge-triggered in the
        // detector, so walking within (or outside) a zone emits nothing.
        const onZone = this.registry.get('onZone')
        if (!onZone) return
        for (const ev of zoneEvents(from, this.playerTile, this._bakedMap?.zones)) {
          onZone(ev.trigger, ev.zone)
        }
        // A trainer's sight cone (#86) rides the same channel, but the step
        // that walks into it also stops the avatar: held input is dropped so
        // the walk doesn't carry on through the challenge, and moving again
        // needs a fresh press.
        for (const ev of sightZoneEvents(from, this.playerTile, this._bakedMap?.zones)) {
          this.halt()
          onZone(ev.trigger, ev.zone)
        }
      },
    })
    this.movingTween = result.tween
  }
}
