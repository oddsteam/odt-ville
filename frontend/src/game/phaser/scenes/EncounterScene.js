import Phaser from 'phaser'
import bus from '../bus.js'

// Phaser-side equivalent of <EncounterScreen>. Launched as a parallel
// overlay on top of TownScene when a wild encounter rolls or the gate
// trainer spots the player. The world scene is paused while the
// encounter runs; RUN AWAY closes this scene and resumes the world.
//
// Init data:
//   { opponent: { kind: 'wild'|'trainer', name, level, sprite (URL),
//                 encounter_dialog? } }
//
// Bus events emitted:
//   'trainerDefeated' — when RUN AWAY closes a trainer duel (so the
//     React shell can persist the flag and the world scene can hide
//     the trainer's line-of-sight markers).
export default class EncounterScene extends Phaser.Scene {
  constructor() {
    super('Encounter')
    this.opponent = null
    this.phase = 'flash' // 'flash' → 'show'
  }

  init(data) {
    this.opponent = data?.opponent || null
    this.phase = 'flash'
  }

  preload() {
    if (this.opponent?.sprite) {
      // Each opponent's URL is a Vite-imported asset URL; load it once
      // per scene boot (Phaser dedupes by key on later visits).
      this.load.image(`opponent.${this.opponent.id || this.opponent.name}`, this.opponent.sprite)
    }
  }

  create() {
    const { width, height } = this.scale
    const isTrainer = this.opponent?.kind === 'trainer'

    // Dimmer covering the whole canvas — the world is still rendered
    // under us but visibly behind.
    this.add
      .rectangle(0, 0, width, height, 0x0a0d12, 0.9)
      .setOrigin(0, 0)
      .setDepth(0)

    // White flash overlay — replays the Game Boy battle-intro feel.
    const flash = this.add
      .rectangle(0, 0, width, height, 0xffffff, 1)
      .setOrigin(0, 0)
      .setDepth(100)
    this.tweens.add({
      targets: flash,
      alpha: { from: 1, to: 0 },
      duration: 280,
      ease: 'Quad.easeOut',
      onComplete: () => {
        flash.destroy()
        this.phase = 'show'
        this.showStage()
      },
    })

    // Keyboard: Enter / Space / Escape all run away.
    this.input.keyboard.on('keydown-ENTER', this.runAway, this)
    this.input.keyboard.on('keydown-SPACE', this.runAway, this)
    this.input.keyboard.on('keydown-ESC', this.runAway, this)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown-ENTER', this.runAway, this)
      this.input.keyboard.off('keydown-SPACE', this.runAway, this)
      this.input.keyboard.off('keydown-ESC', this.runAway, this)
    })

    // Test API extension — Playwright can read which scene is active,
    // who the opponent is, and which phase we're in. We layer onto the
    // existing window.__game without replacing TownScene's reads.
    if (typeof window !== 'undefined' && window.__game) {
      const prev = window.__game
      window.__game = {
        ...prev,
        engine: 'phaser',
        activeSceneKey: () => this.scene.key,
        opponent: () =>
          this.opponent
            ? {
                kind: this.opponent.kind,
                name: this.opponent.name,
                level: this.opponent.level,
              }
            : null,
        encounterPhase: () => this.phase,
      }
      this._restoreGameApi = () => {
        if (typeof window !== 'undefined') window.__game = prev
      }
    }

    this._isTrainer = isTrainer
  }

  showStage() {
    const { width, height } = this.scale
    const isTrainer = this._isTrainer
    const o = this.opponent
    if (!o) return

    // Field — a dark arena behind the opponent.
    const fieldH = Math.round(height * 0.6)
    this.add
      .rectangle(0, 0, width, fieldH, 0x404858, 1)
      .setOrigin(0, 0)
      .setDepth(1)
    // Subtle radial vignette via a second translucent rect.
    this.add
      .rectangle(0, 0, width, fieldH, 0x20242e, 0.4)
      .setOrigin(0, 0)
      .setDepth(2)

    // Opponent sprite — portrait-aspect for trainer, square-ish for wild.
    // Scale to fit a centred box without distorting.
    const targetH = isTrainer ? Math.round(fieldH * 0.85) : Math.round(fieldH * 0.7)
    const sprite = this.add
      .image(width / 2, fieldH / 2, `opponent.${o.id || o.name}`)
      .setDepth(3)
    const scale = targetH / sprite.height
    sprite.setScale(scale)

    // Tiny pop-in animation matching the DOM CSS @keyframes encounter-pop.
    sprite.setScale(0.25 * scale)
    sprite.setAlpha(0)
    this.tweens.add({
      targets: sprite,
      scale,
      alpha: 1,
      duration: 220,
      ease: 'Back.easeOut',
    })

    // Dialogue box — paper background at the bottom 40% of the screen.
    const boxY = fieldH
    const boxH = height - fieldH
    this.add
      .rectangle(0, boxY, width, boxH, 0xf8f8e8, 1)
      .setOrigin(0, 0)
      .setDepth(4)
    this.add
      .rectangle(0, boxY, width, 4, 0x1b241b, 1)
      .setOrigin(0, 0)
      .setDepth(5)

    // Authored monsters (#70) carry their own encounter line; fall back to the
    // generic greeting for trainers and built-in cameos with no dialog.
    const text =
      o.encounter_dialog ||
      (isTrainer ? `${o.name} wants to duel!` : `A wild ${o.name} appeared!`)
    this.add
      .text(36, boxY + 28, text, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#1b241b',
        fontStyle: 'bold',
      })
      .setDepth(6)
    // Built-in cameos carry a level; authored monsters (#69) don't — omit the
    // line rather than render "Lv. undefined".
    if (o.level != null) {
      this.add
        .text(36, boxY + 64, `Lv. ${o.level}`, {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#3f9c33',
          fontStyle: 'bold',
        })
        .setDepth(6)
    }

    // RUN button — bottom right. Phaser doesn't ship HTML buttons; we
    // make a rectangle + label and wire pointer + keyboard.
    const btnLabel = isTrainer ? 'RUN AWAY' : 'RUN'
    const btnW = isTrainer ? 200 : 140
    const btnH = 60
    const btnX = width - 36 - btnW
    const btnY = boxY + boxH / 2 - btnH / 2
    const btn = this.add
      .rectangle(btnX, btnY, btnW, btnH, 0xe23a2c, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(3, 0x1b241b)
      .setDepth(6)
      .setInteractive({ useHandCursor: true })
    this.add
      .text(btnX + btnW / 2, btnY + btnH / 2, btnLabel, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#f8f8e8',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(7)

    btn.on('pointerup', this.runAway, this)
  }

  runAway() {
    // Trainer escapes are persistent — the gate trainer becomes
    // "defeated" for the rest of the session, his sight markers hide,
    // and he no longer triggers. Wild encounters end with no flag flip.
    const wasTrainer = this._isTrainer
    if (wasTrainer) bus.emit('trainerDefeated')

    // Restore the previous __game test API (TownScene's reads).
    if (this._restoreGameApi) this._restoreGameApi()

    this.scene.stop()
    this.scene.resume('Town', { ranFrom: wasTrainer ? 'trainer' : 'wild' })
  }
}
