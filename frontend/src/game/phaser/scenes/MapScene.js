import Phaser from 'phaser'
import { preloadBakedMap, renderBakedMap } from '../../../kernel/mapRenderer.ts'
import { MOVE_MS, TILE } from '../../constants.js'
import { cameraBounds } from '../canvasLayout.ts'
import { spawnTile, mapWalkable, entityBlockedFor, entityEdgeBlockedFor, entityDoorCells, entityLadderFor, entityOverhangFor, entityForegroundFor, mapPlayerDepth, slidePlayerDepth, feetWorldXY } from '../mapWalk.ts'
import {
  CHAR_SHEET_KEY,
  preloadCharacter,
  buildCharacterRig,
  characterScale,
  peerSheetKey,
  applyFacing,
} from '../characterRig.js'
import { resolveSheetSrc } from '../../../kernel/characterManifest.js'
import bus from '../bus.js'
import { deltaFor, resolveDirection, stepTile } from '../movement.ts'
import { applyFrame, pruneOutOfRange } from '../../presence.ts'
import { interactZoneEvents, sightZoneEvents, zoneEvents } from '../../../kernel/zones.ts'
import downStill from '../../assets/character/rpg-char-01/r0-c0.png'
import leftStill from '../../assets/character/rpg-char-01/r1-c0.png'
import rightStill from '../../assets/character/rpg-char-01/r2-c0.png'
import upStill from '../../assets/character/rpg-char-01/r3-c0.png'

