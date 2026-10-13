import Phaser from 'phaser'
import MapScene from './scenes/MapScene.js'
import EncounterScene from './scenes/EncounterScene.js'
import { applyMapTarget, type MapTarget } from '../../kernel/mapTarget.ts'
import type { BakedMap } from '../../kernel/schema.ts'

// Boot a fresh game on one authored map (#569): the Phaser config plus every
// registry key MapScene reads, in one place. Shared by the two shells that boot
// their own game per map — MapPage (/maps/:slug) and DiscordShell — so a new
// session-stable input can't land in one and go missing in the other (the
// in-game portal path re-targets a running game via applyMapTarget instead).
// `type` is the renderer: AUTO on the web; the Discord webview needs CANVAS
// (WebGL drew but never composited there — spike lesson).
export function bootMapGame(
  parent: HTMLElement,
  session: { type: number; manifest: unknown; npcs: unknown },
  target: MapTarget & { map: BakedMap },
): Phaser.Game {
  const { map } = target
  const game = new Phaser.Game({
    type: session.type,
    parent,
    width: map.cols * 48,
    height: map.rows * 48,
    backgroundColor: '#000000',
    pixelArt: true,
    antialias: false,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    // EncounterScene rides alongside the map so a trainer Zone (#259) can duel
    // in place; it launches paused over MapScene and resumes 'Map' on close.
    scene: [MapScene, EncounterScene],
  })
  // Session-stable inputs for this fresh game (the town keeps these across
  // hops; here each map boots its own game, so set them once at boot).
  game.registry.set('characterManifest', session.manifest)
  game.registry.set('npcs', session.npcs)
  // The per-target keys in one place (#303), shared with the portal path.
  applyMapTarget(game.registry, target)
  return game
}
