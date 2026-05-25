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
//   'enterCommunity'  (communityId: number)
//
// PR-C+ will add: 'openBoard', 'encounter', 'encounterEnded', 'dialogue', ...
const bus = new Phaser.Events.EventEmitter()

export default bus