// Bundled still frame per direction — the no-manifest fallback. This game
// instance boots without TownScene, so the walk strips it loads aren't in the
// texture cache; stills are enough for the movement tracer.
const STILL_URLS = { down: downStill, left: leftStill, right: rightStill, up: upStill }

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
  }

  preload() {
    preloadBakedMap(this)
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
    renderBakedMap(this)
    const map = this._bakedMap
    if (!map) return

    const rig = buildCharacterRig(this, this._charManifest)
    this.usingManifest = rig.usingManifest
    this.charDir = rig.charDir

    // Arriving through a portal names the entry spawn (#84); the registry key
    // is unset on direct navigation and spawnTile falls back to the centre.
    this.playerTile = spawnTile(map, this.registry.get('entrySpawnId'))
    // A placed building's door cell (#29, #212) is its walkable entrance: it
    // overrides the entity's own walk-mask so a solid footprint is still
    // enterable, mirroring town.ts's always-walkable door. Legacy/door-less maps
    // yield no door cells, so this leaves walk-mask collision untouched.
    this.doorCell = entityDoorCells(map.entities)
    const entityBlocked = entityBlockedFor(map.entities)
    // Walkability = in bounds ∧ not in the collision mask ∧ not blocked by a
    // placed entity's walk-mask (#131), except the door cell is always walkable.
    // Legacy maps carry no `collision` and only props (no walk_mask), so this
    // reduces to the in-bounds tracer rule for them.
    this.walkable = mapWalkable(map, map.collision, (x, y) => entityBlocked(x, y) && !this.doorCell(x, y))
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
    bus.on('dpadPress', this._onDpadPress)
    bus.on('dpadRelease', this._onDpadRelease)
    bus.on('aButton', this._onABtn)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown-ENTER', this.pressA, this)
      this.input.keyboard.off('keydown-SPACE', this.pressA, this)
      bus.off('dpadPress', this._onDpadPress)
      bus.off('dpadRelease', this._onDpadRelease)
      bus.off('aButton', this._onABtn)
    })

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
    // Peer characters by manifest id (#266): a present key means "already
    // asked", the value is the built stills or null while the fetch/sheet load
    // is in flight (and after a failure — that peer stays on the fallback).
    this.peerChars = new Map()
    // Proximity voice (#280): an opaque handle the shell injects for multiplayer
    // maps only (solo maps and the hometown get none). The game never imports
    // voice — it just feeds it our tile and the roster and lets it mesh WebRTC
    // audio to pod peers. Absent means voice off, not an error.
    this.voice = this.registry.get('voice') || null
    if (this.presence) {
      this.presence.onFrame((frame) => this.presenceFrame(frame))
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.presence.onFrame(null))
      // Announce our spawn; peers echo their own positions back (stateless
      // roster sync — see presence.ts).
      this.sendPosition()
    }
    if (this.voice) {
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.voice.stop())
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

  update() {
    if (!this.player || this.movingTween) return
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
    const onZone = this.registry.get('onZone')
    if (!onZone) return
    const { dx, dy } = deltaFor(this.facing)
    const faced = { x: this.playerTile.x + dx, y: this.playerTile.y + dy }
    for (const ev of interactZoneEvents(this.playerTile, faced, this._bakedMap?.zones)) {
      onZone(ev.trigger, ev.zone)
    }
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

  // Reconcile the voice mesh with who is in earshot now. Our RemotePlayer
  // roster satisfies voice's {x, y} structurally (#278), so it hands over
  // unchanged. Called on our own step (above) and on every peer frame (below),
  // so a peer walking into range while we stand still still opens a link.
  syncVoice() {
    this.voice?.update(this.playerTile, this.remoteRoster)
  }

  dropPeer(userId) {
    this.remoteSprites.get(userId)?.destroy()
    this.remoteSprites.delete(userId)
  }

  // Fold one presence frame into the roster and render the outcome: spawn a
  // labelled avatar, tween a known one to its new tile, or drop a leaver.
  // Each frame names its sender's character (#266), so a first sighting also
  // kicks off that manifest's one-time load.
  presenceFrame(frame) {
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
    this.loadPeerCharacter(state.manifestId)
    const feet = this.peerFeet(state)
    if (action === 'spawn') {
      // A sprite, not an image: peers play their own walk loop (#267).
      const img = this.add.sprite(0, 0, `player.${state.facing}.0`).setOrigin(0.5, 1)
      const label = this.add
        .text(0, -100, state.name, { fontSize: '12px', color: '#ffffff', backgroundColor: '#000000aa' })
        .setOrigin(0.5, 0)
      const remote = this.add.container(feet.x, feet.y, [img, label])
      remote.setDepth(mapPlayerDepth(false, false))
      this.remoteSprites.set(frame.userId, remote)
      this.applyPeerLook(remote, state)
      return
    }
    const remote = this.remoteSprites.get(frame.userId)
    if (!remote) return
    // Walk while the step tween runs, settle to idle on arrival (#267). Kill the
    // previous tween first: a frame that lands just before its predecessor
    // finished would otherwise let the stale onComplete idle a walking peer.
    this.tweens.killTweensOf(remote)
    this.applyPeerLook(remote, state, true)
    this.tweens.add({
      targets: remote,
      x: feet.x,
      y: feet.y,
      duration: MOVE_MS,
      onComplete: () => this.applyPeerLook(remote, state, false),
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
    }
    Promise.resolve(fetchManifest(manifestId))
      .then((manifest) => {
        const src = manifest && resolveSheetSrc(manifest)
        if (!src) return settle(false)
        const key = peerSheetKey(manifestId)
        // The same rig the local player uses, keyed to this peer's sheet (#267),
        // so their walk/idle loops play from their own frames.
        const cut = () => {
          const rig = this.textures.exists(key) && buildCharacterRig(this, manifest, key)
          return rig && rig.usingManifest && { charDir: rig.charDir, scale: characterScale(manifest) }
        }
        // Textures outlive the scene (stop/start swaps maps, #249), so a peer
        // seen on an earlier map is already cut and needs no second load.
        if (this.textures.exists(key)) return settle(cut())
        this.load.image(key, src)
        // The queue-drained event rather than filecomplete-image-<key>: it
        // fires whether the sheet arrived or 404'd, so a broken sheet settles
        // to the fallback instead of hiding that peer forever.
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
    const rig = this.peerChars.get(state.manifestId)
    remote.setVisible(rig !== null)
    remote.peerWalking = walking
    const img = remote.list[0]
    if (!rig) {
      img.setTexture(`player.${state.facing}.0`).setFlipX(false).setDisplaySize(96, 96)
      return
    }
    img.setTexture(peerSheetKey(state.manifestId))
    img.setScale(rig.scale)
    // Peers never climb: the ladder pose is the local player's own tile state.
    applyFacing(img, rig.charDir, state.facing, walking, false)
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
