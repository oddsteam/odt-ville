import Phaser from 'phaser'

// Shared Phaser → React event bus.
//
// Scenes can emit events the shell cares about (door entry, encounter
// triggered, dialogue requested) without holding a React reference; the
// React host subscribes once on mount and forwards each event to the
// corresponding prop callback. This keeps the Phaser side pure-data and
// avoids the temptation to call into React from a scene.
//
// Events emitted by scenes:
//   'enterCommunity'  (communityId: number) — ungated town door → interior
//   'requestEntry'    ({ communityId, gate }) — gated door: shell runs the gate
//                                               (e.g. posture-login) then enters
//                                               or releases (issue #24)
//   'exitCommunity'   (communityId: number) — interior doormat → town
//   'openBoard'       (boardType)            — interior A on a board
//   'trainerDefeated' ()                     — encounter RUN AWAY (trainer)
//   'perfStall'       ()                     — repeated long frames detected
//                                              (likely a throttling extension)
//
// Events emitted by the React overlay (PR-E onward) so Phaser scenes
// can treat tap/click input identically to keyboard:
//   'dpadPress'   (dir: 'up'|'down'|'left'|'right')
//   'dpadRelease' (dir)
//   'aButton'     ()
const bus = new Phaser.Events.EventEmitter()

export default bus
